/**
 * @module utils/crypto
 * AES-256-GCM 对称加密，用于将敏感配置（API Key、Token）加密后存入 DB。
 * 密钥从 JWT_SECRET 派生（scrypt），无需额外的 .env 变量。
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LEN = 12;   // GCM 推荐 96-bit nonce
// 固定盐值（公开无妨，安全性来自密钥本身）
const SALT = Buffer.from('dice-soup-secrets-v1');
// 密文格式前缀，用于区分明文和加密值
const ENC_PREFIX = 'enc1:';

/** 从密钥材料（JWT_SECRET）派生 32 字节 AES 密钥 */
function deriveKey(secret: string): Buffer {
  return scryptSync(secret, SALT, 32) as Buffer;
}

/**
 * 加密明文字符串，返回 "enc1:<iv_hex>:<tag_hex>:<cipher_hex>" 格式。
 * @param plaintext 待加密明文
 * @param secret    密钥材料（使用 JWT_SECRET）
 */
export function encryptValue(plaintext: string, secret: string): string {
  const key = deriveKey(secret);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = (cipher as any).getAuthTag() as Buffer;
  return `${ENC_PREFIX}${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

/**
 * 解密 encryptValue() 生成的密文，明文原样返回。
 * @throws 密文格式非法或解密失败时抛出 Error
 */
export function decryptValue(ciphertext: string, secret: string): string {
  if (!ciphertext.startsWith(ENC_PREFIX)) {
    throw new Error(`[crypto] 非加密值（缺少前缀 ${ENC_PREFIX}）`);
  }
  const body = ciphertext.slice(ENC_PREFIX.length);
  const parts = body.split(':');
  if (parts.length !== 3) {
    throw new Error('[crypto] 密文格式错误（期望 3 个冒号分隔段）');
  }
  const [ivHex, tagHex, encHex] = parts;
  const key = deriveKey(secret);
  const iv  = Buffer.from(ivHex,  'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const enc = Buffer.from(encHex, 'hex');
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  (decipher as any).setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

/** 判断一个字符串是否为本模块生成的加密值 */
export function isEncrypted(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(ENC_PREFIX);
}

/**
 * 将 API Key 等机密脱敏后展示（保留末 4 位）。
 * 如果传入的是加密密文，直接返回固定占位符。
 */
export function maskSecret(raw: string): string {
  if (!raw) return '';
  if (raw.startsWith(ENC_PREFIX)) return '••••••••（已加密）';
  if (raw.length <= 8) return '••••••••';
  return '••••' + raw.slice(-4);
}
