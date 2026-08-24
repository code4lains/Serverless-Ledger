-- Migration: 0005_recovery_code.sql
-- 为用户表增加密码恢复码字段 recovery_code

ALTER TABLE users ADD COLUMN recovery_code TEXT;
