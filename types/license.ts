/**
 * License 授权系统类型定义
 * 支持 JWT 离线验证 + DEV-PASS 开发绕行，纯客户端验证
 */

/** License 当前状态 */
export type LicenseStatus = 'unchecked' | 'checking' | 'valid' | 'invalid' | 'expired';

/** 运行时 License 状态（传递给 UI 的完整信息） */
export interface LicenseState {
  status: LicenseStatus;
  licenseKey: string | null;
  /** Lemon Squeezy 实例 ID（仅旧版 LS API 激活流程，JWT 模式为 null） */
  instanceId: string | null;
  deviceId: string | null;
  /** 授权层级：'basic' | 'pro' | 'dev' */
  tier: string | null;
  validatedAt: number | null;
  expiresAt: string | null;
  customerEmail: string | null;
  productName: string | null;
  errorMessage: string | null;
}

/**
 * 持久化到 chrome.storage.local 的数据结构
 * hash 字段用于防止用户直接篡改 storage 绕过授权
 */
export interface StoredLicenseData {
  licenseKey: string;
  /** Lemon Squeezy 实例 ID（JWT 模式不使用，存储为空字符串） */
  instanceId: string;
  deviceId: string;
  tier: string;
  /** SHA-256(licenseKey + "|" + deviceId + "|" + tier + "|" + SALT) */
  hash: string;
  /** 最后一次成功验证的 Unix 时间戳（毫秒） */
  validatedAt: number;
  /** License 过期时间（ISO 字符串），永久有效时为 null */
  expiresAt: string | null;
}

/** Lemon Squeezy 激活 API 响应结构（保留供参考，JWT 路径不使用） */
export interface LSActivateResponse {
  activated: boolean;
  error: string | null;
  instance: {
    id: string;
    name: string;
    created_at: string;
  } | null;
  license_key: {
    status: string;
    activation_limit: number;
    activation_usage: number;
    expires_at: string | null;
  };
  meta: {
    customer_email: string;
    product_name: string;
  };
}

/** Lemon Squeezy 验证 API 响应结构（保留供参考，JWT 路径不使用） */
export interface LSValidateResponse {
  valid: boolean;
  error: string | null;
  instance: {
    id: string;
    name: string;
  } | null;
  license_key: {
    status: string;
    expires_at: string | null;
  };
  meta: {
    customer_email: string;
    product_name: string;
  };
}
