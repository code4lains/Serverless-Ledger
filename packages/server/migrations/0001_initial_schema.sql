-- Migration: 0001_initial_schema.sql
-- 极简记账 核心数据表结构 (遵循项目技术白皮书第5节 D1 Database Schema)

-- 1. 用户表
CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 2. 账本表
CREATE TABLE IF NOT EXISTS ledgers (
    ledger_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'CNY',
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE
);

-- 3. 分类表 (支持大类/小类二级层级)
CREATE TABLE IF NOT EXISTS categories (
    category_id TEXT PRIMARY KEY,
    user_id TEXT, -- NULL 代表系统预置公共分类
    type TEXT NOT NULL CHECK (type IN ('expense', 'income')),
    parent_id TEXT, -- NULL 为大类，有值为小类
    name TEXT NOT NULL,
    icon TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (parent_id) REFERENCES categories (category_id) ON DELETE CASCADE
);

-- 4. 账单流水表 (核心表，金额为整数分)
CREATE TABLE IF NOT EXISTS transactions (
    transaction_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    ledger_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('expense', 'income', 'transfer', 'loan')),
    amount INTEGER NOT NULL, -- 以“分”为单位存储 (例如 1234 表示 12.34 元)
    category_id TEXT,
    from_account TEXT,
    to_account TEXT,
    transaction_date TEXT NOT NULL,
    remark TEXT,
    sync_status TEXT NOT NULL DEFAULT 'synced',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE,
    FOREIGN KEY (ledger_id) REFERENCES ledgers (ledger_id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories (category_id) ON DELETE SET NULL
);

-- 5. 预算表
CREATE TABLE IF NOT EXISTS budgets (
    budget_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    ledger_id TEXT NOT NULL,
    category_id TEXT, -- NULL 为账本总预算，有值为大分类预算
    period TEXT NOT NULL CHECK (period IN ('monthly', 'yearly')),
    amount INTEGER NOT NULL, -- 预算金额 (分)
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE,
    FOREIGN KEY (ledger_id) REFERENCES ledgers (ledger_id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories (category_id) ON DELETE CASCADE
);

-- 索引优化
CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions (user_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_ledger ON transactions (ledger_id);
CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories (parent_id);
CREATE INDEX IF NOT EXISTS idx_budgets_user_ledger ON budgets (user_id, ledger_id);

-- 预置系统默认基础分类 (大分类与小分类)
-- 支出大类
INSERT OR IGNORE INTO categories (category_id, user_id, type, parent_id, name, icon, sort_order) VALUES
('cat_exp_food', NULL, 'expense', NULL, '餐饮美食', 'Utensils', 10),
('cat_exp_traffic', NULL, 'expense', NULL, '交通出行', 'Car', 20),
('cat_exp_shopping', NULL, 'expense', NULL, '购物消费', 'ShoppingBag', 30),
('cat_exp_entertain', NULL, 'expense', NULL, '休闲娱乐', 'Film', 40),
('cat_exp_housing', NULL, 'expense', NULL, '居住生活', 'Home', 50);

-- 餐饮子分类
INSERT OR IGNORE INTO categories (category_id, user_id, type, parent_id, name, icon, sort_order) VALUES
('cat_exp_food_bf', NULL, 'expense', 'cat_exp_food', '早餐', 'Coffee', 11),
('cat_exp_food_lunch', NULL, 'expense', 'cat_exp_food', '午餐', 'UtensilsCrossed', 12),
('cat_exp_food_dinner', NULL, 'expense', 'cat_exp_food', '晚餐', 'Pizza', 13),
('cat_exp_food_drink', NULL, 'expense', 'cat_exp_food', '饮料零食', 'CupSoda', 14);

-- 交通子分类
INSERT OR IGNORE INTO categories (category_id, user_id, type, parent_id, name, icon, sort_order) VALUES
('cat_exp_tr_metro', NULL, 'expense', 'cat_exp_traffic', '公交地铁', 'Train', 21),
('cat_exp_tr_taxi', NULL, 'expense', 'cat_exp_traffic', '打车出租', 'Navigation', 22),
('cat_exp_tr_gas', NULL, 'expense', 'cat_exp_traffic', '加油充电', 'Fuel', 23);

-- 收入大类与子分类
INSERT OR IGNORE INTO categories (category_id, user_id, type, parent_id, name, icon, sort_order) VALUES
('cat_inc_salary', NULL, 'income', NULL, '职业收入', 'Briefcase', 100),
('cat_inc_invest', NULL, 'income', NULL, '理财收益', 'TrendingUp', 110),
('cat_inc_other', NULL, 'income', NULL, '其他收入', 'Gift', 120);

INSERT OR IGNORE INTO categories (category_id, user_id, type, parent_id, name, icon, sort_order) VALUES
('cat_inc_sal_base', NULL, 'income', 'cat_inc_salary', '基本工资', 'Banknote', 101),
('cat_inc_sal_bonus', NULL, 'income', 'cat_inc_salary', '奖金补贴', 'Coins', 102);
