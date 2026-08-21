import React, { useMemo, useEffect, useState } from 'react';
import { Category, TransactionType } from '@ledger/shared';
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
  // 过滤当前类型 (支出/收入) 的分类
  const filteredCategories = useMemo(() => {
    const targetType = type === 'income' ? 'income' : 'expense';
    return categories.filter((c) => c.type === targetType);
  }, [categories, type]);

  // 大类列表 (parent_id 为空)
  const parentCategories = useMemo(() => {
    return filteredCategories.filter((c) => !c.parent_id);
  }, [filteredCategories]);

  // 小类分组映射 (parent_id -> Category[])
  const subCategoriesMap = useMemo(() => {
    const map = new Map<string, Category[]>();
    for (const c of filteredCategories) {
      if (c.parent_id) {
        if (!map.has(c.parent_id)) {
          map.set(c.parent_id, []);
        }
        map.get(c.parent_id)!.push(c);
      }
    }
    return map;
  }, [filteredCategories]);

  // 当前激活的大分类
  const [activeParentId, setActiveParentId] = useState<string>('');

  // 当选择的分类变化或类型切换时，同步定位所在的大分类
  useEffect(() => {
    if (!selectedCategoryId) {
      if (parentCategories.length > 0) {
        const firstParent = parentCategories[0];
        setActiveParentId(firstParent.category_id);
        onSelectCategory(firstParent.category_id);
      }
      return;
    }

    const currentCat = categories.find((c) => c.category_id === selectedCategoryId);
    if (currentCat) {
      if (currentCat.parent_id) {
        setActiveParentId(currentCat.parent_id);
      } else {
        setActiveParentId(currentCat.category_id);
      }
    } else if (parentCategories.length > 0) {
      const firstParent = parentCategories[0];
      setActiveParentId(firstParent.category_id);
      onSelectCategory(firstParent.category_id);
    }
  }, [selectedCategoryId, type, parentCategories, categories]);

  // 获取当前大类下的所有子分类
  const currentSubCategories = useMemo(() => {
    return subCategoriesMap.get(activeParentId) || [];
  }, [subCategoriesMap, activeParentId]);

  // 点击大分类时的处理
  const handleSelectParent = (parentId: string) => {
    setActiveParentId(parentId);
    // 默认选中该大类自身，或者也可以默认选中该大类的第一个子分类
    const subs = subCategoriesMap.get(parentId) || [];
    if (subs.length > 0) {
      onSelectCategory(subs[0].category_id);
    } else {
      onSelectCategory(parentId);
    }
  };

  return (
    <div className="flex flex-col gap-2.5">
      {/* 1. 一级大分类选择器 (横向滑动/自适应网格) */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
        {parentCategories.map((parent) => {
          const isParentActive = activeParentId === parent.category_id;
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

      {/* 2. 二级子分类选择器 (胶囊 Pills) */}
      {currentSubCategories.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1 border-t border-gray-100 dark:border-neutral-700/50">
          {currentSubCategories.map((sub) => {
            const isSubSelected = selectedCategoryId === sub.category_id;
            return (
              <button
                key={sub.category_id}
                type="button"
                onClick={() => onSelectCategory(sub.category_id)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
                  isSubSelected
                    ? 'bg-neutral-700 dark:bg-neutral-200 text-white dark:text-neutral-900 shadow-xs'
                    : 'bg-gray-100/80 dark:bg-neutral-800 text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
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
