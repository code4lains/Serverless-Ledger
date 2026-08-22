/**
 * Cloudflare Turnstile 人机验证工具
 * 验证接口: https://challenges.cloudflare.com/turnstile/v0/siteverify
 */

export interface TurnstileVerificationResult {
  success: boolean;
  errorCodes?: string[];
  message?: string;
}

export async function verifyTurnstileToken(
  secretKey?: string,
  token?: string,
  remoteIp?: string
): Promise<TurnstileVerificationResult> {
  // 如果环境变量未配置 TURNSTILE_SECRET_KEY (例如本地离线开发或未开启验证)，自动放行
  if (!secretKey) {
    return { success: true };
  }

  // 若已配置 Secret Key，则必须提供验证 Token
  if (!token) {
    return {
      success: false,
      message: '请完成人机安全验证',
    };
  }

  try {
    const formData = new FormData();
    formData.append('secret', secretKey);
    formData.append('response', token);
    if (remoteIp) {
      formData.append('remoteip', remoteIp);
    }

    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData,
    });

    const outcome = (await res.json()) as {
      success: boolean;
      'error-codes'?: string[];
      challenge_ts?: string;
      hostname?: string;
    };

    if (outcome.success) {
      return { success: true };
    }

    return {
      success: false,
      errorCodes: outcome['error-codes'],
      message: '人机安全验证失败或已过期，请重试',
    };
  } catch (err: any) {
    console.error('Turnstile verification request failed:', err);
    return {
      success: false,
      message: '人机验证服务通信异常，请稍后重试',
    };
  }
}
