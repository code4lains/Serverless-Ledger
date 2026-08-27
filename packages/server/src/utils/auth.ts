import { sign, verify } from 'hono/jwt';
import { JwtPayload } from '@ledger/shared';

export const DEFAULT_JWT_SECRET = 'serverless-ledger-default-secret-key-2026';
export const TOKEN_EXPIRY_SECONDS = 7 * 24 * 60 * 60; // 7 days

/**
 * 获取或校验 JWT 密钥
 * 在生产环境 (ENVIRONMENT === 'production' 或 NODE_ENV === 'production') 且未配置 JWT_SECRET 时抛出异常
 */
export function getJwtSecret(env?: { JWT_SECRET?: string; ENVIRONMENT?: string }): string {
  const secret = env?.JWT_SECRET;
  if (secret && secret.trim().length > 0) {
    return secret.trim();
  }

  const envName = env?.ENVIRONMENT?.toLowerCase();
  const isDevOrTest = envName === 'development' || envName === 'dev' || envName === 'test' || envName === 'local';
  const isProd = envName === 'production' || envName === 'prod' || (!isDevOrTest && envName !== undefined && envName !== '');

  if (isProd) {
    throw new Error('生产环境未配置 JWT_SECRET 环境变量，禁止使用默认密钥');
  }

  return DEFAULT_JWT_SECRET;
}

/**
 * 使用 Web Crypto API 生成 PBKDF2 密码哈希 (带 Salt)
 * 格式: <salt_hex>:<hash_hex>
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );

  const hashHex = Array.from(new Uint8Array(derivedBits))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const saltHex = Array.from(salt)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return `${saltHex}:${hashHex}`;
}

/**
 * 常数时间字符串比对（防止侧信道时序攻击）
 */
export function timingSafeEqualString(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }

  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);

  const lenA = bufA.length;
  const lenB = bufB.length;
  const maxLen = Math.max(lenA, lenB);

  let mismatch = lenA === lenB ? 0 : 1;

  for (let i = 0; i < maxLen; i++) {
    const byteA = i < lenA ? bufA[i] : 0;
    const byteB = i < lenB ? bufB[i] : 0;
    mismatch |= (byteA ^ byteB);
  }

  return mismatch === 0;
}

/**
 * 校验明文密码与存储的 PBKDF2 哈希是否匹配
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (!storedHash || !storedHash.includes(':')) {
    return false;
  }

  const [saltHex, originalHashHex] = storedHash.split(':');
  if (!saltHex || !originalHashHex || saltHex.length !== 32) {
    return false;
  }

  const salt = new Uint8Array(saltHex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)));
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );

  const hashHex = Array.from(new Uint8Array(derivedBits))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return timingSafeEqualString(hashHex, originalHashHex);
}

/**
 * 签发 JWT Token
 */
export async function generateJwtToken(
  user: { user_id: string; email: string },
  secret: string = DEFAULT_JWT_SECRET,
  expiresInSeconds: number = TOKEN_EXPIRY_SECONDS
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    userId: user.user_id,
    email: user.email,
    exp: now + expiresInSeconds,
    iat: now,
  };
  return await sign(payload, secret, 'HS256');
}

/**
 * 校验并解析 JWT Token
 */
export async function verifyJwtToken(
  token: string,
  secret: string = DEFAULT_JWT_SECRET
): Promise<JwtPayload> {
  const payload = await verify(token, secret, 'HS256');
  return payload as unknown as JwtPayload;
}

