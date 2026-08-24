import React, { useState, useEffect, useRef } from 'react';
import { X, Mail, Lock, LogIn, UserPlus, AlertCircle, Loader2, ShieldCheck, Ticket, Ban, KeyRound, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { AuthUser } from '@ledger/shared';
import { loginUser, registerUser, getAuthConfig, resetPassword } from '../api/client';

interface AuthModalProps {
  isOpen: boolean;
  closable?: boolean;
  onClose: () => void;
  onSuccess: (user: AuthUser, newRecoveryCode?: string | null) => void;
}

export function AuthModal({ isOpen, closable = true, onClose, onSuccess }: AuthModalProps) {
  const [tab, setTab] = useState<'login' | 'register' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [recoveryCodeInput, setRecoveryCodeInput] = useState('');
  const [regMode, setRegMode] = useState<number>(1); // 0: 禁止注册, 1: 邀请注册模式 (默认), 2: 自由注册
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string>('');

  const turnstileContainerRef = useRef<HTMLDivElement>(null);
  const turnstileWidgetIdRef = useRef<string | null>(null);

  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;

  // 获取服务端注册模式配置
  useEffect(() => {
    if (isOpen) {
      getAuthConfig().then((res) => {
        if (res.success && res.data) {
          setRegMode(res.data.reg_mode);
        }
      });
    }
  }, [isOpen]);

  // 初始化与渲染 Cloudflare Turnstile 验证控件
  useEffect(() => {
    if (!isOpen || !siteKey) return;

    let isMounted = true;

    const renderWidget = () => {
      if (!isMounted || !turnstileContainerRef.current || !window.turnstile) return;

      // 清除前一个实例
      if (turnstileWidgetIdRef.current) {
        try {
          window.turnstile.remove(turnstileWidgetIdRef.current);
        } catch {}
        turnstileWidgetIdRef.current = null;
      }

      setTurnstileToken('');

      try {
        const widgetId = window.turnstile.render(turnstileContainerRef.current, {
          sitekey: siteKey,
          theme: 'auto',
          size: 'flexible',
          callback: (token: string) => {
            if (isMounted) {
              setTurnstileToken(token);
              setErrorMsg('');
            }
          },
          'expired-callback': () => {
            if (isMounted) setTurnstileToken('');
          },
          'error-callback': () => {
            if (isMounted) setTurnstileToken('');
          },
        });
        turnstileWidgetIdRef.current = widgetId;
      } catch (err) {
        console.warn('Turnstile render warning:', err);
      }
    };

    if (window.turnstile) {
      // 延迟一帧等待 DOM 挂载完毕
      const timer = setTimeout(renderWidget, 50);
      return () => clearTimeout(timer);
    } else {
      const scriptId = 'cf-turnstile-script';
      let script = document.getElementById(scriptId) as HTMLScriptElement;
      if (!script) {
        script = document.createElement('script');
        script.id = scriptId;
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        script.defer = true;
        script.onload = () => {
          if (isMounted) renderWidget();
        };
        document.head.appendChild(script);
      } else {
        script.addEventListener('load', renderWidget);
      }
    }

    return () => {
      isMounted = false;
      if (turnstileWidgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(turnstileWidgetIdRef.current);
        } catch {}
        turnstileWidgetIdRef.current = null;
      }
    };
  }, [isOpen, tab, siteKey]);

  if (!isOpen) return null;

  const resetTurnstile = () => {
    if (turnstileWidgetIdRef.current && window.turnstile) {
      try {
        window.turnstile.reset(turnstileWidgetIdRef.current);
      } catch {}
    }
    setTurnstileToken('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setErrorMsg('请输入邮箱地址');
      return;
    }

    if (!password || password.length < 6) {
      setErrorMsg('密码长度不能少于 6 位');
      return;
    }

    if (tab === 'register') {
      if (regMode === 0) {
        setErrorMsg('系统当前未开放注册，仅支持已注册用户登录');
        return;
      }

      if (password !== confirmPassword) {
        setErrorMsg('两次输入的密码不一致');
        return;
      }

      if (regMode === 1 && !inviteCode.trim()) {
        setErrorMsg('当前系统为邀请注册模式，请输入邀请码');
        return;
      }
    }

    if (tab === 'forgot') {
      if (!recoveryCodeInput.trim()) {
        setErrorMsg('请输入 8 位密码恢复码');
        return;
      }

      if (password !== confirmPassword) {
        setErrorMsg('两次输入的密码不一致');
        return;
      }
    }

    if (siteKey && !turnstileToken) {
      setErrorMsg('请先完成人机安全验证');
      return;
    }

    setLoading(true);

    try {
      if (tab === 'login') {
        const res = await loginUser({
          email: trimmedEmail,
          password,
          turnstile_token: turnstileToken || undefined,
        });
        if (res.success && res.data) {
          onSuccess(res.data.user, res.data.new_recovery_code);
          if (closable) onClose();
        } else {
          setErrorMsg(res.error || '登录失败，请检查账号密码');
          resetTurnstile();
        }
      } else if (tab === 'register') {
        const res = await registerUser({
          email: trimmedEmail,
          password,
          invite_code: inviteCode.trim() ? inviteCode.trim().toUpperCase() : undefined,
          turnstile_token: turnstileToken || undefined,
        });
        if (res.success && res.data) {
          onSuccess(res.data.user, res.data.new_recovery_code);
          if (closable) onClose();
        } else {
          setErrorMsg(res.error || '注册失败，请稍后重试');
          resetTurnstile();
        }
      } else if (tab === 'forgot') {
        const res = await resetPassword({
          email: trimmedEmail,
          recovery_code: recoveryCodeInput.trim().toUpperCase(),
          new_password: password,
          turnstile_token: turnstileToken || undefined,
        });
        if (res.success) {
          setSuccessMsg('密码重置成功，请使用新密码登录');
          setPassword('');
          setConfirmPassword('');
          setRecoveryCodeInput('');
          setTab('login');
        } else {
          setErrorMsg(res.error || '密码重置失败，请检查邮箱与恢复码');
          resetTurnstile();
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || '网络请求错误，请稍后重试');
      resetTurnstile();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={() => {
        if (closable) onClose();
      }}
    >
      <div
        className="w-full max-w-sm bg-white dark:bg-neutral-800 rounded-3xl shadow-2xl border border-gray-100 dark:border-neutral-700/80 overflow-hidden transform transition-all animate-modal-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部体验提示条 */}
        <div className="bg-indigo-50/70 dark:bg-indigo-950/40 px-4 py-2.5 border-b border-indigo-100 dark:border-indigo-900/40 flex items-center justify-between text-[11px] text-indigo-700 dark:text-indigo-300">
          <span className="flex items-center gap-1 font-medium">
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-500" />
            <span>登录/注册即可保存记录并同步至云端</span>
          </span>
          {closable && (
            <button
              type="button"
              onClick={onClose}
              className="text-xs text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-200"
            >
              稍后登录
            </button>
          )}
        </div>

        {/* 标题栏与关闭按钮 */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-xs shadow-2xs">
              {tab === 'login' ? (
                <LogIn className="w-4 h-4" />
              ) : tab === 'register' ? (
                <UserPlus className="w-4 h-4" />
              ) : (
                <KeyRound className="w-4 h-4" />
              )}
            </div>
            <h3 className="font-bold text-sm text-gray-900 dark:text-white">
              {tab === 'login' ? '用户登录' : tab === 'register' ? '新用户注册' : '找回密码'}
            </h3>
          </div>
          {closable && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl hover:bg-gray-100 dark:hover:bg-neutral-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Tab 切换 (在找回密码时显示返回登录) */}
        <div className="px-5 pb-2">
          {tab === 'forgot' ? (
            <button
              type="button"
              onClick={() => {
                setTab('login');
                setErrorMsg('');
                setSuccessMsg('');
              }}
              className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 font-medium hover:underline py-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>返回登录界面</span>
            </button>
          ) : (
            <div className="flex bg-gray-100 dark:bg-neutral-900 rounded-xl p-1">
              <button
                type="button"
                onClick={() => {
                  setTab('login');
                  setErrorMsg('');
                  setSuccessMsg('');
                }}
                className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  tab === 'login'
                    ? 'bg-white dark:bg-neutral-800 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
                }`}
              >
                登录
              </button>
              <button
                type="button"
                onClick={() => {
                  setTab('register');
                  setErrorMsg('');
                  setSuccessMsg('');
                }}
                className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  tab === 'register'
                    ? 'bg-white dark:bg-neutral-800 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
                }`}
              >
                注册 {regMode === 1 && '(邀请码)'}
              </button>
            </div>
          )}
        </div>

        {/* 注册关闭提示条 */}
        {tab === 'register' && regMode === 0 && (
          <div className="mx-5 my-1.5 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50 flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300">
            <Ban className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>系统当前暂未开放新用户注册，仅支持已注册用户登录。</span>
          </div>
        )}

        {/* 成功提示 */}
        {successMsg && (
          <div className="mx-5 my-1.5 p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/50 flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* 错误提示 */}
        {errorMsg && (
          <div className="mx-5 my-1.5 p-2.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/50 flex items-center gap-2 text-xs text-red-600 dark:text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* 表单 */}
        <form onSubmit={handleSubmit} className="px-5 pt-2 pb-5 flex flex-col gap-3">
          <div>
            <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">
              邮箱地址
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                <Mail className="w-3.5 h-3.5" />
              </span>
              <input
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full pl-8 pr-3 py-2 text-xs rounded-xl bg-gray-50 dark:bg-neutral-900 border border-transparent focus:border-gray-300 dark:focus:border-neutral-600 focus:outline-none transition-all"
                autoFocus
              />
            </div>
          </div>

          {/* 找回密码时的 8 位恢复码输入框 */}
          {tab === 'forgot' && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400">
                  8 位密码恢复码 <span className="text-red-500">*</span>
                </label>
                <span className="text-[10px] text-gray-400">不区分大小写</span>
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                  <KeyRound className="w-3.5 h-3.5" />
                </span>
                <input
                  type="text"
                  placeholder="如 A8K9M2X7"
                  value={recoveryCodeInput}
                  onChange={(e) => setRecoveryCodeInput(e.target.value.toUpperCase())}
                  required
                  maxLength={12}
                  className="w-full pl-8 pr-3 py-2 text-xs rounded-xl bg-gray-50 dark:bg-neutral-900 border border-transparent focus:border-gray-300 dark:focus:border-neutral-600 focus:outline-none uppercase font-mono tracking-widest transition-all"
                />
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400">
                {tab === 'forgot' ? '新密码 (至少6位)' : '密码 (至少6位)'}
              </label>
              {tab === 'login' && (
                <button
                  type="button"
                  onClick={() => {
                    setTab('forgot');
                    setErrorMsg('');
                    setSuccessMsg('');
                  }}
                  className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  忘记密码？
                </button>
              )}
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                <Lock className="w-3.5 h-3.5" />
              </span>
              <input
                type="password"
                placeholder="••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full pl-8 pr-3 py-2 text-xs rounded-xl bg-gray-50 dark:bg-neutral-900 border border-transparent focus:border-gray-300 dark:focus:border-neutral-600 focus:outline-none transition-all"
              />
            </div>
          </div>

          {(tab === 'register' || tab === 'forgot') && (
            <div>
              <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">
                {tab === 'forgot' ? '确认新密码' : '确认密码'}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                  <Lock className="w-3.5 h-3.5" />
                </span>
                <input
                  type="password"
                  placeholder="••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full pl-8 pr-3 py-2 text-xs rounded-xl bg-gray-50 dark:bg-neutral-900 border border-transparent focus:border-gray-300 dark:focus:border-neutral-600 focus:outline-none transition-all"
                />
              </div>
            </div>
          )}

          {/* 邀请码输入框 (仅在注册模式且 REG_MODE 为 1 或 2 时显示) */}
          {tab === 'register' && regMode !== 0 && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400">
                  邀请码 {regMode === 1 ? <span className="text-red-500">*</span> : <span className="text-gray-400 font-normal">(选填)</span>}
                </label>
                {regMode === 1 && (
                  <span className="text-[10px] text-indigo-600 dark:text-indigo-400">
                    需由老用户提供
                  </span>
                )}
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                  <Ticket className="w-3.5 h-3.5" />
                </span>
                <input
                  type="text"
                  placeholder={regMode === 1 ? '请输入邀请码 (如 INV-XXXXXX)' : '如有邀请码可在此填写'}
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  required={regMode === 1}
                  className="w-full pl-8 pr-3 py-2 text-xs rounded-xl bg-gray-50 dark:bg-neutral-900 border border-transparent focus:border-gray-300 dark:focus:border-neutral-600 focus:outline-none uppercase font-mono tracking-wide transition-all"
                />
              </div>
            </div>
          )}

          {/* Cloudflare Turnstile 人机验证挂载容器 */}
          {siteKey && (
            <div className="flex flex-col gap-1 py-1 items-center justify-center min-h-[65px]">
              <div ref={turnstileContainerRef} className="w-full flex justify-center" />
            </div>
          )}

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading || (tab === 'register' && regMode === 0) || (!!siteKey && !turnstileToken)}
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-md shadow-indigo-600/20 active:scale-[0.98] disabled:opacity-50 transition-all flex items-center justify-center gap-1.5"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>处理中...</span>
                </>
              ) : tab === 'login' ? (
                '登 录'
              ) : tab === 'forgot' ? (
                '重 置 密 码'
              ) : regMode === 0 ? (
                '系统暂停注册'
              ) : (
                '注 册'
              )}
            </button>
          </div>

          <div className="text-center flex items-center justify-center gap-1 text-[10px] text-gray-400">
            <ShieldCheck className="w-3 h-3 text-emerald-500" />
            <span>数据完全私有掌控 · Cloudflare Serverless D1</span>
          </div>
        </form>
      </div>
    </div>
  );
}
