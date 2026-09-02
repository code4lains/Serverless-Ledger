import React, { useState, useEffect } from 'react';
import {
  X,
  Lock,
  Unlock,
  KeyRound,
  ShieldCheck,
  AlertCircle,
  Sparkles,
  ArrowRight,
  RotateCcw,
} from 'lucide-react';
import {
  setupMasterPassword,
  unlockVaultWithPassword,
  unlockVaultWithRecoveryCode,
  changeMasterPassword,
  isVaultInitialized,
} from '../auth/localAuth';

export type VaultModalAction = 'unlock' | 'setup' | 'reset' | 'change';

interface VaultModalProps {
  isOpen: boolean;
  initialAction?: VaultModalAction;
  onClose: () => void;
  onSuccess: (action: VaultModalAction, newRecoveryCode?: string) => void;
  onOpenRecoveryCode?: (code: string) => void;
}

export function VaultModal({
  isOpen,
  initialAction = 'unlock',
  onClose,
  onSuccess,
  onOpenRecoveryCode,
}: VaultModalProps) {
  const [action, setAction] = useState<VaultModalAction>(initialAction);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [oldPassword, setOldPassword] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setAction(initialAction);
    setPassword('');
    setConfirmPassword('');
    setOldPassword('');
    setRecoveryCode('');
    setErrorMsg('');
  }, [isOpen, initialAction]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (action === 'unlock') {
      if (!password) {
        setErrorMsg('请输入保险库主密码');
        return;
      }
      setIsSubmitting(true);
      try {
        const ok = await unlockVaultWithPassword(password);
        if (ok) {
          onSuccess('unlock');
          onClose();
        } else {
          setErrorMsg('主密码错误，请重试');
        }
      } catch (err: any) {
        setErrorMsg(err?.message || '解锁失败');
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    if (action === 'setup') {
      if (password.length < 6) {
        setErrorMsg('主密码长度不能少于 6 位');
        return;
      }
      if (password !== confirmPassword) {
        setErrorMsg('两次输入的密码不一致');
        return;
      }
      setIsSubmitting(true);
      try {
        const res = await setupMasterPassword(password);
        if (res && res.recoveryCode) {
          onSuccess('setup', res.recoveryCode);
          onClose();
          if (onOpenRecoveryCode) {
            onOpenRecoveryCode(res.recoveryCode);
          }
        } else {
          setErrorMsg('初始化保险库失败');
        }
      } catch (err: any) {
        setErrorMsg(err?.message || '初始化保险库异常');
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    if (action === 'change') {
      if (!oldPassword) {
        setErrorMsg('请输入原主密码');
        return;
      }
      if (password.length < 6) {
        setErrorMsg('新密码长度不能少于 6 位');
        return;
      }
      if (password !== confirmPassword) {
        setErrorMsg('两次输入的新密码不一致');
        return;
      }
      setIsSubmitting(true);
      try {
        const ok = await changeMasterPassword(oldPassword, password);
        if (ok) {
          onSuccess('change');
          onClose();
        } else {
          setErrorMsg('修改密码失败');
        }
      } catch (err: any) {
        setErrorMsg(err?.message || '修改密码异常');
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    if (action === 'reset') {
      if (!recoveryCode.trim()) {
        setErrorMsg('请输入 16 位应急恢复凭证');
        return;
      }
      if (password.length < 6) {
        setErrorMsg('新密码长度不能少于 6 位');
        return;
      }
      if (password !== confirmPassword) {
        setErrorMsg('两次输入的新密码不一致');
        return;
      }
      setIsSubmitting(true);
      try {
        const res = await unlockVaultWithRecoveryCode(recoveryCode.trim(), password);
        if (res.success) {
          onSuccess('reset', res.newRecoveryCode);
          onClose();
          if (res.newRecoveryCode && onOpenRecoveryCode) {
            onOpenRecoveryCode(res.newRecoveryCode);
          }
        } else {
          setErrorMsg('恢复凭证验证失败，无法重置密码');
        }
      } catch (err: any) {
        setErrorMsg(err?.message || '重置异常');
      } finally {
        setIsSubmitting(false);
      }
      return;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-100 dark:border-slate-800 p-6 sm:p-7 space-y-5 animate-scale-up">
        {/* 关闭按钮 */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 p-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        {/* 头部图标与标题 */}
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shadow-inner">
            {action === 'unlock' && <Unlock className="w-6 h-6" />}
            {action === 'setup' && <Sparkles className="w-6 h-6" />}
            {action === 'change' && <KeyRound className="w-6 h-6" />}
            {action === 'reset' && <RotateCcw className="w-6 h-6" />}
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              {action === 'unlock' && '解锁本地安全保险库'}
              {action === 'setup' && '初始化本地保险库主密码'}
              {action === 'change' && '修改保险库主密码'}
              {action === 'reset' && '通过恢复凭证重置主密码'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {action === 'unlock' && '输入主密码以解密内存会话密钥'}
              {action === 'setup' && 'PBKDF2 100,000 轮 + AES-256 硬件加密'}
              {action === 'change' && '重新派生加密密钥'}
              {action === 'reset' && '使用 16 位应急凭证直接解密并设置新密码'}
            </p>
          </div>
        </div>

        {/* 错误提示 */}
        {errorMsg && (
          <div className="p-3 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-xs text-red-600 dark:text-red-400 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* 表单主体 */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {action === 'change' && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                当前主密码
              </label>
              <input
                type="password"
                placeholder="请输入当前的主密码"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                autoFocus
              />
            </div>
          )}

          {action === 'reset' && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                16 位应急恢复凭证 (XXXX-XXXX-XXXX-XXXX)
              </label>
              <input
                type="text"
                placeholder="例如: 7K2M-9QNP-4XVT-8WRY"
                value={recoveryCode}
                onChange={(e) => setRecoveryCode(e.target.value.toUpperCase())}
                className="w-full px-3.5 py-2.5 font-mono uppercase tracking-wider rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                autoFocus
              />
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              {action === 'unlock' ? '保险库主密码' : '设置新主密码 (至少 6 位)'}
            </label>
            <input
              type="password"
              placeholder="请输入主密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              autoFocus={action === 'unlock' || action === 'setup'}
            />
          </div>

          {(action === 'setup' || action === 'change' || action === 'reset') && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                确认新主密码
              </label>
              <input
                type="password"
                placeholder="请再次输入新主密码"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          )}

          <div className="pt-2 flex flex-col gap-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 px-4 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-600/20 flex items-center justify-center gap-2 transition disabled:opacity-50"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>
                {isSubmitting
                  ? '处理中...'
                  : action === 'unlock'
                  ? '立即解锁'
                  : action === 'setup'
                  ? '创建并派生密钥'
                  : action === 'change'
                  ? '确认修改密码'
                  : '重置并解锁'}
              </span>
            </button>

            {action === 'unlock' && (
              <button
                type="button"
                onClick={() => setAction('reset')}
                className="py-2 text-xs text-indigo-600 dark:text-indigo-400 hover:underline text-center"
              >
                忘记主密码？使用 16 位应急凭证重置
              </button>
            )}

            {action === 'reset' && (
              <button
                type="button"
                onClick={() => setAction('unlock')}
                className="py-2 text-xs text-slate-500 hover:underline text-center"
              >
                返回主密码解锁
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
