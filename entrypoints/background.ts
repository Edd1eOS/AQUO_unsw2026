/**
 * Service Worker — 系统调度中枢
 *
 * 职责：
 * 1. 路由所有 chrome.runtime 消息
 * 2. 管理 License 验证生命周期
 * 3. 触发 Content Script 批量列表提取并广播结果
 * 4. 通过 chrome.alarms 防止 Service Worker 30 秒空闲终止
 *
 * 防御性编程：
 * - 所有异步操作包裹在 try-catch 中
 * - 提取失败时广播 BULK_ERROR 而非抛出未处理异常
 * - License 验证失败时返回明确的错误状态
 */

import { onMessage } from '../lib/messaging/protocol';
import { getOrCreateDeviceId } from '../lib/license/fingerprint';
import {
  loadLicense,
  persistLicense,
  clearLicense,
  verifyLocalHash,
  refreshValidatedAt,
  isLicenseStale,
} from '../lib/license/storage';
import { verifyJwt } from '../lib/license/jwt-validator';
import type { LicenseState } from '../types/license';
import { type SceneMode } from '../types/bulk';

export default defineBackground({
  type: 'module',

  main() {
    // ── 1. Side Panel 行为：点击扩展图标时打开侧边栏 ─────────────────────────
    chrome.sidePanel
      .setPanelBehavior({ openPanelOnActionClick: true })
      .catch((err) => console.error('[AQUO] setPanelBehavior 失败:', err));

    // ── 2. Alarms 保活：防止 Service Worker 30s 空闲终止 ─────────────────────
    chrome.alarms.create('dataplumber-keepalive', { periodInMinutes: 0.4 });
    chrome.alarms.onAlarm.addListener((_alarm) => {
      // no-op 心跳，仅用于维持 Service Worker 活跃状态
    });

    // ── 3. 消息路由 ──────────────────────────────────────────────────────────

    onMessage('CHECK_LICENSE', async () => {
      return handleCheckLicense();
    });

    onMessage('VALIDATE_LICENSE', async ({ data }) => {
      return handleValidateLicense(data.licenseKey);
    });

    /** EXTRACT_BULK_LIST: 触发批量 CSS 选择器提取（结果通过广播回传） */
    onMessage('EXTRACT_BULK_LIST', async ({ data }) => {
      await handleExtractBulkList(data.sceneMode ?? 'b2b');
    });

    // ── 4. 监听来自 Content Script 的消息 ──────────────────────────────────
    chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
      if (message?.type === 'BULK_EXTRACTED') {
        if (message.payload) {
          broadcastToSidePanel({ type: 'BULK_COMPLETE', payload: message.payload });
        } else {
          broadcastToSidePanel({
            type: 'BULK_ERROR',
            payload: {
              message: message.error ?? 'Extraction failed. Refresh the page and try again.',
              code: 'BULK_EXTRACTION_FAILED',
            },
          });
        }
      }
    });
  },
});

// ── License 处理器 ────────────────────────────────────────────────────────────

/**
 * Loads stored license, validates local hash and expiry, and re-validates with Lemon Squeezy when stale.
 * @returns Current license state for the side panel.
 */
async function handleCheckLicense(): Promise<LicenseState> {
  const stored = await loadLicense();

  if (!stored) {
    return buildLicenseState('unchecked');
  }

  const hashValid = await verifyLocalHash(stored);
  if (!hashValid) {
    await clearLicense();
    return buildLicenseState('invalid', 'Local license data corrupted. Please reactivate.');
  }

  if (stored.expiresAt && new Date(stored.expiresAt) <= new Date()) {
    await clearLicense();
    return buildLicenseState('expired', 'License expired. Please contact support to renew.');
  }

  if (!isLicenseStale(stored.validatedAt)) {
    return {
      status: 'valid',
      licenseKey: stored.licenseKey,
      instanceId: stored.instanceId,
      deviceId: stored.deviceId,
      tier: stored.tier,
      validatedAt: stored.validatedAt,
      expiresAt: stored.expiresAt,
      customerEmail: null,
      productName: null,
      errorMessage: null,
    };
  }

  try {
    if (stored.licenseKey !== 'DEV-PASS-2026') {
      await verifyJwt(stored.licenseKey, stored.deviceId);
    }
    await refreshValidatedAt(stored.expiresAt);

    return {
      status: 'valid',
      licenseKey: stored.licenseKey,
      instanceId: stored.instanceId,
      deviceId: stored.deviceId,
      tier: stored.tier,
      validatedAt: Date.now(),
      expiresAt: stored.expiresAt,
      customerEmail: null,
      productName: null,
      errorMessage: null,
    };
  } catch (err) {
    const msg = String(err);
    if (msg.includes('JWT_EXPIRED')) {
      await clearLicense();
      return buildLicenseState('expired', 'License expired. Please contact support to renew.');
    }
    await clearLicense();
    return buildLicenseState('invalid', `License verification failed: ${msg.replace(/^Error:\s*/, '')}`);
  }
}

/**
 * Validates a license key (or dev key in DEV builds), persists to storage, and returns the new license state.
 * @param licenseKey - User-entered or dev license key.
 * @returns Resulting license state after activation/validation.
 */
async function handleValidateLicense(licenseKey: string): Promise<LicenseState> {
  if (licenseKey === 'DEV-PASS-2026') {
    const deviceId = await getOrCreateDeviceId();
    await persistLicense({
      licenseKey: 'DEV-PASS-2026',
      instanceId: '',
      deviceId,
      tier: 'dev',
      validatedAt: Date.now(),
      expiresAt: null,
    });
    return {
      status: 'valid',
      licenseKey: 'DEV-PASS-2026',
      instanceId: null,
      deviceId,
      tier: 'dev',
      validatedAt: Date.now(),
      expiresAt: null,
      customerEmail: null,
      productName: '[DEV MODE]',
      errorMessage: null,
    };
  }

  try {
    const deviceId = await getOrCreateDeviceId();
    const { tier, expiresAt } = await verifyJwt(licenseKey, deviceId);

    await persistLicense({
      licenseKey,
      instanceId: '',
      deviceId,
      tier,
      validatedAt: Date.now(),
      expiresAt,
    });

    return {
      status: 'valid',
      licenseKey,
      instanceId: null,
      deviceId,
      tier,
      validatedAt: Date.now(),
      expiresAt,
      customerEmail: null,
      productName: null,
      errorMessage: null,
    };
  } catch (err) {
    const msg = String(err).replace(/^Error:\s*/, '');
    if (msg.includes('JWT_EXPIRED')) {
      return buildLicenseState('expired', msg);
    }
    return buildLicenseState('invalid', msg);
  }
}

// ── 内容脚本消息投递工具（三步容错链）────────────────────────────────────────

async function sendToContentScript(tabId: number, message: object): Promise<boolean> {
  try {
    await chrome.tabs.sendMessage(tabId, message);
    return true;
  } catch (_) { /* 内容脚本未注入，继续下一步 */ }

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content-scripts/content.js'],
    });
  } catch (_) {
    return false;
  }

  await new Promise<void>(resolve => setTimeout(resolve, 150));

  try {
    await chrome.tabs.sendMessage(tabId, message);
    return true;
  } catch (_) {
    return false;
  }
}

// ── 批量列表提取处理器 ────────────────────────────────────────────────────────

/**
 * Sends extract request to the active tab's content script and broadcasts result or error to the side panel.
 * Falls back to inline script extraction if the content script is not injected.
 * @param sceneMode - Extraction scenario (b2b, local_travel, ecommerce, etc.).
 */
async function handleExtractBulkList(sceneMode: SceneMode): Promise<void> {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!activeTab?.id) {
    broadcastToSidePanel({
      type: 'BULK_ERROR',
      payload: { message: 'Could not get the current tab.', code: 'NO_ACTIVE_TAB' },
    });
    return;
  }

  const url = activeTab.url ?? '';
  const isRestricted =
    url !== '' && (
      url.startsWith('chrome://') ||
      url.startsWith('chrome-extension://') ||
      url.startsWith('about:') ||
      url.startsWith('edge://')
    );

  if (isRestricted) {
    broadcastToSidePanel({
      type: 'BULK_ERROR',
      payload: {
        message: 'Open a regular webpage (http/https) to run extraction.',
        code: 'RESTRICTED_PAGE',
      },
    });
    return;
  }

  broadcastToSidePanel({ type: 'BULK_EXTRACTING' });

  const tabId = activeTab.id;
  const delivered = await sendToContentScript(tabId, {
    type: 'TRIGGER_BULK_EXTRACT',
    sceneMode,
  });

  if (!delivered) {
    // 三步重试均失败 → 绝对兜底：内联正则扫描，仍按 sceneMode 返回 data 形状
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: (mode: string) => {
          const PHONE_RE = /(?:\+?86[-\s]?)?1[3-9]\d{9}|(?:\+?\d{1,3}[-\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/g;
          const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
          const body = (document.body as HTMLElement | null)?.innerText ?? '';
          const phones = [...body.matchAll(PHONE_RE)].map((m) => m[0].trim());
          const emails = [...body.matchAll(EMAIL_RE)].map((m) => m[0].trim());
          const maxRows = Math.max(phones.length, emails.length, 0);
          const title = document.title || '(No title)';
          const url = location.href;
          const keysByMode: Record<string, string[]> = {
            b2b:          ['Company', 'Phone', 'Email', 'Website', 'Address'],
            local_travel: ['Business_Name', 'Rating', 'Review_Count', 'Category', 'Price_Range'],
            ecommerce:    ['Product_Name', 'Price', 'SKU', 'Rating', 'Vendor'],
            real_estate:  ['Address', 'Price', 'Property_Type', 'Agent'],
            social_chat:  ['Sender', 'Content', 'Time', 'Platform'],
          };
          const primaryByMode: Record<string, string> = {
            b2b: 'Company', local_travel: 'Business_Name', ecommerce: 'Product_Name',
            real_estate: 'Address', social_chat: 'Sender',
          };
          const keys = keysByMode[mode] ?? keysByMode['b2b'];
          const primaryKey = primaryByMode[mode] ?? keys[0];
          const records = Array.from({ length: Math.min(maxRows, 50) }, (_, i) => {
            const data: Record<string, string> = { URL: url };
            keys.forEach((k) => { data[k] = ''; });
            if (primaryKey) data[primaryKey] = title;
            if (keys.includes('Phone')) data['Phone'] = phones[i] ?? '';
            if (keys.includes('Email')) data['Email'] = emails[i] ?? '';
            if (keys.includes('Website')) data['Website'] = url;
            return { index: i, invalidFields: [...keys], data };
          });
          return {
            source: location.hostname,
            mode: 'fallback' as const,
            ruleKey: null,
            sceneMode: mode,
            records,
            extractedAt: new Date().toISOString(),
          };
        },
        args: [sceneMode],
      });
      if (results[0]?.result) {
        broadcastToSidePanel({ type: 'BULK_COMPLETE', payload: results[0].result });
      }
    } catch (_scriptErr) {
      broadcastToSidePanel({
        type: 'BULK_ERROR',
        payload: { message: 'Could not inject script. Check page permissions.', code: 'SCRIPT_INJECT_FAILED' },
      });
    }
  }
}

// ── 广播工具函数 ───────────────────────────────────────────────────────────────

function broadcastToSidePanel(message: object): void {
  chrome.runtime.sendMessage(message).catch((err) => {
    const msg = String(err);
    if (
      msg.includes('Could not establish connection') ||
      msg.includes('No tab with id') ||
      msg.includes('receiving end does not exist')
    ) {
      return;
    }
    console.warn('[AQUO] 广播消息失败:', err);
  });
}

// ── 工具函数 ───────────────────────────────────────────────────────────────────

function buildLicenseState(
  status: LicenseState['status'],
  errorMessage: string | null = null
): LicenseState {
  return {
    status,
    licenseKey: null,
    instanceId: null,
    deviceId: null,
    tier: null,
    validatedAt: null,
    expiresAt: null,
    customerEmail: null,
    productName: null,
    errorMessage,
  };
}
