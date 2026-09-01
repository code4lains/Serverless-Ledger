import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  Mail,
  Lock,
  LogIn,
  UserPlus,
  AlertCircle,
  Loader2,
  ShieldCheck,
  Ticket,
  Ban,
  KeyRound,
  ArrowLeft,
  CheckCircle2,
  Server,
  Settings,
  Globe,
  Wifi,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Check,
  RefreshCw,
  Unlock,
  Shield,
  Key,
} from 'lucide-react';
import { AuthUser, AuthConfig } from '@ledger/shared';
import {
  loginUser,
  registerUser,
  getAuthConfig,
  resetPassword,
  getCustomApiUrl,
  setCustomApiUrl,
  testApiConnection,
  getDisplayApiHost,
} from '../api/client';
import {
  isVaultInitialized,
  isVaultUnlocked,
  setupMasterPassword,
  unlockVault,
  changeMasterPassword,
  resetPasswordWithRecoveryCode,
  validatePasswordStrength,
} from '../auth/localAuth';

export interface AuthModalProps {
  isOpen: boolean;
  closable?: boolean;
  initialTab?: 'vault' | 'cloud';
  initialVaultAction?: 'unlock' | 'setup' | 'reset' | 'change';
  onClose: () => void;
  onSuccess?: (user: AuthUser, newRecoveryCode?: string | null) => void;
  onVaultUnlocked?: () => void;
  onVaultSetupSuccess?: (recoveryCode: string) => void;
}

// 全局单例 Turnstile 脚本加载 Promise
let turnstileScriptPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('Window 未初始化'));
  if (window.turnstile && typeof window.turnstile.render === 'function') {
    return Promise.resolve();
  }
  if (turnstileScriptPromise) {
    return turnstileScriptPromise;
  }

  turnstileScriptPromise = new Promise<void>((resolve, reject) => {
    const scriptId = 'cf-turnstile-script';
    let script = document.getElementById(scriptId) as HTMLScriptElement;
    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }

    const checkReady = () => {
      if (window.turnstile && typeof window.turnstile.render === 'function') {
        resolve();
        return true;
      }
      return false;
    };

    if (checkReady()) return;

    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      if (checkReady()) {
        clearInterval(interval);
      } else if (attempts > 120) {
        clearInterval(interval);
        turnstileScriptPromise = null;
        reject(new Error('Cloudflare Turnstile 验证组件初始化超时，请检查网络'));
      }
    }, 50);

    script.addEventListener('load', () => {
      if (checkReady()) {
        clearInterval(interval);
      }
    });

    script.addEventListener('error', () => {
      clearInterval(interval);
      turnstileScriptPromise = null;
      reject(new Error('Cloudflare Turnstile 验证脚本加载失败，请检查网络连接'));
    });
  });

  return turnstileScriptPromise;
}

function formatTurnstileError(errorCode?: string | number): string {
  const codeStr = String(errorCode || '');
  if (codeStr.includes('110200') || codeStr.includes('domain') || codeStr.includes('hostname')) {
    return '人机验证域名未授权 (110200)：如在手机 App 或本地调试中使用，请在 Cloudflare Turnstile 控制台将【localhost】添加到允许域名列表中。';
  }
  if (codeStr.includes('300030') || codeStr.includes('network') || codeStr.includes('timeout')) {
    return '人机验证网络通信超时，请检查网络连接后重试。';
  }
  if (codeStr.includes('600000') || codeStr.includes('client')) {
    return '人机验证客户端运行环境异常，请点击重试。';
  }
  return `人机安全验证失败 ${codeStr ? `(代码: ${codeStr})` : ''}，请点击重试。`;
}

export function AuthModal({
  isOpen,
  closable = true,
  initialTab = 'vault',
  initialVaultAction = 'unlock',
  onClose,
  onSuccess,
  onVaultUnlocked,
  onVaultSetupSuccess,
}: AuthModalProps) {
  // 主模式切换：'vault' (本地安全保险库) vs 'cloud' (云端同步账号)
  const [mainMode, setMainMode] = useState<'vault' | 'cloud'>(initialTab);

  // 本地保险库状态与操作模式
  const [vaultAction, setVaultAction] = useState<'unlock' | 'setup' | 'reset' | 'change'>(initialVaultAction);
  const [vaultInitialized, setVaultInitialized] = useState<boolean>(false);
  const [vaultOldPassword, setVaultOldPassword] = useState<string>('');
  const [vaultPassword, setVaultPassword] = useState<string>('');
  const [vaultConfirmPassword, setVaultConfirmPassword] = useState<string>('');
  const [vaultRecoveryCode, setVaultRecoveryCode] = useState<string>('');

  // 云端 D1 认证状态
  const [cloudTab, setCloudTab] = useState<'login' | 'register' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [recoveryCodeInput, setRecoveryCodeInput] = useState('');
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  const [regMode, setRegMode] = useState<number>(1); // 0: 禁止注册, 1: 邀请注册模式 (默认), 2: 自由注册
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string>('');
  const [turnstileLoading, setTurnstileLoading] = useState<boolean>(false);
  const [turnstileError, setTurnstileError] = useState<string | null>(null);
  const [turnstileRetryKey, setTurnstileRetryKey] = useState<number>(0);

  // 后端 API 服务器地址配置与连通性测试状态
  const [showServerConfig, setShowServerConfig] = useState<boolean>(false);
  const [serverUrlInput, setServerUrlInput] = useState<string>(() => getCustomApiUrl());
  const [testingServer, setTestingServer] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [configSuccessMsg, setConfigSuccessMsg] = useState<string>('');

  const turnstileContainerRef = useRef<HTMLDivElement>(null);
  const turnstileWidgetIdRef = useRef<string | null>(null);

  // 检测本地保险库初始化状态
  const refreshVaultStatus = useCallback(async () => {
    const initialized = await isVaultInitialized();
    setVaultInitialized(initialized);
    if (!initialized) {
      setVaultAction('setup');
    } else if (initialVaultAction) {
      setVaultAction(initialVaultAction);
    }
  }, [initialVaultAction]);

  useEffect(() => {
    if (isOpen) {
      setMainMode(initialTab);
      refreshVaultStatus();
      setErrorMsg('');
      setSuccessMsg('');
      setVaultPassword('');
      setVaultConfirmPassword('');
      setVaultOldPassword('');
      setVaultRecoveryCode('');
    }
  }, [isOpen, initialTab, refreshVaultStatus]);

  // 动态获取 Site Key
  const effectiveSiteKey = (authConfig?.turnstile_site_key || import.meta.env.VITE_TURNSTILE_SITE_KEY || '').trim();
  const isTurnstileRequired = mainMode === 'cloud' && Boolean(authConfig?.turnstile_enabled || effectiveSiteKey);

  // 获取服务端注册模式与人机验证配置
  const refreshAuthConfig = useCallback(async () => {
    try {
      const res = await getAuthConfig();
      if (res.success && res.data) {
        setAuthConfig(res.data);
        setRegMode(res.data.reg_mode);
      }
    } catch {
      // 保持默认
    }
  }, []);

  useEffect(() => {
    if (isOpen && mainMode === 'cloud') {
      refreshAuthConfig();
    }
  }, [isOpen, mainMode, refreshAuthConfig]);

  // 初始化与渲染 Cloudflare Turnstile 验证控件
  useEffect(() => {
    if (!isOpen || mainMode !== 'cloud' || !effectiveSiteKey) {
      setTurnstileLoading(false);
      setTurnstileError(null);
      return;
    }

    let isMounted = true;
    setTurnstileToken('');
    setTurnstileError(null);
    setTurnstileLoading(true);

    const renderWidget = async () => {
      try {
        await loadTurnstileScript();
        if (!isMounted || !turnstileContainerRef.current || !window.turnstile) return;

        // 清除前一个实例
        if (turnstileWidgetIdRef.current) {
          try {
            window.turnstile.remove(turnstileWidgetIdRef.current);
          } catch {}
          turnstileWidgetIdRef.current = null;
        }

        if (turnstileContainerRef.current) {
          turnstileContainerRef.current.innerHTML = '';
        }

        const widgetId = window.turnstile.render(turnstileContainerRef.current, {
          sitekey: effectiveSiteKey,
          theme: 'auto',
          size: 'flexible',
          retry: 'auto',
          callback: (token: string) => {
            if (isMounted) {
              setTurnstileToken(token);
              setTurnstileLoading(false);
              setTurnstileError(null);
              setErrorMsg('');
            }
          },
          'expired-callback': () => {
            if (isMounted) {
              setTurnstileToken('');
              setTurnstileLoading(false);
            }
          },
          'error-callback': (errorCode?: string | number) => {
            if (isMounted) {
              setTurnstileToken('');
              setTurnstileLoading(false);
              setTurnstileError(formatTurnstileError(errorCode));
            }
          },
          'unsupported-callback': () => {
            if (isMounted) {
              setTurnstileToken('');
              setTurnstileLoading(false);
              setTurnstileError('当前客户端环境不支持 Cloudflare Turnstile 验证');
            }
          },
        });

        turnstileWidgetIdRef.current = widgetId;
        if (isMounted) {
          setTurnstileLoading(false);
        }
      } catch (err: any) {
        if (isMounted) {
          setTurnstileLoading(false);
          setTurnstileError(err?.message || '人机验证组件加载失败，请检查网络连接');
        }
      }
    };

    const timer = setTimeout(renderWidget, 80);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      if (turnstileWidgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(turnstileWidgetIdRef.current);
        } catch {}
        turnstileWidgetIdRef.current = null;
      }
    };
  }, [isOpen, mainMode, cloudTab, effectiveSiteKey, turnstileRetryKey]);

  if (!isOpen) return null;

  const resetTurnstile = () => {
    if (turnstileWidgetIdRef.current && window.turnstile) {
      try {
        window.turnstile.reset(turnstileWidgetIdRef.current);
      } catch {}
    }
    setTurnstileToken('');
  };

  // ====================== 本地保险库表单提交处理 ======================
  const handleVaultSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (vaultAction === 'setup') {
      const check = validatePasswordStrength(vaultPassword);
      if (!check.valid) {
        setErrorMsg(check.message || '主密码长度不能少于 6 位');
        return;
      }
      if (vaultPassword !== vaultConfirmPassword) {
        setErrorMsg('两次输入的主密码不一致');
        return;
      }

      setLoading(true);
      try {
        const res = await setupMasterPassword(vaultPassword);
        setVaultInitialized(true);
        setSuccessMsg('本地端到端安全保险库初始化成功！');
        if (onVaultSetupSuccess) {
          onVaultSetupSuccess(res.recoveryCode);
        }
        if (onVaultUnlocked) {
          onVaultUnlocked();
        }
        if (closable) onClose();
      } catch (err: any) {
        setErrorMsg(err?.message || '保险库初始化失败');
      } finally {
        setLoading(false);
      }
    } else if (vaultAction === 'unlock') {
      if (!vaultPassword) {
        setErrorMsg('请输入保险库主密码');
        return;
      }

      setLoading(true);
      try {
        const unlocked = await unlockVault(vaultPassword);
        if (unlocked) {
          setSuccessMsg('保险库解锁成功！');
          if (onVaultUnlocked) {
            onVaultUnlocked();
          }
          if (closable) onClose();
        } else {
          setErrorMsg('主密码输入错误，AES-GCM 密码学鉴权未通过');
        }
      } catch (err: any) {
        setErrorMsg(err?.message || '解锁保险库失败');
      } finally {
        setLoading(false);
      }
    } else if (vaultAction === 'reset') {
      if (!vaultRecoveryCode.trim()) {
        setErrorMsg('请输入 16 位保险库密码恢复凭证');
        return;
      }
      const check = validatePasswordStrength(vaultPassword);
      if (!check.valid) {
        setErrorMsg(check.message || '新主密码长度不能少于 6 位');
        return;
      }
      if (vaultPassword !== vaultConfirmPassword) {
        setErrorMsg('两次输入的新主密码不一致');
        return;
      }

      setLoading(true);
      try {
        const res = await resetPasswordWithRecoveryCode(vaultRecoveryCode.trim(), vaultPassword);
        if (res.success) {
          setSuccessMsg('主密码重置成功，已重新颁发新恢复凭证！');
          if (onVaultSetupSuccess) {
            onVaultSetupSuccess(res.newRecoveryCode);
          }
          if (onVaultUnlocked) {
            onVaultUnlocked();
          }
          if (closable) onClose();
        }
      } catch (err: any) {
        setErrorMsg(err?.message || '恢复码重置失败，请核对 16 位凭证');
      } finally {
        setLoading(false);
      }
    } else if (vaultAction === 'change') {
      if (!vaultOldPassword) {
        setErrorMsg('请输入当前主密码');
        return;
      }
      const check = validatePasswordStrength(vaultPassword);
      if (!check.valid) {
        setErrorMsg(check.message || '新主密码长度不能少于 6 位');
        return;
      }
      if (vaultPassword !== vaultConfirmPassword) {
        setErrorMsg('两次输入的新主密码不一致');
        return;
      }

      setLoading(true);
      try {
        const changed = await changeMasterPassword(vaultOldPassword, vaultPassword);
        if (changed) {
          setSuccessMsg('主密码变更成功！');
          if (onVaultUnlocked) {
            onVaultUnlocked();
          }
          if (closable) onClose();
        }
      } catch (err: any) {
        setErrorMsg(err?.message || '修改主密码失败');
      } finally {
        setLoading(false);
      }
    }
  };

  // ====================== 云端账号表单提交处理 ======================
  const handleCloudSubmit = async (e: React.FormEvent) => {
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

    if (cloudTab === 'register') {
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

    if (cloudTab === 'forgot') {
      if (!recoveryCodeInput.trim()) {
        setErrorMsg('请输入 8 位密码恢复码');
        return;
      }

      if (password !== confirmPassword) {
        setErrorMsg('两次输入的密码不一致');
        return;
      }
    }

    if (isTurnstileRequired && !turnstileToken) {
      if (!effectiveSiteKey) {
        setErrorMsg('服务端已开启人机验证，但未配置 TURNSTILE_SITE_KEY，请在 Cloudflare Workers 后端环境变量中添加');
      } else {
        setErrorMsg('请先完成人机安全验证');
      }
      return;
    }

    setLoading(true);

    try {
      if (cloudTab === 'login') {
        const res = await loginUser({
          email: trimmedEmail,
          password,
          turnstile_token: turnstileToken || undefined,
        });
        if (res.success && res.data) {
          if (onSuccess) onSuccess(res.data.user, res.data.new_recovery_code);
          if (closable) onClose();
        } else {
          setErrorMsg(res.error || '登录失败，请检查账号密码');
          resetTurnstile();
        }
      } else if (cloudTab === 'register') {
        const res = await registerUser({
          email: trimmedEmail,
          password,
          invite_code: inviteCode.trim() ? inviteCode.trim().toUpperCase() : undefined,
          turnstile_token: turnstileToken || undefined,
        });
        if (res.success && res.data) {
          if (onSuccess) onSuccess(res.data.user, res.data.new_recovery_code);
          if (closable) onClose();
        } else {
          setErrorMsg(res.error || '注册失败，请稍后重试');
          resetTurnstile();
        }
      } else if (cloudTab === 'forgot') {
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
          setCloudTab('login');
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

  const handleTestConnection = async () => {
    setTestingServer(true);
    setTestResult(null);
    try {
      const res = await testApiConnection(serverUrlInput.trim() || undefined);
      if (res.success) {
        setTestResult({
          success: true,
          message: `连接成功！响应延迟: ${res.latencyMs}ms`,
        });
      } else {
        setTestResult({
          success: false,
          message: res.error || '无法连接至该后端地址',
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || '网络连接超时或地址不可达',
      });
    } finally {
      setTestingServer(false);
    }
  };

  const handleSaveServerUrl = () => {
    setCustomApiUrl(serverUrlInput.trim());
    setConfigSuccessMsg('后端服务器地址已保存生效');
    setTimeout(() => setConfigSuccessMsg(''), 3000);
    refreshAuthConfig();
    setTurnstileRetryKey((k) => k + 1);
  };

  const handleResetServerUrl = () => {
    setCustomApiUrl('');
    setServerUrlInput('');
    setTestResult(null);
    setConfigSuccessMsg('已恢复为默认服务器地址');
    setTimeout(() => setConfigSuccessMsg(''), 3000);
    refreshAuthConfig();
    setTurnstileRetryKey((k) => k + 1);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={() => {
        if (closable) onClose();
      }}
    >
      <div
        className="w-full max-w-sm bg-white dark:bg-neutral-800 rounded-3xl shadow-2xl border border-gray-100 dark:border-neutral-700/80 overflow-hidden transform transition-all animate-modal-in max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部主模式切换 Tab: [🛡️ 本地安全保险库] vs [☁️ 云端同步账号] */}
        <div className="bg-gray-100/90 dark:bg-neutral-900/90 p-1.5 border-b border-gray-200/60 dark:border-neutral-700/60 grid grid-cols-2 gap-1 shrink-0">
          <button
            type="button"
            onClick={() => {
              setMainMode('vault');
              setErrorMsg('');
              setSuccessMsg('');
            }}
            className={`py-1.5 px-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              mainMode === 'vault'
                ? 'bg-white dark:bg-neutral-800 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                : 'text-gray-500 hover:text-gray-900 dark:text-gray-400'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>本地安全保险库</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setMainMode('cloud');
              setErrorMsg('');
              setSuccessMsg('');
            }}
            className={`py-1.5 px-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              mainMode === 'cloud'
                ? 'bg-white dark:bg-neutral-800 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                : 'text-gray-500 hover:text-gray-900 dark:text-gray-400'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>云端同步账号</span>
          </button>
        </div>

        {/* 标题栏与关闭按钮 */}
        <div className="flex items-center justify-between px-5 pt-3.5 pb-2 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-xs shadow-2xs">
              {mainMode === 'vault' ? (
                vaultAction === 'unlock' ? (
                  <Unlock className="w-4 h-4" />
                ) : vaultAction === 'setup' ? (
                  <ShieldCheck className="w-4 h-4" />
                ) : (
                  <KeyRound className="w-4 h-4" />
                )
              ) : cloudTab === 'login' ? (
                <LogIn className="w-4 h-4" />
              ) : cloudTab === 'register' ? (
                <UserPlus className="w-4 h-4" />
              ) : (
                <KeyRound className="w-4 h-4" />
              )}
            </div>
            <div>
              <h3 className="font-bold text-sm text-gray-900 dark:text-white">
                {mainMode === 'vault'
                  ? vaultAction === 'setup'
                    ? '设置保险库主密码'
                    : vaultAction === 'unlock'
                    ? '解锁本地安全保险库'
                    : vaultAction === 'reset'
                    ? '使用恢复凭证重置'
                    : '修改保险库主密码'
                  : cloudTab === 'login'
                  ? '用户登录'
                  : cloudTab === 'register'
                  ? '新用户注册'
                  : '找回密码'}
              </h3>
              <p className="text-[10px] text-gray-400">
                {mainMode === 'vault'
                  ? 'AES-GCM-256 端到端加密 · 零知识架构'
                  : 'Cloudflare D1 全球边缘计算 · 多端同步'}
              </p>
            </div>
          </div>
          {closable && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl hover:bg-gray-100 dark:hover:bg-neutral-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* 可滚动内容区域 */}
        <div className="overflow-y-auto flex-1 no-scrollbar">
          {/* ========================================================
              模式 1: 本地安全保险库 (Local Vault)
             ======================================================== */}
          {mainMode === 'vault' && (
            <div className="flex flex-col gap-3">
              {/* 模式提示说明卡片 */}
              <div className="mx-5 p-3 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40 text-[11px] text-indigo-800 dark:text-indigo-300 flex items-start gap-2">
                <Shield className="w-4 h-4 shrink-0 text-indigo-500 mt-0.5" />
                <span className="leading-relaxed">
                  {vaultAction === 'setup'
                    ? '初始化主密码后，所有本地记账数据将由 AES-GCM-256 加密保护，并为您生成 16 位离线应急恢复码。'
                    : vaultAction === 'unlock'
                    ? '请输入主密码解密本地安全保险库，解密密钥仅保留在纯内存会话中。'
                    : vaultAction === 'reset'
                    ? '凭 16 位高熵恢复凭证直接派生解密密钥，重置主密码并生成新恢复码。'
                    : '验证当前旧主密码后重新派生新密钥并更新验证令牌。'}
                </span>
              </div>

              {/* 成功与错误提示 */}
              {successMsg && (
                <div className="mx-5 p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/50 flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{successMsg}</span>
                </div>
              )}

              {errorMsg && (
                <div className="mx-5 p-2.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/50 flex items-start gap-2 text-xs text-red-600 dark:text-red-400">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{errorMsg}</span>
                </div>
              )}

              {/* 本地保险库表单 */}
              <form onSubmit={handleVaultSubmit} className="px-5 pb-5 flex flex-col gap-3">
                {/* 恢复码重置模式下的 16 位恢复凭证输入 */}
                {vaultAction === 'reset' && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400">
                        16 位恢复凭证 <span className="text-red-500">*</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setVaultAction('unlock');
                          setErrorMsg('');
                        }}
                        className="text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                      >
                        返回主密码解锁 ➔
                      </button>
                    </div>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                        <KeyRound className="w-3.5 h-3.5" />
                      </span>
                      <input
                        type="text"
                        placeholder="XXXX-XXXX-XXXX-XXXX"
                        value={vaultRecoveryCode}
                        onChange={(e) => setVaultRecoveryCode(e.target.value.toUpperCase())}
                        required
                        className="w-full pl-8 pr-3 py-2 text-xs rounded-xl bg-gray-50 dark:bg-neutral-900 border border-transparent focus:border-gray-300 dark:focus:border-neutral-600 focus:outline-none uppercase font-mono tracking-widest transition-all"
                        autoFocus
                      />
                    </div>
                  </div>
                )}

                {/* 修改密码模式下的旧主密码输入 */}
                {vaultAction === 'change' && (
                  <div>
                    <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">
                      当前主密码
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                        <Lock className="w-3.5 h-3.5" />
                      </span>
                      <input
                        type="password"
                        placeholder="••••••"
                        value={vaultOldPassword}
                        onChange={(e) => setVaultOldPassword(e.target.value)}
                        required
                        className="w-full pl-8 pr-3 py-2 text-xs rounded-xl bg-gray-50 dark:bg-neutral-900 border border-transparent focus:border-gray-300 dark:focus:border-neutral-600 focus:outline-none transition-all"
                        autoFocus
                      />
                    </div>
                  </div>
                )}

                {/* 主密码 / 新主密码输入 */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400">
                      {vaultAction === 'unlock'
                        ? '主密码'
                        : vaultAction === 'setup'
                        ? '设置主密码 (至少 6 位)'
                        : '设置新主密码 (至少 6 位)'}
                    </label>
                    {vaultAction === 'unlock' && (
                      <button
                        type="button"
                        onClick={() => {
                          setVaultAction('reset');
                          setErrorMsg('');
                        }}
                        className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
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
                      value={vaultPassword}
                      onChange={(e) => setVaultPassword(e.target.value)}
                      required
                      minLength={6}
                      className="w-full pl-8 pr-3 py-2 text-xs rounded-xl bg-gray-50 dark:bg-neutral-900 border border-transparent focus:border-gray-300 dark:focus:border-neutral-600 focus:outline-none transition-all"
                      autoFocus={vaultAction !== 'reset' && vaultAction !== 'change'}
                    />
                  </div>
                </div>

                {/* 确认主密码 (setup / reset / change 模式下需要) */}
                {vaultAction !== 'unlock' && (
                  <div>
                    <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">
                      确认主密码
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                        <Lock className="w-3.5 h-3.5" />
                      </span>
                      <input
                        type="password"
                        placeholder="••••••"
                        value={vaultConfirmPassword}
                        onChange={(e) => setVaultConfirmPassword(e.target.value)}
                        required
                        minLength={6}
                        className="w-full pl-8 pr-3 py-2 text-xs rounded-xl bg-gray-50 dark:bg-neutral-900 border border-transparent focus:border-gray-300 dark:focus:border-neutral-600 focus:outline-none transition-all"
                      />
                    </div>
                  </div>
                )}

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-md shadow-indigo-600/20 active:scale-[0.98] disabled:opacity-50 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>正在进行 PBKDF2 密码学派生...</span>
                      </>
                    ) : vaultAction === 'setup' ? (
                      '初始化保险库并生成恢复凭证'
                    ) : vaultAction === 'unlock' ? (
                      '解 锁 保 险 库'
                    ) : vaultAction === 'reset' ? (
                      '重置主密码并重新颁发凭证'
                    ) : (
                      '确 认 变 更 主 密 码'
                    )}
                  </button>
                </div>

                <div className="text-center flex items-center justify-center gap-1 text-[10px] text-gray-400 pt-1">
                  <ShieldCheck className="w-3 h-3 text-emerald-500" />
                  <span>PBKDF2 100,000 轮迭代 · 纯内存会话密钥</span>
                </div>
              </form>
            </div>
          )}

          {/* ========================================================
              模式 2: 云端同步账号 (Cloud Sync Account - D1)
             ======================================================== */}
          {mainMode === 'cloud' && (
            <div className="flex flex-col gap-2">
              {/* Tab 切换 (在找回密码时显示返回登录) */}
              <div className="px-5 pb-1">
                {cloudTab === 'forgot' ? (
                  <button
                    type="button"
                    onClick={() => {
                      setCloudTab('login');
                      setErrorMsg('');
                      setSuccessMsg('');
                    }}
                    className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 font-medium hover:underline py-1 cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>返回登录界面</span>
                  </button>
                ) : (
                  <div className="flex bg-gray-100 dark:bg-neutral-900 rounded-xl p-1">
                    <button
                      type="button"
                      onClick={() => {
                        setCloudTab('login');
                        setErrorMsg('');
                        setSuccessMsg('');
                      }}
                      className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all cursor-pointer ${
                        cloudTab === 'login'
                          ? 'bg-white dark:bg-neutral-800 text-gray-900 dark:text-white shadow-sm'
                          : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
                      }`}
                    >
                      登录
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCloudTab('register');
                        setErrorMsg('');
                        setSuccessMsg('');
                      }}
                      className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all cursor-pointer ${
                        cloudTab === 'register'
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
              {cloudTab === 'register' && regMode === 0 && (
                <div className="mx-5 my-1 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50 flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300">
                  <Ban className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <span>系统当前暂未开放新用户注册，仅支持已注册用户登录。</span>
                </div>
              )}

              {/* 成功提示 */}
              {successMsg && (
                <div className="mx-5 my-1 p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/50 flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{successMsg}</span>
                </div>
              )}

              {/* 错误提示与快捷排查按钮 */}
              {errorMsg && (
                <div className="mx-5 my-1 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/50 text-xs text-red-600 dark:text-red-400 flex flex-col gap-2">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span className="leading-relaxed">{errorMsg}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowServerConfig(true)}
                    className="self-start text-[11px] font-medium text-red-700 dark:text-red-300 bg-red-100/80 dark:bg-red-900/50 hover:bg-red-200/80 dark:hover:bg-red-800/60 px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <Settings className="w-3 h-3" />
                    <span>配置后端 API 服务器地址</span>
                  </button>
                </div>
              )}

              {/* 后端服务器设置面板 (可折叠) */}
              <div className="mx-5 mb-1 rounded-2xl bg-gray-50 dark:bg-neutral-900/80 border border-gray-200/80 dark:border-neutral-700/60 overflow-hidden transition-all">
                <button
                  type="button"
                  onClick={() => setShowServerConfig(!showServerConfig)}
                  className="w-full px-3.5 py-2 flex items-center justify-between text-left text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100/80 dark:hover:bg-neutral-800/80 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <Server className="w-3.5 h-3.5 text-indigo-500" />
                    <span>后端 API 服务地址配置</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-gray-400 text-[11px]">
                    <span className="max-w-[120px] truncate">{getDisplayApiHost()}</span>
                    {showServerConfig ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </div>
                </button>

                {showServerConfig && (
                  <div className="px-3.5 pt-1 pb-3 border-t border-gray-200/60 dark:border-neutral-700/60 flex flex-col gap-2 text-xs">
                    <div className="text-[11px] text-gray-500 dark:text-gray-400 leading-normal">
                      📱 移动端 App 或本地环境请在此输入 Cloudflare Workers 后端地址：
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400">
                          <Globe className="w-3.5 h-3.5" />
                        </span>
                        <input
                          type="url"
                          placeholder="https://your-api.workers.dev"
                          value={serverUrlInput}
                          onChange={(e) => {
                            setServerUrlInput(e.target.value);
                            setTestResult(null);
                          }}
                          className="w-full pl-8 pr-2.5 py-1.5 text-xs rounded-xl bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 focus:border-indigo-500 focus:outline-none font-mono"
                        />
                      </div>

                      {testResult && (
                        <div
                          className={`p-2 rounded-xl text-[11px] flex items-center gap-1.5 ${
                            testResult.success
                              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40'
                              : 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/40'
                          }`}
                        >
                          {testResult.success ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
                          <span>{testResult.message}</span>
                        </div>
                      )}

                      {configSuccessMsg && (
                        <div className="p-2 rounded-xl text-[11px] bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40 flex items-center gap-1.5">
                          <Check className="w-3.5 h-3.5 shrink-0" />
                          <span>{configSuccessMsg}</span>
                        </div>
                      )}

                      <div className="flex items-center gap-1.5 pt-0.5">
                        <button
                          type="button"
                          disabled={testingServer}
                          onClick={handleTestConnection}
                          className="flex-1 py-1.5 px-2.5 rounded-lg bg-gray-200/80 dark:bg-neutral-700 hover:bg-gray-300/80 dark:hover:bg-neutral-600 font-medium text-[11px] text-gray-700 dark:text-gray-200 flex items-center justify-center gap-1 transition-colors disabled:opacity-50 cursor-pointer"
                        >
                          {testingServer ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Wifi className="w-3 h-3 text-indigo-500" />
                          )}
                          <span>测试连接</span>
                        </button>

                        <button
                          type="button"
                          onClick={handleSaveServerUrl}
                          className="flex-1 py-1.5 px-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-[11px] flex items-center justify-center gap-1 transition-colors cursor-pointer"
                        >
                          <Check className="w-3 h-3" />
                          <span>保存应用</span>
                        </button>

                        {getCustomApiUrl() && (
                          <button
                            type="button"
                            onClick={handleResetServerUrl}
                            title="恢复默认地址"
                            className="py-1.5 px-2 rounded-lg bg-gray-200/80 dark:bg-neutral-700 hover:bg-gray-300/80 dark:hover:bg-neutral-600 text-gray-600 dark:text-gray-300 text-[11px] transition-colors cursor-pointer"
                          >
                            <RotateCcw className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 云端表单 */}
              <form onSubmit={handleCloudSubmit} className="px-5 pt-1 pb-5 flex flex-col gap-3">
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
                {cloudTab === 'forgot' && (
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
                      {cloudTab === 'forgot' ? '新密码 (至少6位)' : '密码 (至少6位)'}
                    </label>
                    {cloudTab === 'login' && (
                      <button
                        type="button"
                        onClick={() => {
                          setCloudTab('forgot');
                          setErrorMsg('');
                          setSuccessMsg('');
                        }}
                        className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
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

                {(cloudTab === 'register' || cloudTab === 'forgot') && (
                  <div>
                    <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">
                      {cloudTab === 'forgot' ? '确认新密码' : '确认密码'}
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

                {/* 邀请码输入框 */}
                {cloudTab === 'register' && regMode !== 0 && (
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

                {/* Cloudflare Turnstile 人机验证 */}
                {isTurnstileRequired && (
                  <div className="flex flex-col gap-1.5 py-1">
                    {effectiveSiteKey ? (
                      <div className="flex flex-col items-center justify-center min-h-[65px] w-full">
                        {turnstileLoading && (
                          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 py-3">
                            <Loader2 className="w-4 h-4 animate-spin text-indigo-600 dark:text-indigo-400" />
                            <span>正在加载人机安全验证...</span>
                          </div>
                        )}

                        <div
                          ref={turnstileContainerRef}
                          className={`w-full flex justify-center ${turnstileLoading ? 'hidden' : ''}`}
                        />

                        {turnstileError && (
                          <div className="w-full p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50 text-[11px] text-amber-700 dark:text-amber-300 flex flex-col gap-1.5 my-1">
                            <div className="flex items-start gap-1.5">
                              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                              <span className="leading-tight">{turnstileError}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setTurnstileRetryKey((k) => k + 1);
                              }}
                              className="self-end px-2 py-0.5 rounded-md bg-amber-200/80 dark:bg-amber-800/60 hover:bg-amber-300/80 text-amber-800 dark:text-amber-200 font-medium text-[10px] flex items-center gap-1 transition-colors cursor-pointer"
                            >
                              <RefreshCw className="w-3 h-3" />
                              <span>重试人机验证</span>
                            </button>
                          </div>
                        )}

                        {turnstileToken && (
                          <div className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 py-0.5">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>人机安全验证已通过</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50 text-[11px] text-amber-700 dark:text-amber-300 flex items-start gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-600" />
                        <span className="leading-tight">
                          当前后端已启用安全验证，但未配置 <code className="px-1 py-0.5 bg-amber-100 dark:bg-amber-900/60 rounded font-mono text-[10px]">TURNSTILE_SITE_KEY</code>。请在 Cloudflare Workers 后端环境变量中添加该公钥。
                        </span>
                      </div>
                    )}
                  </div>
                )}

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={loading || (cloudTab === 'register' && regMode === 0) || (isTurnstileRequired && !turnstileToken)}
                    className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-md shadow-indigo-600/20 active:scale-[0.98] disabled:opacity-50 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>处理中...</span>
                      </>
                    ) : cloudTab === 'login' ? (
                      '登 录'
                    ) : cloudTab === 'forgot' ? (
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
          )}
        </div>
      </div>
    </div>
  );
}

export default AuthModal;
