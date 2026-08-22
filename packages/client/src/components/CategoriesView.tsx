import React, { useState, useMemo } from 'react';
import {
  Plus,
  ArrowUp,
  ArrowDown,
  Edit2,
  Trash2,
  Check,
  ChevronDown,
  ChevronRight,
  FolderPlus,
  Sparkles,
  AlertCircle,
  Tag,
  X,
  Layers,
} from 'lucide-react';
import {
  Category,
  CategoryType,
  CategoryTreeNode,
  buildCategoryTree,
} from '@ledger/shared';
import {
  CategoryIcon,
  CATEGORY_ICON_GROUPS,
  PRESET_CATEGORY_COLORS,
} from './CategoryIcon';
import {
  createCategory,
  updateCategory,
  deleteCategory,
  reorderCategories,
} from '../api/client';

import { AuthUser } from '@ledger/shared';

interface CategoriesViewProps {
  categories: Category[];
  initialType?: CategoryType;
  currentUser?: AuthUser | null;
  onCategoriesChanged: () => Promise<void>;
  onRequireAuth?: () => void;
}

export function CategoriesView({
  categories,
  initialType = 'expense',
  currentUser,
  onCategoriesChanged,
  onRequireAuth,
}: CategoriesViewProps) {
  const [activeTab, setActiveTab] = useState<CategoryType>(initialType);
  const [collapsedParents, setCollapsedParents] = useState<Record<string, boolean>>({});

  // 编辑/新增表单弹窗状态
  const [isEditingFormOpen, setIsEditingFormOpen] = useState<boolean>(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [formName, setFormName] = useState<string>('');
  const [formType, setFormType] = useState<CategoryType>('expense');
  const [formParentId, setFormParentId] = useState<string | null>(null);
  const [formIcon, setFormIcon] = useState<string>('Tag');
  const [formColor, setFormColor] = useState<string | null>(PRESET_CATEGORY_COLORS[0]);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [formError, setFormError] = useState<string>('');

  // 删除确认浮层状态
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // 构建当前类型的分类树
  const categoryTree = useMemo(() => {
    return buildCategoryTree(categories, activeTab);
  }, [categories, activeTab]);

  // 当前类型下的所有大分类（供创建/修改子分类时选择父分类）
  const availableParents = useMemo(() => {
    return categories.filter((c) => c.type === activeTab && !c.parent_id);
  }, [categories, activeTab]);

  // 展开/折叠大分类 (默认折叠)
  const toggleCollapse = (parentId: string) => {
    setCollapsedParents((prev) => ({
      ...prev,
      [parentId]: prev[parentId] !== undefined ? !prev[parentId] : false,
    }));
  };

  // 打开新增分类弹窗
  const handleOpenAdd = (parentId: string | null = null) => {
    if (!currentUser) {
      onRequireAuth?.();
      return;
    }
    setEditingCategory(null);
    setFormName('');
    setFormType(activeTab);
    setFormParentId(parentId);
    setFormIcon(parentId ? 'Tag' : 'Utensils');
    setFormColor(PRESET_CATEGORY_COLORS[Math.floor(Math.random() * PRESET_CATEGORY_COLORS.length)]);
    setFormError('');
    setIsEditingFormOpen(true);
  };

  // 打开编辑分类弹窗
  const handleOpenEdit = (cat: Category) => {
    if (!currentUser) {
      onRequireAuth?.();
      return;
    }
    setEditingCategory(cat);
    setFormName(cat.name);
    setFormType(cat.type);
    setFormParentId(cat.parent_id || null);
    setFormIcon(cat.icon || 'Tag');
    setFormColor(cat.color || PRESET_CATEGORY_COLORS[0]);
    setFormError('');
    setIsEditingFormOpen(true);
  };

  // 提交保存分类
  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setFormError('请输入分类名称');
      return;
    }

    setIsSaving(true);
    setFormError('');

    try {
      if (editingCategory) {
        // 编辑已有分类
        const updated = await updateCategory(editingCategory.category_id, {
          name: formName.trim(),
          icon: formIcon,
          color: formColor,
          parent_id: formParentId,
        });
        if (!updated) {
          setFormError('修改分类失败');
          return;
        }
      } else {
        // 新建自定义分类
        await createCategory({
          type: formType,
          name: formName.trim(),
          icon: formIcon,
          color: formColor,
          parent_id: formParentId,
        });
      }

      await onCategoriesChanged();
      setIsEditingFormOpen(false);
    } catch (err: any) {
      setFormError(err.message || '网络请求错误，请稍后重试');
    } finally {
      setIsSaving(false);
    }
  };

  // 确认删除分类
  const handleConfirmDelete = async () => {
    if (!deletingCategory) return;
    if (!currentUser) {
      setDeletingCategory(null);
      onRequireAuth?.();
      return;
    }
    setIsDeleting(true);
    try {
      const ok = await deleteCategory(deletingCategory.category_id);
      if (ok) {
        await onCategoriesChanged();
        setDeletingCategory(null);
      } else {
        alert('删除分类失败');
      }
    } catch (err: any) {
      alert(err.message || '删除失败，请稍后重试');
    } finally {
      setIsDeleting(false);
    }
  };

  // 分类排序 (上移/下移)
  const handleMove = async (
    list: Category[],
    currentIndex: number,
    direction: 'up' | 'down'
  ) => {
    if (!currentUser) {
      onRequireAuth?.();
      return;
    }
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= list.length) return;

    const newList = [...list];
    const [moved] = newList.splice(currentIndex, 1);
    newList.splice(targetIndex, 0, moved);

    const items = newList.map((cat, idx) => ({
      category_id: cat.category_id,
      sort_order: idx + 1,
    }));

    try {
      const ok = await reorderCategories(items);
      if (ok) {
        await onCategoriesChanged();
      }
    } catch (err) {
      console.error('Reorder categories failed:', err);
    }
  };

  return (
    <div className="flex flex-col gap-4 animate-fadeIn">
      {/* 1. 顶部类型切换 */}
      <div className="flex bg-gray-100 dark:bg-neutral-800/80 p-1 rounded-2xl text-xs font-semibold">
        {(
          [
            { id: 'expense', label: '支出大类' },
            { id: 'income', label: '收入来源' },
            { id: 'transfer', label: '资金转账' },
            { id: 'loan', label: '借贷往来' },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={`flex-1 py-2 rounded-xl transition-all ${
              activeTab === t.id
                ? 'bg-white dark:bg-neutral-700 text-gray-900 dark:text-white shadow-xs'
                : 'text-gray-500 hover:text-gray-800 dark:text-gray-400'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 2. 列表操作栏 */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <Layers className="w-3.5 h-3.5" />
          <span>共 {categoryTree.length} 个大分类</span>
        </div>
        <button
          type="button"
          onClick={() => handleOpenAdd(null)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-xs font-semibold shadow-xs hover:opacity-90 active:scale-95 transition-all"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>新建大分类</span>
        </button>
      </div>

      {/* 3. 分类树形列表 */}
      <div className="flex flex-col gap-3">
        {categoryTree.length === 0 ? (
          <div className="p-10 rounded-3xl bg-white dark:bg-neutral-800 text-center text-xs text-gray-400 border border-gray-100 dark:border-neutral-700">
            暂无分类，点击右上角新建
          </div>
        ) : (
          categoryTree.map((node, parentIdx) => {
            const parent = node.category;
            const isCollapsed = collapsedParents[parent.category_id] ?? true;
            const isCustom = !!parent.user_id;

            return (
              <div
                key={parent.category_id}
                className="rounded-3xl bg-white dark:bg-neutral-800 border border-gray-100 dark:border-neutral-700/80 shadow-xs overflow-hidden transition-all"
              >
                {/* 大分类 Header 行 */}
                <div className="flex items-center justify-between p-3.5 hover:bg-gray-50/60 dark:hover:bg-neutral-750 transition-colors">
                  <div
                    className="flex items-center gap-2.5 flex-1 cursor-pointer select-none"
                    onClick={() => toggleCollapse(parent.category_id)}
                  >
                    <button
                      type="button"
                      className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                    >
                      {isCollapsed ? (
                        <ChevronRight className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>
                    <CategoryIcon
                      icon={parent.icon}
                      color={parent.color || '#3B82F6'}
                      className="w-5 h-5"
                    />
                    <span className="font-bold text-sm text-gray-800 dark:text-gray-100">
                      {parent.name}
                    </span>
                    {isCustom && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-medium">
                        自定义
                      </span>
                    )}
                    <span className="text-[11px] text-gray-400">
                      ({node.children.length} 个子分类)
                    </span>
                  </div>

                  {/* 大分类右侧操作按钮 */}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      title="添加子分类"
                      onClick={() => handleOpenAdd(parent.category_id)}
                      className="p-1.5 rounded-lg text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
                    >
                      <FolderPlus className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      title="上移"
                      disabled={parentIdx === 0}
                      onClick={() =>
                        handleMove(
                          categoryTree.map((n) => n.category),
                          parentIdx,
                          'up'
                        )
                      }
                      className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-30"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      title="下移"
                      disabled={parentIdx === categoryTree.length - 1}
                      onClick={() =>
                        handleMove(
                          categoryTree.map((n) => n.category),
                          parentIdx,
                          'down'
                        )
                      }
                      className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-30"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      title="编辑分类"
                      onClick={() => handleOpenEdit(parent)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-blue-500"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    {isCustom && (
                      <button
                        type="button"
                        title="删除分类"
                        onClick={() => setDeletingCategory(parent)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-500"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* 二级子分类列表 */}
                {!isCollapsed && (
                  <div className="bg-gray-50/70 dark:bg-neutral-900/40 px-4 py-2 flex flex-col gap-1 border-t border-gray-100 dark:border-neutral-700/50">
                    {node.children.length === 0 ? (
                      <div className="py-3 text-center text-xs text-gray-400">
                        暂无子分类，点击上方 ＋ 快速添加
                      </div>
                    ) : (
                      node.children.map((sub, subIdx) => {
                        const isSubCustom = !!sub.user_id;
                        return (
                          <div
                            key={sub.category_id}
                            className="flex items-center justify-between py-2 px-2.5 rounded-xl hover:bg-white dark:hover:bg-neutral-800 transition-colors"
                          >
                            <div className="flex items-center gap-2">
                              <CategoryIcon
                                icon={sub.icon}
                                color={sub.color || parent.color || undefined}
                                className="w-4 h-4"
                              />
                              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                                {sub.name}
                              </span>
                              {isSubCustom && (
                                <span className="text-[9px] px-1 py-0.2 rounded bg-indigo-50 dark:bg-indigo-950/40 text-indigo-500">
                                  自定义
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                title="上移"
                                disabled={subIdx === 0}
                                onClick={() => handleMove(node.children, subIdx, 'up')}
                                className="p-1 rounded text-gray-400 hover:text-gray-600 disabled:opacity-20"
                              >
                                <ArrowUp className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                title="下移"
                                disabled={subIdx === node.children.length - 1}
                                onClick={() => handleMove(node.children, subIdx, 'down')}
                                className="p-1 rounded text-gray-400 hover:text-gray-600 disabled:opacity-20"
                              >
                                <ArrowDown className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                title="编辑"
                                onClick={() => handleOpenEdit(sub)}
                                className="p-1 rounded text-gray-400 hover:text-blue-500"
                              >
                                <Edit2 className="w-3 h-3" />
                              </button>
                              {isSubCustom && (
                                <button
                                  type="button"
                                  title="删除"
                                  onClick={() => setDeletingCategory(sub)}
                                  className="p-1 rounded text-gray-400 hover:text-red-500"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* 4. 删除二次确认浮层 */}
      {deletingCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-fadeIn">
          <div className="w-full max-w-xs bg-white dark:bg-neutral-800 rounded-3xl p-5 shadow-2xl border border-gray-100 dark:border-neutral-700 flex flex-col gap-3">
            <div className="flex items-center gap-2 text-red-600 dark:text-red-400 font-bold text-sm">
              <AlertCircle className="w-4 h-4" />
              <span>确认删除分类？</span>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
              确定要删除「{deletingCategory.name}」吗？
              {!deletingCategory.parent_id && '（该大分类下的所有子分类也将一并清理）'}
            </p>
            <div className="flex gap-2 justify-end pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeletingCategory(null)}
                className="px-3.5 py-1.5 rounded-xl text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-neutral-700 hover:bg-gray-200"
              >
                取消
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="px-3.5 py-1.5 rounded-xl text-xs font-medium text-white bg-red-600 hover:bg-red-700 shadow-xs"
              >
                {isDeleting ? '删除中...' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. 新建 / 编辑分类弹窗 */}
      {isEditingFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-fadeIn">
          <div className="w-full max-w-sm bg-white dark:bg-neutral-800 rounded-3xl shadow-2xl border border-gray-100 dark:border-neutral-700 overflow-hidden flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100 dark:border-neutral-700/60">
              <h3 className="font-bold text-sm text-gray-800 dark:text-gray-100">
                {editingCategory ? '编辑分类' : formParentId ? '添加子分类' : '添加大分类'}
              </h3>
              <button
                type="button"
                onClick={() => setIsEditingFormOpen(false)}
                className="p-1 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveForm} className="p-5 overflow-y-auto flex flex-col gap-4">
              {formError && (
                <div className="p-2.5 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 text-xs flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* 分类名称 */}
              <div>
                <label className="text-[11px] font-medium text-gray-400 mb-1 block">
                  分类名称
                </label>
                <input
                  type="text"
                  required
                  placeholder="例如：餐饮美食、数码科技..."
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs rounded-xl bg-gray-50 dark:bg-neutral-900 border border-transparent focus:border-gray-300 dark:focus:border-neutral-600 focus:outline-none"
                  autoFocus
                />
              </div>

              {/* 所属父大分类 */}
              <div>
                <label className="text-[11px] font-medium text-gray-400 mb-1 block">
                  所属大分类
                </label>
                <select
                  value={formParentId || ''}
                  onChange={(e) => setFormParentId(e.target.value || null)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-gray-50 dark:bg-neutral-900 border border-transparent focus:border-gray-300 dark:focus:border-neutral-600 focus:outline-none cursor-pointer"
                >
                  <option value="">(无，自身作为一级大分类)</option>
                  {availableParents
                    .filter((p) => !editingCategory || p.category_id !== editingCategory.category_id)
                    .map((p) => (
                      <option key={p.category_id} value={p.category_id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </div>

              {/* 莫兰迪个性色彩选择 */}
              <div>
                <label className="text-[11px] font-medium text-gray-400 mb-1.5 block">
                  分类专属色彩
                </label>
                <div className="flex flex-wrap gap-2">
                  {PRESET_CATEGORY_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setFormColor(c)}
                      className={`w-6 h-6 rounded-full transition-transform ${
                        formColor === c ? 'scale-125 ring-2 ring-offset-2 ring-gray-400' : 'hover:scale-110'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              {/* 图标库选择 */}
              <div>
                <label className="text-[11px] font-medium text-gray-400 mb-1.5 block">
                  分类图标 (选中: {formIcon})
                </label>
                <div className="flex flex-col gap-2 max-h-44 overflow-y-auto pr-1">
                  {CATEGORY_ICON_GROUPS.map((group) => (
                    <div key={group.groupName}>
                      <span className="text-[10px] text-gray-400 font-semibold mb-1 block">
                        {group.groupName}
                      </span>
                      <div className="grid grid-cols-6 gap-1.5">
                        {group.icons.map((iconName) => (
                          <button
                            key={iconName}
                            type="button"
                            onClick={() => setFormIcon(iconName)}
                            title={iconName}
                            className={`p-2 rounded-xl flex items-center justify-center transition-all ${
                              formIcon === iconName
                                ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 shadow-xs'
                                : 'bg-gray-50 dark:bg-neutral-900 text-gray-600 dark:text-gray-300 hover:bg-gray-100'
                            }`}
                          >
                            <CategoryIcon icon={iconName} className="w-4 h-4" />
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditingFormOpen(false)}
                  className="flex-1 py-2 rounded-xl text-xs font-semibold bg-gray-100 dark:bg-neutral-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 py-2 rounded-xl text-xs font-semibold bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:opacity-90 shadow-xs disabled:opacity-50"
                >
                  {isSaving ? '保存中...' : '保存'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
