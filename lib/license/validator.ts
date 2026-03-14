/**
 * Lemon Squeezy License API 纯客户端验证模块
 *
 * Infrastructure in progress for the full version. Current MVP uses Stripe for
 * purchase; license activation/validation via Lemon Squeezy is retained for
 * future use.
 *
 * 无后端：直接在 Service Worker 中发起 fetch 调用 LS 公开 License API
 * API 文档：https://docs.lemonsqueezy.com/api/license-api
 */

import type { LSActivateResponse, LSValidateResponse } from '../../types/license';

const LS_API_BASE = 'https://api.lemonsqueezy.com/v1/licenses';

/**
 * 构建 application/x-www-form-urlencoded 请求体
 * Lemon Squeezy License API 要求此格式（非 JSON）
 */
function buildFormBody(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

// ── 激活（首次绑定设备） ───────────────────────────────────────────────────────

/**
 * 激活 License Key，将当前设备注册为一个授权实例
 * 返回的 instance.id 需要持久化，后续验证时使用
 *
 * @param licenseKey 用户输入的 License Key
 * @param instanceName 实例标识（建议 "AQUO-{deviceId前8位}"）
 */
export async function activateLicense(
  licenseKey: string,
  instanceName: string
): Promise<LSActivateResponse> {
  const response = await fetch(`${LS_API_BASE}/activate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: buildFormBody({
      license_key: licenseKey,
      instance_name: instanceName,
    }),
  });

  // LS License API 在 key 不存在时返回 404，body 仍是合法 JSON {activated:false, error:...}
  // 直接解析 JSON 让上层统一处理，避免 throw 破坏 @webext-core/messaging 响应链
  if (!response.ok && response.status !== 404) {
    const text = await response.text().catch(() => 'Unknown error');
    throw new Error(`LS_ACTIVATE_HTTP_${response.status}: ${text}`);
  }

  return response.json() as Promise<LSActivateResponse>;
}

// ── 验证（已激活实例的周期性校验） ────────────────────────────────────────────

/**
 * 验证已激活的 License 实例是否仍然有效
 * 在 24 小时缓存过期后调用
 *
 * @param licenseKey 存储的 License Key
 * @param instanceId 激活时返回的 instance.id
 */
export async function validateLicense(
  licenseKey: string,
  instanceId: string
): Promise<LSValidateResponse> {
  const response = await fetch(`${LS_API_BASE}/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: buildFormBody({
      license_key: licenseKey,
      instance_id: instanceId,
    }),
  });

  if (!response.ok && response.status !== 404) {
    const text = await response.text().catch(() => 'Unknown error');
    throw new Error(`LS_VALIDATE_HTTP_${response.status}: ${text}`);
  }

  return response.json() as Promise<LSValidateResponse>;
}

// ── 停用（可选：用户主动注销设备） ────────────────────────────────────────────

/**
 * 停用当前设备实例，释放一个激活名额
 */
export async function deactivateLicense(
  licenseKey: string,
  instanceId: string
): Promise<boolean> {
  const response = await fetch(`${LS_API_BASE}/deactivate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: buildFormBody({
      license_key: licenseKey,
      instance_id: instanceId,
    }),
  });

  if (!response.ok) return false;
  const data = await response.json() as { deactivated: boolean };
  return data.deactivated;
}
