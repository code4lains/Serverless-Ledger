-- Migration: 0004_invite_codes.sql
-- 增加邀请码表与用户邀请关联 (支持 REG_MODE 环境变量邀请注册机制)

-- 1. 邀请码表
CREATE TABLE IF NOT EXISTS invite_codes (
    code TEXT PRIMARY KEY,
    creator_id TEXT NOT NULL,
    used_by TEXT,
    status TEXT NOT NULL DEFAULT 'unused' CHECK (status IN ('unused', 'used', 'expired')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    used_at TEXT
);

-- 2. 索引优化
CREATE INDEX IF NOT EXISTS idx_invite_codes_creator ON invite_codes (creator_id);
CREATE INDEX IF NOT EXISTS idx_invite_codes_code_status ON invite_codes (code, status);

-- 3. 在用户表中补充 invited_by 字段 (若尚未存在)
ALTER TABLE users ADD COLUMN invited_by TEXT;

-- 4. 预置系统初始创世邀请码 (用于冷启动初始化种子用户与测试)
INSERT OR IGNORE INTO invite_codes (code, creator_id, status) VALUES ('INV-SYSTEM1', 'system_root', 'unused');
INSERT OR IGNORE INTO invite_codes (code, creator_id, status) VALUES ('INV-SYSTEM2', 'system_root', 'unused');
INSERT OR IGNORE INTO invite_codes (code, creator_id, status) VALUES ('INV-WELCOME', 'system_root', 'unused');
INSERT OR IGNORE INTO invite_codes (code, creator_id, status) VALUES ('INV-OFFLINE', 'system_root', 'unused');


