import React, { useState } from 'react';
import {
  ShieldCheck,
  KeyRound,
  Lock,
  Download,
  Copy,
  Check,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  Cloud,
  HardDrive,
  CheckCircle2,
  AlertTriangle,
  X,
} from 'lucide-react';
import { setupMasterPassword } from '../auth/localAuth';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
  onOpenCloudSync?: () => void;
}

export function OnboardingModal({
  isOpen,
  onClose,
  onComplete,
  onOpenCloudSync,
}: OnboardingModalProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [generatedRecoveryCode, setGeneratedRecoveryCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  // 步骤 2 提交：创建本地主密码与派生保险库
  const handleSetupPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      setErrorMsg('主密码长度不能少于 6 位');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('两次输入的密码不一致');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');
    try {
      const res = await setupMasterPassword(password);
      if (res && res.recoveryCode) {
        setGeneratedRecoveryCode(res.recoveryCode);
        setStep(3);
      } else {
        setErrorMsg('创建本地保险库失败');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || '初始化保险库异常');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 复制恢复码
  const handleCopyRecoveryCode = () => {
    if (!generatedRecoveryCode) return;
    navigator.clipboard.writeText(generatedRecoveryCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // 下载恢复码文本文件
  const handleDownloadRecoveryCode = () => {
    if (!generatedRecoveryCode) return;
    const content = `【账盾 - 本地安全保险库 16 位应急恢复凭证】\n\n恢复凭证: ${generatedRecoveryCode}\n生成时间: ${new Date().toLocaleString()}\n\n重要提醒：\n1. 本凭证基于 Web Crypto 端到端密码学技术生成，仅保存在您的本机，系统云端无任何备份。\n2. 若您遗忘了本地主密码，可凭此 16 位恢复凭证直接解密重置主密码。\n3. 请将此文件保存在受信任的安全位置或密码管理器中，切勿泄露给他人。`;

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `账盾_本地保险库恢复凭证_${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleFinish = () => {
    onComplete();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-lg overflow-hidden bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-100 dark:border-slate-800 animate-scale-up">
        {/* 顶部进度条 */}
        <div className="grid grid-cols-4 h-1.5 bg-slate-100 dark:bg-slate-800">
          <div className={`h-full transition-all duration-300 ${step >= 1 ? 'bg-indigo-600' : ''}`} />
          <div className={`h-full transition-all duration-300 ${step >= 2 ? 'bg-indigo-600' : ''}`} />
          <div className={`h-full transition-all duration-300 ${step >= 3 ? 'bg-indigo-600' : ''}`} />
          <div className={`h-full transition-all duration-300 ${step >= 4 ? 'bg-indigo-600' : ''}`} />
        </div>

        {/* 弹窗内容 */}
        <div className="p-6 sm:p-8">
          {/* STEP 1: 欢迎与价值介绍 */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400 mx-auto shadow-inner">
                <Sparkles className="w-8 h-8 animate-pulse" />
              </div>

              <div className="text-center space-y-2">
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                  欢迎使用 账盾
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  本地优先架构，为您提供绝对私密、极速响应的财务记账体验。
                </p>
              </div>

              <div className="space-y-3 pt-2">
                <div className="flex items-start gap-3.5 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                  <HardDrive className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                      100% 本地优先
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      所有数据完整存储于本机 IndexedDB，无网络、无服务器依然秒开且功能全备。
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3.5 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                  <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                      零知识安全保险库
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      PBKDF2 100,000 轮 + AES-GCM-256 硬件加速加密，落盘数据无人可窥视。
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3.5 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                  <Cloud className="w-5 h-5 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                      可选 Cloudflare 边缘同步
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      服务端仅作为可选的加密数据中继，按需在多设备间增量对账。
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="w-1/3 py-3 px-4 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  暂不加密进入
                </button>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="flex-1 py-3 px-4 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-600/20 flex items-center justify-center gap-2 transition"
                >
                  <span>创建本地主密码</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: 设置主密码 */}
          {step === 2 && (
            <form onSubmit={handleSetupPassword} className="space-y-5">
              <div className="text-center space-y-1.5">
                <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400 mx-auto">
                  <KeyRound className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                  设置本地保险库主密码
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                  主密码用于派生 AES-256 密钥以加密本地数据，仅保存在您的设备内存中。
                </p>
              </div>

              {errorMsg && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800/50 flex items-center gap-2.5 text-xs text-rose-600 dark:text-rose-400">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    本地主密码 (至少 6 位)
                  </label>
                  <div className="relative">
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="输入主密码"
                      required
                      autoFocus
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <Lock className="w-4 h-4 text-slate-400 absolute right-3.5 top-3" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    确认主密码
                  </label>
                  <div className="relative">
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="再次输入主密码"
                      required
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <Lock className="w-4 h-4 text-slate-400 absolute right-3.5 top-3" />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="p-2.5 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !password || password.length < 6}
                  className="flex-1 py-3 px-4 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 shadow-md shadow-indigo-600/20 flex items-center justify-center gap-2 transition"
                >
                  {isSubmitting ? (
                    <span>正在生成加密密钥...</span>
                  ) : (
                    <>
                      <span>生成安全保险库</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* STEP 3: 备份 16 位恢复凭证 */}
          {step === 3 && (
            <div className="space-y-5">
              <div className="text-center space-y-1.5">
                <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400 mx-auto">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                  保存您的 16 位应急恢复凭证
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                  如果遗忘主密码，此凭证是<strong>唯一能够解密并找回数据</strong>的方式。
                </p>
              </div>

              {/* 恢复凭证展示卡片 */}
              <div className="p-4 rounded-2xl bg-slate-900 text-emerald-400 font-mono text-center tracking-widest text-lg font-bold border border-emerald-500/20 shadow-inner">
                {generatedRecoveryCode}
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={handleCopyRecoveryCode}
                  className="py-2.5 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center gap-2 transition"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-500" />
                      <span>已复制到剪贴板</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>一键复制凭证</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleDownloadRecoveryCode}
                  className="py-2.5 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center gap-2 transition"
                >
                  <Download className="w-4 h-4" />
                  <span>下载为文本文件</span>
                </button>
              </div>

              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/40 text-xs text-amber-700 dark:text-amber-300">
                ⚠️ 提示：服务端无权也无法获取您的主密码与恢复码，请务必妥善保管。
              </div>

              <button
                type="button"
                onClick={() => setStep(4)}
                className="w-full py-3 px-4 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-600/20 flex items-center justify-center gap-2 transition"
              >
                <span>我已妥善保存，下一步</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* STEP 4: 可选云同步引导与完成 */}
          {step === 4 && (
            <div className="space-y-6 text-center">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400 mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div className="space-y-2">
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white">
                  本地保险库已创建完毕！
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                  您现在可以直接开始记账。后续若需要跨手机、电脑多端同步，可在「我的」页面随时开启 Cloudflare 云端同步。
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 text-left flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Cloud className="w-5 h-5 text-sky-500" />
                  <div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-white">
                      连接 Cloudflare 边缘云同步
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      支持全球边缘低延迟多端实时对账
                    </div>
                  </div>
                </div>
                {onOpenCloudSync && (
                  <button
                    type="button"
                    onClick={() => {
                      onComplete();
                      onOpenCloudSync();
                    }}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-sky-50 dark:bg-sky-950/50 text-sky-600 dark:text-sky-400 hover:bg-sky-100 transition"
                  >
                    去配置
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={handleFinish}
                className="w-full py-3.5 px-4 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-2 transition"
              >
                <span>立即进入账盾记账</span>
                <Sparkles className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
