-- Migration 0006: 周期记账规则表 (Recurring Rules)
CREATE TABLE IF NOT EXISTS recurring_rules (
    rule_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    ledger_id TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL, -- expense, income, transfer, loan
    amount INTEGER NOT NULL, -- 单位：分 (>= 1)
    category_id TEXT,
    from_account TEXT,
    to_account TEXT,
    remark TEXT,
    frequency TEXT NOT NULL, -- daily, weekly, monthly, yearly
    interval INTEGER NOT NULL DEFAULT 1,
    day_of_month INTEGER,
    day_of_week INTEGER,
    month_of_year INTEGER,
    start_date TEXT NOT NULL,
    end_date TEXT,
    next_run_date TEXT NOT NULL,
    last_run_date TEXT,
    status TEXT NOT NULL DEFAULT 'active', -- active, paused
    auto_record INTEGER NOT NULL DEFAULT 1, -- 1: 自动记账, 0: 到期提醒
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (ledger_id) REFERENCES ledgers(ledger_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_recurring_user ON recurring_rules(user_id, status);
CREATE INDEX IF NOT EXISTS idx_recurring_due ON recurring_rules(status, next_run_date);
