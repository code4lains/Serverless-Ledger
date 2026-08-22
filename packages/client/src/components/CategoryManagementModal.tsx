import React, { useState, useMemo } from 'react';
import {
  X,
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

interface CategoryManagementModalProps {
  isOpen: boolean;
  categories: Category[];
  initialType?: CategoryType;
  currentUser?: AuthUser | null;
  onClose: () => void;
  onCategoriesChanged: () => Promise<void>;
  onRequireAuth?: () => void;
}

export function CategoryManagementModal({
  isOpen,
  categories,
  initialType = 'expense',
  currentUser,
  onClose,
  onCategoriesChanged,
  onRequireAuth,
}: CategoryManagementModalProps) {
  const [activeTab, setActiveTab] = useState<CategoryType>(initialType);
  const [collapsedParents, setCollapsedParents] = useState<Record<string, boolean>>({});

  // 弹窗编辑/新增表单态
  const [isEditingFormOpen, setIsEditingFormOpen] = useState<boolean>(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [formName, setFormName] = useState<string>('');
  const [formType, setFormType] = useState<CategoryType>('expense');
  const [formParentId, setFormParentId] = useState<string | null>(null);
  const [formIcon, setFormIcon] = useState<string>('Tag');
  const [formColor, setFormColor] = useState<string | null>(PRESET_CATEGORY_COLORS[0]);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [formError, setFormError] = useState<string>('');

  // 删除确认浮层态
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

  if (!isOpen) return null;

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
        // 更新分类
        await updateCategory(editingCategory.category_id, {
          name: formName.trim(),
          icon: formIcon,
          color: formColor,
          parent_id: formParentId,
        });
      } else {
        // 创建分类
        await createCategory({
          name: formName.trim(),
          type: formType,
          parent_id: formParentId,
          icon: formIcon,
          color: formColor,
        });
      }

      await onCategoriesChanged();
      setIsEditingFormOpen(false);
    } catch (err: any) {
      setFormError(err.message || '保存失败，请稍后重试');
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
      await deleteCategory(deletingCategory.category_id);
      await onCategoriesChanged();
      setDeletingCategory(null);
    } catch (err: any) {
      alert(err.message || '删除失败');
    } finally {
      setIsDeleting(false);
    }
  };

  // 调整大分类排序 (上移/下移)
  const handleMoveParent = async (index: number, direction: 'up' | 'down') => {
    if (!currentUser) {
      onRequireAuth?.();
      return;
    }
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= categoryTree.length) return;

    const currentParent = categoryTree[index].category;
    const targetParent = categoryTree[targetIndex].category;

    // 交换两者的 sort_order
    let currentSort = currentParent.sort_order;
    let targetSort = targetParent.sort_order;

    if (currentSort === targetSort) {
      currentSort = index * 10;
      targetSort = targetIndex * 10;
    }

    await reorderCategories([
      { category_id: currentParent.category_id, sort_order: targetSort },
      { category_id: targetParent.category_id, sort_order: currentSort },
    ]);

    await onCategoriesChanged();
  };

  // 调整子分类排序 (上移/下移)
  const handleMoveChild = async (
    parentNode: CategoryTreeNode,
    childIndex: number,
    direction: 'up' | 'down'
  ) => {
    if (!currentUser) {
      onRequireAuth?.();
      return;
    }
    const targetIndex = direction === 'up' ? childIndex - 1 : childIndex + 1;
    if (targetIndex < 0 || targetIndex >= parentNode.children.length) return;

    const currentChild = parentNode.children[childIndex];
    const targetChild = parentNode.children[targetIndex];

    let currentSort = currentChild.sort_order;
    let targetSort = targetChild.sort_order;

    if (currentSort === targetSort) {
      currentSort = childIndex + 1;
      targetSort = targetIndex + 1;
    }

    await reorderCategories([
      { category_id: currentChild.category_id, sort_order: targetSort },
      { category_id: targetChild.category_id, sort_order: currentSort },
    ]);

    await onCategoriesChanged();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white dark:bg-neutral-800 rounded-3xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl border border-gray-100 dark:border-neutral-700/80 overflow-hidden">
        {/* 顶部标题栏 */}
        <div className="flex justify-between items-center px-5 pt-4 pb-3 border-b border-gray-100 dark:border-neutral-700/60">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-sm shadow-xs">
              <Tag className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight text-gray-800 dark:text-gray-100">
                分类管理与排序
              </h2>
              <p className="text-[11px] text-gray-400">支持自定义大类、小类、Icon颜色与排序</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-neutral-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 类型切换 Tab & 新增大分类按钮 */}
        <div className="px-5 pt-3 pb-2 flex items-center justify-between gap-2 border-b border-gray-100 dark:border-neutral-700/40">
          <div className="flex bg-gray-100 dark:bg-neutral-900 rounded-xl p-1 text-xs">
            {([
              { type: 'expense', label: '支出' },
              { type: 'income', label: '收入' },
              { type: 'transfer', label: '转账' },
              { type: 'loan', label: '借贷' },
            ] as const).map(({ type, label }) => (
              <button
                key={type}
                type="button"
                onClick={() => setActiveTab(type)}
                className={`px-3 py-1.5 font-semibold rounded-lg transition-all ${
                  activeTab === type
                    ? 'bg-white dark:bg-neutral-800 text-gray-900 dark:text-white shadow-2xs'
                    : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => handleOpenAdd(null)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs hover:shadow-indigo-500/20 active:scale-95 transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>添加大类</span>
          </button>
        </div>

        {/* 分类层级列表内容区域 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {categoryTree.length === 0 ? (
            <div className="py-12 text-center text-xs text-gray-400 flex flex-col items-center gap-2">
              <Sparkles className="w-8 h-8 text-gray-300 dark:text-neutral-600" />
              <span>该类型下暂无分类，点击右上角添加新分类</span>
            </div>
          ) : (
            categoryTree.map((node, parentIdx) => {
              const parent = node.category;
              const isCollapsed = collapsedParents[parent.category_id] ?? true;
              const isCustomParent = !!parent.user_id;

              return (
                <div
                  key={parent.category_id}
                  className="bg-gray-50/80 dark:bg-neutral-900/60 rounded-2xl border border-gray-100 dark:border-neutral-700/60 overflow-hidden shadow-2xs transition-all"
                >
                  {/* 一级大分类标题栏 */}
                  <div className="p-3 flex items-center justify-between bg-white dark:bg-neutral-800/80">
                    <div
                      onClick={() => toggleCollapse(parent.category_id)}
                      className="flex items-center gap-2.5 flex-1 cursor-pointer select-none"
                    >
                      <button
                        type="button"
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-transform"
                      >
                        {isCollapsed ? (
                          <ChevronRight className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </button>

                      <div
                        className="w-7 h-7 rounded-xl flex items-center justify-center shadow-2xs"
                        style={{
                          backgroundColor: parent.color ? `${parent.color}20` : '#F3F4F6',
                          color: parent.color || '#374151',
                        }}
                      >
                        <CategoryIcon icon={parent.icon} className="w-4 h-4" />
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-gray-800 dark:text-gray-100">
                          {parent.name}
                        </span>
                        {isCustomParent && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 font-medium">
                            自定义
                          </span>
                        )}
                        <span className="text-[10px] text-gray-400 font-normal">
                          ({node.children.length} 个子分类)
                        </span>
                      </div>
                    </div>

                    {/* 大分类操作控件组 (排序、添加子类、编辑、删除) */}
                    <div className="flex items-center gap-1">
                      {/* 上移 */}
                      <button
                        type="button"
                        disabled={parentIdx === 0}
                        onClick={() => handleMoveParent(parentIdx, 'up')}
                        title="上移大分类"
                        className="p-1 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-neutral-700 disabled:opacity-20 transition-all"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>

                      {/* 下移 */}
                      <button
                        type="button"
                        disabled={parentIdx === categoryTree.length - 1}
                        onClick={() => handleMoveParent(parentIdx, 'down')}
                        title="下移大分类"
                        className="p-1 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-neutral-700 disabled:opacity-20 transition-all"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>

                      {/* 添加子分类 */}
                      <button
                        type="button"
                        onClick={() => handleOpenAdd(parent.category_id)}
                        title="添加子分类"
                        className="p-1 rounded-lg text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-gray-100 dark:hover:bg-neutral-700 transition-all"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>

                      {/* 编辑 */}
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(parent)}
                        title="编辑大分类"
                        className="p-1 rounded-lg text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-neutral-700 transition-all"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      {/* 删除 (仅限自定义大类) */}
                      {isCustomParent ? (
                        <button
                          type="button"
                          onClick={() => setDeletingCategory(parent)}
                          title="删除大分类"
                          className="p-1 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-all"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <div className="w-5" />
                      )}
                    </div>
                  </div>

                  {/* 二级子分类列表 (可折叠) */}
                  {!isCollapsed && (
                    <div className="p-2 space-y-1.5 border-t border-gray-100 dark:border-neutral-800">
                      {node.children.length === 0 ? (
                        <div className="py-2 px-3 text-[11px] text-gray-400 flex items-center justify-between">
                          <span>暂无子分类</span>
                          <button
                            type="button"
                            onClick={() => handleOpenAdd(parent.category_id)}
                            className="text-blue-500 hover:underline flex items-center gap-0.5"
                          >
                            <Plus className="w-3 h-3" /> 添加一个
                          </button>
                        </div>
                      ) : (
                        node.children.map((sub, childIdx) => {
                          const isCustomSub = !!sub.user_id;
                          return (
                            <div
                              key={sub.category_id}
                              className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-white dark:bg-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-700/60 border border-gray-100/80 dark:border-neutral-700/40 transition-all"
                            >
                              {/* 子分类图标与名称 */}
                              <div className="flex items-center gap-2">
                                <div
                                  className="w-5 h-5 rounded-lg flex items-center justify-center text-[10px]"
                                  style={{
                                    backgroundColor: sub.color ? `${sub.color}20` : '#F3F4F6',
                                    color: sub.color || '#4B5563',
                                  }}
                                >
                                  <CategoryIcon icon={sub.icon} className="w-3 h-3" />
                                </div>
                                <span className="text-xs font-medium text-gray-700 dark:text-gray-200">
                                  {sub.name}
                                </span>
                                {isCustomSub && (
                                  <span className="text-[9px] px-1 py-0.1 rounded-md bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400">
                                    自定义
                                  </span>
                                )}
                              </div>

                              {/* 子分类操作组 */}
                              <div className="flex items-center gap-0.5">
                                {/* 上移 */}
                                <button
                                  type="button"
                                  disabled={childIdx === 0}
                                  onClick={() => handleMoveChild(node, childIdx, 'up')}
                                  title="上移子分类"
                                  className="p-1 rounded-md text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-neutral-700 disabled:opacity-20 transition-all"
                                >
                                  <ArrowUp className="w-3 h-3" />
                                </button>

                                {/* 下移 */}
                                <button
                                  type="button"
                                  disabled={childIdx === node.children.length - 1}
                                  onClick={() => handleMoveChild(node, childIdx, 'down')}
                                  title="下移子分类"
                                  className="p-1 rounded-md text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-neutral-700 disabled:opacity-20 transition-all"
                                >
                                  <ArrowDown className="w-3 h-3" />
                                </button>

                                {/* 编辑 */}
                                <button
                                  type="button"
                                  onClick={() => handleOpenEdit(sub)}
                                  title="编辑子分类"
                                  className="p-1 rounded-md text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-neutral-700 transition-all"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>

                                {/* 删除 (仅限自定义小类) */}
                                {isCustomSub ? (
                                  <button
                                    type="button"
                                    onClick={() => setDeletingCategory(sub)}
                                    title="删除子分类"
                                    className="p-1 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-all"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                ) : (
                                  <div className="w-4" />
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

        {/* 底部提示 */}
        <div className="px-5 py-2.5 bg-gray-50/90 dark:bg-neutral-900/60 border-t border-gray-100 dark:border-neutral-700/60 flex items-center justify-between text-[11px] text-gray-400">
          <span>提示：点击 ▲ / ▼ 即时生效排序</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs shadow-xs transition-all"
          >
            完成
          </button>
        </div>
      </div>

      {/* ======================= 添加/编辑分类 子弹窗 ======================= */}
      {isEditingFormOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-neutral-800 rounded-3xl w-full max-w-md max-h-[85vh] flex flex-col shadow-2xl border border-gray-100 dark:border-neutral-700 overflow-hidden">
            {/* 弹窗头部 */}
            <div className="flex justify-between items-center px-5 pt-4 pb-3 border-b border-gray-100 dark:border-neutral-700/60">
              <div className="flex items-center gap-2">
                <div
                  className="w-7 h-7 rounded-xl flex items-center justify-center"
                  style={{
                    backgroundColor: formColor ? `${formColor}20` : '#F3F4F6',
                    color: formColor || '#374151',
                  }}
                >
                  <CategoryIcon icon={formIcon} className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100">
                  {editingCategory ? '编辑分类' : formParentId ? '添加子分类' : '添加大分类'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsEditingFormOpen(false)}
                className="p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-neutral-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 表单内容 */}
            <form onSubmit={handleSaveForm} className="flex-1 overflow-y-auto p-5 space-y-4">
              {formError && (
                <div className="p-2.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* 分类名称 */}
              <div>
                <label className="text-[11px] font-medium text-gray-400 mb-1 block">
                  分类名称 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="例如：早餐、咖啡、Switch游戏..."
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs rounded-xl bg-gray-50 dark:bg-neutral-900 border border-transparent focus:border-gray-300 dark:focus:border-neutral-600 focus:outline-none"
                  autoFocus
                />
              </div>

              {/* 所属大类选择 */}
              <div>
                <label className="text-[11px] font-medium text-gray-400 mb-1 block">
                  层级结构
                </label>
                <select
                  value={formParentId || ''}
                  onChange={(e) => setFormParentId(e.target.value ? e.target.value : null)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-gray-50 dark:bg-neutral-900 border border-transparent focus:border-gray-300 dark:focus:border-neutral-600 focus:outline-none"
                >
                  <option value="">作为独立一级大分类 (Top-Level Category)</option>
                  {availableParents.map((p) => (
                    <option key={p.category_id} value={p.category_id}>
                      ↳ 属于大分类：{p.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* 预置色彩选择 */}
              <div>
                <label className="text-[11px] font-medium text-gray-400 mb-1.5 block">
                  个性化强调色
                </label>
                <div className="flex flex-wrap gap-2">
                  {PRESET_CATEGORY_COLORS.map((c) => {
                    const isSelected = formColor === c;
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setFormColor(c)}
                        className="w-6 h-6 rounded-full flex items-center justify-center transition-transform hover:scale-110 relative"
                        style={{ backgroundColor: c }}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5 text-white drop-shadow-xs" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 分组图标选择 */}
              <div>
                <label className="text-[11px] font-medium text-gray-400 mb-1.5 block">
                  图标选择 (当前选择: <span className="text-gray-700 dark:text-gray-200 font-semibold">{formIcon}</span>)
                </label>
                <div className="space-y-3 max-h-48 overflow-y-auto p-2 bg-gray-50 dark:bg-neutral-900/60 rounded-2xl border border-gray-100 dark:border-neutral-800">
                  {CATEGORY_ICON_GROUPS.map((group) => (
                    <div key={group.groupName} className="space-y-1">
                      <div className="text-[10px] font-semibold text-gray-400 px-1">
                        {group.groupName}
                      </div>
                      <div className="grid grid-cols-7 gap-1.5">
                        {group.icons.map((ic) => {
                          const isIconSelected = formIcon === ic;
                          return (
                            <button
                              key={ic}
                              type="button"
                              onClick={() => setFormIcon(ic)}
                              className={`p-2 rounded-xl flex items-center justify-center transition-all ${
                                isIconSelected
                                  ? 'bg-indigo-600 text-white shadow-xs scale-105'
                                  : 'bg-white dark:bg-neutral-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-neutral-700'
                              }`}
                              title={ic}
                            >
                              <CategoryIcon icon={ic} className="w-4 h-4" />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 实时效果预览 */}
              <div className="pt-1">
                <label className="text-[11px] font-medium text-gray-400 mb-1 block">
                  预览效果
                </label>
                <div className="p-3 rounded-2xl bg-gray-50 dark:bg-neutral-900 flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center"
                    style={{
                      backgroundColor: formColor ? `${formColor}25` : '#E5E7EB',
                      color: formColor || '#374151',
                    }}
                  >
                    <CategoryIcon icon={formIcon} className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-gray-800 dark:text-gray-100">
                      {formName || '未命名分类'}
                    </div>
                    <div className="text-[10px] text-gray-400">
                      {formParentId
                        ? `所属大分类：${availableParents.find((p) => p.category_id === formParentId)?.name || '未指定'}`
                        : '一级大分类'}
                    </div>
                  </div>
                </div>
              </div>

              {/* 弹窗底部按钮 */}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditingFormOpen(false)}
                  className="flex-1 py-2 rounded-xl text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-neutral-700 hover:bg-gray-200 transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isSaving || !formName.trim()}
                  className="flex-1 py-2 rounded-xl text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm hover:opacity-90 disabled:opacity-40 transition-all flex items-center justify-center gap-1"
                >
                  {isSaving ? '保存中...' : '保存分类'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================= 删除确认 浮层 ======================= */}
      {deletingCategory && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-neutral-800 rounded-3xl w-full max-w-xs p-5 shadow-2xl border border-gray-100 dark:border-neutral-700 flex flex-col gap-3">
            <div className="flex items-center gap-2 text-red-600 dark:text-red-400 font-bold text-sm">
              <AlertCircle className="w-4 h-4" />
              <span>确认删除此分类？</span>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
              确定要删除分类「<strong>{deletingCategory.name}</strong>」吗？
              {!deletingCategory.parent_id && '（该分类下包含的所有自定义子分类也将一并删除）'}
              <br />
              <span className="text-[11px] text-gray-400">已记账的历史流水不受影响，仍会保留。</span>
            </p>
            <div className="flex gap-2 pt-2 justify-end">
              <button
                type="button"
                onClick={() => setDeletingCategory(null)}
                className="px-3.5 py-1.5 rounded-xl text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-neutral-700 hover:bg-gray-200"
              >
                取消
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="px-3.5 py-1.5 rounded-xl text-xs font-medium text-white bg-red-600 hover:bg-red-700 shadow-sm transition-all"
              >
                {isDeleting ? '删除中...' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
