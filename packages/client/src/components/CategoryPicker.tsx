import React, { useMemo, useEffect, useState } from 'react';
import { Category, TransactionType, buildCategoryTree } from '@ledger/shared';
import { CategoryIcon } from './CategoryIcon';

interface CategoryPickerProps {
  categories: Category[];
  type: TransactionType;
  selectedCategoryId: string;
  onSelectCategory: (categoryId: string) => void;
}

export function CategoryPicker({
  categories,
  type,
  selectedCategoryId,
  onSelectCategory,
}: CategoryPickerProps) {
  const targetType = type;

  // 构建大类及子分类树形结构
  const categoryTree = useMemo(() => {
    return buildCategoryTree(categories, targetType);
  }, [categories, targetType]);

  // 当前激活的大分类 ID
  const [activeParentId, setActiveParentId] = useState<string>('');

  // 同步选中的分类与当前激活的大分类
  useEffect(() => {
    if (categoryTree.length === 0) return;

    if (!selectedCategoryId) {
      const firstTreeItem = categoryTree[0];
      if (firstTreeItem) {
        setActiveParentId(firstTreeItem.category.category_id);
        const defaultChoice = firstTreeItem.children.length > 0
          ? firstTreeItem.children[0].category_id
          : firstTreeItem.category.category_id;
        onSelectCategory(defaultChoice);
      }
      return;
    }

    // 查找选中的分类是哪个大类或其子类
    const current = categories.find((c) => c.category_id === selectedCategoryId);
    if (current) {
      if (current.parent_id) {
        setActiveParentId(current.parent_id);
      } else {
        setActiveParentId(current.category_id);
      }
    } else {
      // 若当前 selectedCategoryId 不在列表中，重置为首个
      const firstTreeItem = categoryTree[0];
      if (firstTreeItem) {
        setActiveParentId(firstTreeItem.category.category_id);
        const defaultChoice = firstTreeItem.children.length > 0
          ? firstTreeItem.children[0].category_id
          : firstTreeItem.category.category_id;
        onSelectCategory(defaultChoice);
      }
    }
  }, [selectedCategoryId, targetType, categoryTree, categories]);

  // 当前激活大类节点
  const currentParentNode = useMemo(() => {
    return categoryTree.find((node) => node.category.category_id === activeParentId) || categoryTree[0];
  }, [categoryTree, activeParentId]);

  // 切换大分类
  const handleSelectParent = (parentId: string) => {
    setActiveParentId(parentId);
    const targetNode = categoryTree.find((n) => n.category.category_id === parentId);
    if (targetNode) {
      if (targetNode.children.length > 0) {
        // 默认选中第一个子分类
        onSelectCategory(targetNode.children[0].category_id);
      } else {
        // 若无子分类则选中大分类自身
        onSelectCategory(targetNode.category.category_id);
      }
    }
  };

  return (
    <div className="flex flex-col gap-2.5">
      {/* 1. 一级大分类横向切换导航 */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
        {categoryTree.map(({ category: parent }) => {
          const isParentActive = currentParentNode?.category.category_id === parent.category_id;
          return (
            <button
              key={parent.category_id}
              type="button"
              onClick={() => handleSelectParent(parent.category_id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl whitespace-nowrap transition-all text-xs font-medium border ${
                isParentActive
                  ? 'bg-gray-800 dark:bg-gray-100 text-white dark:text-gray-900 border-gray-800 dark:border-gray-100 shadow-sm'
                  : 'bg-gray-50 dark:bg-neutral-900 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-neutral-700/80 hover:bg-gray-100 dark:hover:bg-neutral-800'
              }`}
            >
              <CategoryIcon icon={parent.icon} className="w-3.5 h-3.5" />
              <span>{parent.name}</span>
            </button>
          );
        })}
      </div>

      {/* 2. 二级子分类选择区域 (胶囊 Pills 风格) */}
      {currentParentNode && currentParentNode.children.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1 border-t border-gray-100 dark:border-neutral-700/50">
          {currentParentNode.children.map((sub) => {
            const isSubSelected = selectedCategoryId === sub.category_id;
            return (
              <button
                key={sub.category_id}
                type="button"
                onClick={() => onSelectCategory(sub.category_id)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
                  isSubSelected
                    ? 'bg-neutral-800 dark:bg-neutral-200 text-white dark:text-neutral-900 shadow-xs'
                    : 'bg-gray-100/90 dark:bg-neutral-800 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
              >
                <CategoryIcon icon={sub.icon} className="w-3 h-3" />
                <span>{sub.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

