/**
 * License 本地持久化模块
 * 将授权信息以 SHA-256 哈希保护的形式存储在 chrome.storage.local
 *
 * 安全说明：
 * - SALT 是编译期常量，嵌入扩展包中，阻止普通用户直接修改 storage 绕过授权
 * - 非抵抗专业逆向工程（扩展 JS 可被解包），适合防止普通篡改
 * - 24 小时后联网重验证，确保吊销的 License 最终失效
 */

import type { StoredLicenseData } from '../../types/license';

// 编译期防篡改盐值 — 生产环境请替换为随机字符串
const SALT = 'dataplumber-v1-2024-lmns';
const STORAGE_KEY = 'dataplumber_license';

// ── 哈希计算 ──────────────────────────────────────────────────────────────────

/**
 * 使用 Web Crypto API 计算 SHA-256 哈希
 * 可在 Service Worker 中安全使用（无需 DOM）
 */
async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function buildHashInput(
  licenseKey: string,
  deviceId: string,
  tier: string
): string {
  return `${licenseKey}|${deviceId}|${tier}|${SALT}`;
}

// ── 公开 API ──────────────────────────────────────────────────────────────────

/** 计算并持久化 License 数据（含防篡改哈希） */
export async function persistLicense(
  data: Omit<StoredLicenseData, 'hash'>
): Promise<void> {
  const hash = await sha256(buildHashInput(data.licenseKey, data.deviceId, data.tier));
  const stored: StoredLicenseData = { ...data, hash };
  await chrome.storage.local.set({ [STORAGE_KEY]: stored });
}

/** 从 chrome.storage.local 加载已存储的 License 数据 */
export async function loadLicense(): Promise<StoredLicenseData | null> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return (result[STORAGE_KEY] as StoredLicenseData) ?? null;
}

/** 清除本地 License 数据（授权失效时调用） */
export async function clearLicense(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEY);
}

/**
 * 验证本地存储的哈希是否未被篡改
 * 若返回 false，应立即调用 clearLicense() 并提示用户重新激活
 */
export async function verifyLocalHash(data: StoredLicenseData): Promise<boolean> {
  const expected = await sha256(buildHashInput(data.licenseKey, data.deviceId, data.tier));
  return expected === data.hash;
}

/** 更新本地 validatedAt 时间戳（重新联网验证成功后调用） */
export async function refreshValidatedAt(expiresAt: string | null): Promise<void> {
  const stored = await loadLicense();
  if (!stored) return;
  const updated: StoredLicenseData = {
    ...stored,
    validatedAt: Date.now(),
    expiresAt,
  };
  // 重新计算哈希，因为 expiresAt 可能发生变化
  await persistLicense(updated);
}

/** 24 小时内不重复联网验证的缓存策略 */
export const LICENSE_REVALIDATION_INTERVAL_MS = 24 * 60 * 60 * 1000;

export function isLicenseStale(validatedAt: number): boolean {
  return Date.now() - validatedAt > LICENSE_REVALIDATION_INTERVAL_MS;
}
