import React, { useState } from 'react';
import { X, KeyRound, Copy, Check, Download, ShieldCheck, AlertTriangle } from 'lucide-react';

interface RecoveryCodeModalProps {
  isOpen: boolean;
  recoveryCode: string;
  userEmail?: string;
  title?: string;
  subtitle?: string;
  isVaultCode?: boolean;
  onClose: () => void;
}

export function RecoveryCodeModal({
  isOpen,
  recoveryCode,
  userEmail,
  title,
  subtitle,
  isVaultCode,
  onClose,
}: RecoveryCodeModalProps) {
  const [copied, setCopied] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  if (!isOpen || !recoveryCode) return null;

  const isLocalVault = isVaultCode !== undefined ? isVaultCode : recoveryCode.length >= 16;
  const modalTitle = title || (isLocalVault ? '本地保险库密码恢复凭证' : '账号密码恢复码已生成');
  const modalSubtitle = subtitle || (isLocalVault ? '本地端到端安全保险库重置凭证 · 请妥善保存' : '云端账号唯一密码重置凭证 · 请妥善保存');

  const handleCopy = () => {
    navigator.clipboard.writeText(recoveryCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleDownload = () => {
    const nowStr = new Date().toLocaleString('zh-CN', { hour12: false });
    const content = isLocalVault
      ? `================================================
【账盾】本地安全保险库密码恢复凭证 (Vault Recovery Code)
================================================

保险库标识：default_vault
16位恢复凭证：${recoveryCode}
生成时间：${nowStr}

【安全须知】
1. 当您遗忘本地保险库主密码时，可在保险库解锁界面点击“使用恢复码重置”，输入此 16 位凭证重置主密码。
2. 该恢复凭证直接派生 AES-GCM-256 解密密钥，请妥善保存在安全的离线位置，切勿泄露给他人。
================================================
`
      : `================================================
【账盾】云端账号密码恢复凭证 (Account Recovery Code)
================================================

账号邮箱：${userEmail || '当前账号'}
密码恢复码：${recoveryCode}
生成时间：${nowStr}

【安全须知】
1. 当您遗忘登录密码时，可在登录页面点击“找回密码”，凭此恢复码重置密码（不区分大小写）。
2. 恢复码专属于您的个人账号，请妥善保存在安全位置，切勿泄露给他人。
================================================
`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = isLocalVault ? '账盾_本地保险库恢复凭证.txt' : '账盾_账号密码恢复码.txt';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setDownloaded(true);
    setTimeout(() => setDownloaded(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white dark:bg-neutral-800 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-gray-100 dark:border-neutral-700 flex flex-col gap-5 relative animate-scaleUp">
        {/* 关闭按钮 */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-neutral-700 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* 头部图标与标题 */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <KeyRound className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-900 dark:text-white">
              {modalTitle}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {modalSubtitle}
            </p>
          </div>
        </div>

        {/* 恢复码展示卡片 */}
        <div className="p-4 rounded-2xl bg-gray-50 dark:bg-neutral-900/80 border border-gray-200 dark:border-neutral-700 flex flex-col items-center justify-center gap-2">
          <span className="text-[11px] font-medium text-gray-400 dark:text-gray-500 tracking-wider">
            {isLocalVault ? '16 位保险库高熵恢复凭证' : '8 位密码恢复码（不区分大小写）'}
          </span>
          <div className="font-mono font-black text-xl sm:text-2xl tracking-widest text-indigo-600 dark:text-indigo-400 select-all py-1 text-center break-all">
            {recoveryCode}
          </div>
        </div>

        {/* 安全提示信息 */}
        <div className="p-3.5 rounded-2xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-900/40 flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-300">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500 mt-0.5" />
          <span className="leading-relaxed">
            {isLocalVault
              ? '若未来忘记本地保险库主密码，凭此恢复凭证可在本地离线重置密码。建议立即复制或下载保存至安全的地方。'
              : '若您未来忘记登录密码，可在登录界面凭此恢复码重置密码。建议您立即复制或下载保存。'}
          </span>
        </div>

        {/* 操作按钮区 */}
        <div className="flex flex-col gap-2.5 pt-1">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="py-2.5 px-3 rounded-2xl bg-gray-100 hover:bg-gray-200 dark:bg-neutral-700 dark:hover:bg-neutral-600 text-gray-800 dark:text-gray-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="text-emerald-600 dark:text-emerald-400">已复制到剪贴板</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
                  <span>复制凭证</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleDownload}
              className="py-2.5 px-3 rounded-2xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:hover:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 text-xs font-semibold flex items-center justify-center gap-1.5 border border-indigo-100 dark:border-indigo-900/60 transition-all active:scale-95 cursor-pointer"
            >
              {downloaded ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="text-emerald-600 dark:text-emerald-400">已下载文件</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  <span>下载凭证.txt</span>
                </>
              )}
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs shadow-indigo-500/20 active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>我已妥善保存，继续使用</span>
          </button>
        </div>
      </div>
    </div>
  );
}
