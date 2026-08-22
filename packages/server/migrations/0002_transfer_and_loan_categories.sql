-- Migration: 0002_transfer_and_loan_categories.sql
-- 为极简记账数据库增加转账 (Transfer) 与借贷 (Loan) 预置分类

INSERT OR IGNORE INTO categories (category_id, user_id, type, parent_id, name, icon, sort_order) VALUES
-- 转账大类与小类
('cat_tr_mutual', NULL, 'transfer', NULL, '资金互转', 'ArrowLeftRight', 200),
('cat_tr_internal', NULL, 'transfer', 'cat_tr_mutual', '内部转账', 'Repeat', 201),
('cat_tr_credit', NULL, 'transfer', 'cat_tr_mutual', '信用卡还款', 'CreditCard', 202),
('cat_tr_topup', NULL, 'transfer', 'cat_tr_mutual', '充值提现', 'Download', 203),
('cat_tr_invest', NULL, 'transfer', 'cat_tr_mutual', '理财转存', 'TrendingUp', 204),
('cat_tr_other', NULL, 'transfer', 'cat_tr_mutual', '其他转账', 'ArrowRightLeft', 205),

-- 借贷大类与小类
('cat_loan_main', NULL, 'loan', NULL, '借款贷款', 'Landmark', 300),
('cat_loan_lend', NULL, 'loan', 'cat_loan_main', '借出款项', 'Send', 301),
('cat_loan_borrow', NULL, 'loan', 'cat_loan_main', '借入款项', 'HandCoins', 302),
('cat_loan_repay', NULL, 'loan', 'cat_loan_main', '偿还借款', 'RotateCcw', 303),
('cat_loan_collect', NULL, 'loan', 'cat_loan_main', '收回借款', 'BadgeDollarSign', 304),
('cat_loan_social', NULL, 'loan', 'cat_loan_main', '人情往来', 'Users', 305),
('cat_loan_platform', NULL, 'loan', 'cat_loan_main', '平台借还', 'Smartphone', 306);
