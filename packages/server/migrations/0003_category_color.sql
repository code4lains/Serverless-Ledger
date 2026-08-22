-- Migration: 0003_category_color.sql
-- 为分类表增加个性化颜色字段 color (遵循白皮书 3.2 自定义分类Icon和颜色规范)

ALTER TABLE categories ADD COLUMN color TEXT;
