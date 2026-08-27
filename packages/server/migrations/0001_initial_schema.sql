CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT,
    invited_by TEXT,
    recovery_code TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

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

CREATE TABLE IF NOT EXISTS categories (
    category_id TEXT PRIMARY KEY,
    user_id TEXT,
    type TEXT NOT NULL CHECK (type IN ('expense', 'income', 'transfer', 'loan')),
    parent_id TEXT,
    name TEXT NOT NULL,
    icon TEXT,
    color TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (parent_id) REFERENCES categories (category_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS transactions (
    transaction_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    ledger_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('expense', 'income', 'transfer', 'loan')),
    amount INTEGER NOT NULL,
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

CREATE TABLE IF NOT EXISTS budgets (
    budget_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    ledger_id TEXT NOT NULL,
    category_id TEXT,
    period TEXT NOT NULL CHECK (period IN ('monthly', 'yearly')),
    amount INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE,
    FOREIGN KEY (ledger_id) REFERENCES ledgers (ledger_id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories (category_id) ON DELETE CASCADE,
    UNIQUE (user_id, ledger_id, period, category_id)
);

CREATE TABLE IF NOT EXISTS invite_codes (
    code TEXT PRIMARY KEY,
    creator_id TEXT NOT NULL,
    used_by TEXT,
    status TEXT NOT NULL DEFAULT 'unused' CHECK (status IN ('unused', 'used', 'expired')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    used_at TEXT
);

CREATE TABLE IF NOT EXISTS recurring_rules (
    rule_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    ledger_id TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    amount INTEGER NOT NULL,
    category_id TEXT,
    from_account TEXT,
    to_account TEXT,
    remark TEXT,
    frequency TEXT NOT NULL,
    interval INTEGER NOT NULL DEFAULT 1,
    day_of_month INTEGER,
    day_of_week INTEGER,
    month_of_year INTEGER,
    start_date TEXT NOT NULL,
    end_date TEXT,
    next_run_date TEXT NOT NULL,
    last_run_date TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    auto_record INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (ledger_id) REFERENCES ledgers(ledger_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions (user_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_ledger ON transactions (ledger_id);
CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories (parent_id);
CREATE INDEX IF NOT EXISTS idx_budgets_user_ledger ON budgets (user_id, ledger_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_budgets_user_ledger_period_cat ON budgets (user_id, ledger_id, period, category_id);
CREATE INDEX IF NOT EXISTS idx_invite_codes_creator ON invite_codes (creator_id);
CREATE INDEX IF NOT EXISTS idx_invite_codes_code_status ON invite_codes (code, status);
CREATE INDEX IF NOT EXISTS idx_recurring_user ON recurring_rules (user_id, status);
CREATE INDEX IF NOT EXISTS idx_recurring_due ON recurring_rules (status, next_run_date);

INSERT OR IGNORE INTO categories (category_id, user_id, type, parent_id, name, icon, sort_order) VALUES
('cat_exp_food', NULL, 'expense', NULL, '餐饮美食', 'Utensils', 10),
('cat_exp_food_bf', NULL, 'expense', 'cat_exp_food', '早餐', 'Coffee', 11),
('cat_exp_food_lunch', NULL, 'expense', 'cat_exp_food', '午餐', 'UtensilsCrossed', 12),
('cat_exp_food_dinner', NULL, 'expense', 'cat_exp_food', '晚餐', 'Pizza', 13),
('cat_exp_food_snack', NULL, 'expense', 'cat_exp_food', '饮料零食', 'CupSoda', 14),
('cat_exp_food_grocery', NULL, 'expense', 'cat_exp_food', '买菜食材', 'Carrot', 15),
('cat_exp_food_fruit', NULL, 'expense', 'cat_exp_food', '水果生鲜', 'Apple', 16),
('cat_exp_food_takeout', NULL, 'expense', 'cat_exp_food', '外卖聚餐', 'Utensils', 17),
('cat_exp_traffic', NULL, 'expense', NULL, '交通出行', 'Car', 20),
('cat_exp_tr_metro', NULL, 'expense', 'cat_exp_traffic', '公交地铁', 'Train', 21),
('cat_exp_tr_taxi', NULL, 'expense', 'cat_exp_traffic', '打车出租', 'Navigation', 22),
('cat_exp_tr_gas', NULL, 'expense', 'cat_exp_traffic', '加油充电', 'Fuel', 23),
('cat_exp_tr_parking', NULL, 'expense', 'cat_exp_traffic', '停车过路', 'CircleParking', 24),
('cat_exp_tr_bike', NULL, 'expense', 'cat_exp_traffic', '单车电车', 'Bike', 25),
('cat_exp_tr_flight', NULL, 'expense', 'cat_exp_traffic', '火车机票', 'Plane', 26),
('cat_exp_shopping', NULL, 'expense', NULL, '购物消费', 'ShoppingBag', 30),
('cat_exp_sh_daily', NULL, 'expense', 'cat_exp_shopping', '日用百货', 'Package', 31),
('cat_exp_sh_cloth', NULL, 'expense', 'cat_exp_shopping', '服饰鞋包', 'Shirt', 32),
('cat_exp_sh_digital', NULL, 'expense', 'cat_exp_shopping', '数码家电', 'Smartphone', 33),
('cat_exp_sh_beauty', NULL, 'expense', 'cat_exp_shopping', '美妆护肤', 'Sparkles', 34),
('cat_exp_sh_express', NULL, 'expense', 'cat_exp_shopping', '快递邮寄', 'Truck', 35),
('cat_exp_entertain', NULL, 'expense', NULL, '休闲娱乐', 'Film', 40),
('cat_exp_ent_game', NULL, 'expense', 'cat_exp_entertain', '游戏娱乐', 'Gamepad2', 41),
('cat_exp_ent_sport', NULL, 'expense', 'cat_exp_entertain', '运动健身', 'Dumbbell', 42),
('cat_exp_ent_travel', NULL, 'expense', 'cat_exp_entertain', '旅游度假', 'Plane', 43),
('cat_exp_ent_movie', NULL, 'expense', 'cat_exp_entertain', '电影演出', 'Film', 44),
('cat_exp_ent_party', NULL, 'expense', 'cat_exp_entertain', '聚会社交', 'PartyPopper', 45),
('cat_exp_housing', NULL, 'expense', NULL, '居住生活', 'Home', 50),
('cat_exp_ho_rent', NULL, 'expense', 'cat_exp_housing', '房租物业', 'Building', 51),
('cat_exp_ho_util', NULL, 'expense', 'cat_exp_housing', '水电燃气', 'Zap', 52),
('cat_exp_ho_telecom', NULL, 'expense', 'cat_exp_housing', '宽带话费', 'Wifi', 53),
('cat_exp_ho_furn', NULL, 'expense', 'cat_exp_housing', '家居家装', 'Sofa', 54),
('cat_exp_ho_repair', NULL, 'expense', 'cat_exp_housing', '维修保养', 'Wrench', 55),
('cat_exp_medical', NULL, 'expense', NULL, '医疗保健', 'HeartPulse', 60),
('cat_exp_med_drug', NULL, 'expense', 'cat_exp_medical', '药品购买', 'Pill', 61),
('cat_exp_med_treat', NULL, 'expense', 'cat_exp_medical', '诊疗挂号', 'Stethoscope', 62),
('cat_exp_med_check', NULL, 'expense', 'cat_exp_medical', '体检保健', 'Activity', 63),
('cat_exp_education', NULL, 'expense', NULL, '学习进修', 'GraduationCap', 70),
('cat_exp_edu_book', NULL, 'expense', 'cat_exp_education', '书籍教材', 'BookOpen', 71),
('cat_exp_edu_course', NULL, 'expense', 'cat_exp_education', '培训课程', 'GraduationCap', 72),
('cat_exp_edu_office', NULL, 'expense', 'cat_exp_education', '文具办公', 'PenTool', 73),
('cat_exp_social', NULL, 'expense', NULL, '人情社交', 'Users', 80),
('cat_exp_soc_red', NULL, 'expense', 'cat_exp_social', '礼金红包', 'Gift', 81),
('cat_exp_soc_gift', NULL, 'expense', 'cat_exp_social', '请客送礼', 'HeartHandshake', 82),
('cat_exp_soc_elder', NULL, 'expense', 'cat_exp_social', '孝敬长辈', 'Heart', 83),
('cat_exp_other', NULL, 'expense', NULL, '其他支出', 'HelpCircle', 90),
('cat_exp_oth_loss', NULL, 'expense', 'cat_exp_other', '意外丢失', 'AlertCircle', 91),
('cat_exp_oth_misc', NULL, 'expense', 'cat_exp_other', '其它消费', 'Tag', 92),
('cat_inc_salary', NULL, 'income', NULL, '职业收入', 'Briefcase', 100),
('cat_inc_sal_base', NULL, 'income', 'cat_inc_salary', '基本工资', 'Banknote', 101),
('cat_inc_sal_bonus', NULL, 'income', 'cat_inc_salary', '奖金补贴', 'Coins', 102),
('cat_inc_sal_part', NULL, 'income', 'cat_inc_salary', '兼职副业', 'Laptop', 103),
('cat_inc_sal_annual', NULL, 'income', 'cat_inc_salary', '年终分红', 'Award', 104),
('cat_inc_invest', NULL, 'income', NULL, '理财收益', 'TrendingUp', 110),
('cat_inc_inv_stock', NULL, 'income', 'cat_inc_invest', '基金股票', 'LineChart', 111),
('cat_inc_inv_interest', NULL, 'income', 'cat_inc_invest', '利息分红', 'PiggyBank', 112),
('cat_inc_inv_rent', NULL, 'income', 'cat_inc_invest', '房租收益', 'Building2', 113),
('cat_inc_inv_claim', NULL, 'income', 'cat_inc_invest', '保险理赔', 'ShieldCheck', 114),
('cat_inc_other', NULL, 'income', NULL, '其他收入', 'Gift', 120),
('cat_inc_oth_red', NULL, 'income', 'cat_inc_other', '收到红包', 'Gift', 121),
('cat_inc_oth_refund', NULL, 'income', 'cat_inc_other', '退款返还', 'RotateCcw', 122),
('cat_inc_oth_second', NULL, 'income', 'cat_inc_other', '闲置二手', 'Store', 123),
('cat_inc_oth_windfall', NULL, 'income', 'cat_inc_other', '意外所得', 'Sparkles', 124),
('cat_inc_oth_misc', NULL, 'income', 'cat_inc_other', '其它入账', 'Tag', 125),
('cat_tr_mutual', NULL, 'transfer', NULL, '资金互转', 'ArrowLeftRight', 200),
('cat_tr_internal', NULL, 'transfer', 'cat_tr_mutual', '内部转账', 'Repeat', 201),
('cat_tr_credit', NULL, 'transfer', 'cat_tr_mutual', '信用卡还款', 'CreditCard', 202),
('cat_tr_topup', NULL, 'transfer', 'cat_tr_mutual', '充值提现', 'Download', 203),
('cat_tr_invest', NULL, 'transfer', 'cat_tr_mutual', '理财转存', 'TrendingUp', 204),
('cat_tr_other', NULL, 'transfer', 'cat_tr_mutual', '其他转账', 'ArrowRightLeft', 205),
('cat_loan_main', NULL, 'loan', NULL, '借款贷款', 'Landmark', 300),
('cat_loan_lend', NULL, 'loan', 'cat_loan_main', '借出款项', 'Send', 301),
('cat_loan_borrow', NULL, 'loan', 'cat_loan_main', '借入款项', 'HandCoins', 302),
('cat_loan_repay', NULL, 'loan', 'cat_loan_main', '偿还借款', 'RotateCcw', 303),
('cat_loan_collect', NULL, 'loan', 'cat_loan_main', '收回借款', 'BadgeDollarSign', 304),
('cat_loan_social', NULL, 'loan', 'cat_loan_main', '人情往来', 'Users', 305),
('cat_loan_platform', NULL, 'loan', 'cat_loan_main', '平台借还', 'Smartphone', 306);

INSERT OR IGNORE INTO invite_codes (code, creator_id, status) VALUES 
('INV-SYSTEM1', 'system_root', 'unused'),
('INV-SYSTEM2', 'system_root', 'unused'),
('INV-WELCOME', 'system_root', 'unused'),
('INV-OFFLINE', 'system_root', 'unused');

