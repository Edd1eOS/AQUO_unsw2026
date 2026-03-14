/**
 * License 状态管理 Hook
 *
 * 架构原则：chrome.storage.onChanged 是唯一权威数据源
 *
 * 流程：
 *   提交 → setChecking → sendMessage(fire-and-forget)
 *          ↓ SW 验证成功 → persistLicense → chrome.storage.local.set
 *                                              ↓
 *                                        onChanged 触发
 *                                              ↓
 *                                        setLicenseState('valid')  ← UI 解锁
 *
 * validateLicense 永不用消息响应来驱动"成功"状态 —— 消息端口在 MV3 中
 * 可能在 SW 回复之前关闭，导致 await 抛出/返回 undefined，使 UI 卡在 'checking'。
 * 消息响应只用于传递显式错误（invalid/expired），成功由 onChanged 处理。
 */

import { useState, useEffect, useCallback } from 'react';
import { sendMessage } from '../lib/messaging/protocol';
import type { LicenseState, StoredLicenseData } from '../types/license';

const STORAGE_KEY = 'dataplumber_license';

const UNCHECKED_STATE: LicenseState = {
  status: 'unchecked',
  licenseKey: null,
  instanceId: null,
  deviceId: null,
  tier: null,
  validatedAt: null,
  expiresAt: null,
  customerEmail: null,
  productName: null,
  errorMessage: null,
};

function storageToLicenseState(stored: StoredLicenseData): LicenseState {
  if (stored.expiresAt && new Date(stored.expiresAt) <= new Date()) {
    return { ...UNCHECKED_STATE, status: 'expired', errorMessage: 'License 已过期，请联系支持续期' };
  }
  return {
    status: 'valid',
    licenseKey: stored.licenseKey,
    instanceId: stored.instanceId || null,
    deviceId: stored.deviceId,
    tier: stored.tier ?? null,
    validatedAt: stored.validatedAt,
    expiresAt: stored.expiresAt,
    customerEmail: null,
    productName: stored.licenseKey === 'DEV-PASS-2026' ? '[DEV MODE]' : null,
    errorMessage: null,
  };
}

export function useLicense() {
  const [licenseState, setLicenseState] = useState<LicenseState>({ ...UNCHECKED_STATE, status: 'checking' });

  // ── 挂载时读取初始状态 ─────────────────────────────────────────────────────
  // 直接读 storage，不走消息层，消除 SW 冷启动的不确定性
  useEffect(() => {
    let cancelled = false;
    chrome.storage.local.get(STORAGE_KEY).then((raw) => {
      if (cancelled) return;
      const stored = raw[STORAGE_KEY] as StoredLicenseData | undefined;
      setLicenseState(stored?.licenseKey ? storageToLicenseState(stored) : UNCHECKED_STATE);
    }).catch(() => {
      if (!cancelled) setLicenseState(UNCHECKED_STATE);
    });
    return () => { cancelled = true; };
  }, []);

  // ── chrome.storage.onChanged：唯一权威状态更新源 ───────────────────────────
  // 无论是 SW 写入、DEV-PASS 写入还是任何其他写入，都经过此处更新 UI
  useEffect(() => {
    const handler = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'local' || !(STORAGE_KEY in changes)) return;
      const newVal = changes[STORAGE_KEY].newValue as StoredLicenseData | undefined;
      setLicenseState(newVal?.licenseKey ? storageToLicenseState(newVal) : UNCHECKED_STATE);
    };
    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
  }, []);

  // ── 提交 License Key ────────────────────────────────────────────────────────
  // 关键设计：sendMessage 是"触发器"而非"状态来源"
  //   - 成功：SW 写入 storage → onChanged 触发 → UI 切换到 'valid'（上面的 useEffect）
  //   - 失败：通过 .then() 读取显式错误 或 .catch() 直接读 storage 判断结果
  //   - 永远不用 await result 来设置成功状态，消除 MV3 端口关闭竞态
  const validateLicense = useCallback((licenseKey: string) => {
    setLicenseState((prev) => ({ ...prev, status: 'checking', errorMessage: null }));

    sendMessage('VALIDATE_LICENSE', { licenseKey })
      .then((result) => {
        // 仅处理 SW 返回的显式错误（invalid / expired）
        // 成功（valid）：SW 写 storage 在 return 之前发生，onChanged 已经或即将触发
        if (result?.status && result.status !== 'valid') {
          setLicenseState(result);
        }
      })
      .catch(() => {
        // MV3 消息端口关闭，SW 可能已成功写入 storage
        // 直接读 storage 作为最终裁判：有数据则已成功（onChanged 可能已触发），无数据则失败
        chrome.storage.local.get(STORAGE_KEY).then((raw) => {
          const stored = raw[STORAGE_KEY] as StoredLicenseData | undefined;
          if (stored?.licenseKey) {
            setLicenseState(storageToLicenseState(stored));
          } else {
            setLicenseState((prev) => ({
              ...prev,
              status: 'invalid',
              errorMessage: 'License Key 无效，请检查后重试。',
            }));
          }
        });
      });
  }, []);

  return { licenseState, validateLicense };
}
