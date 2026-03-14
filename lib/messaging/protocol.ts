/**
 * 类型安全的消息传递协议
 * 使用 @webext-core/messaging 封装 chrome.runtime.sendMessage
 *
 * 批量广播事件（BULK_EXTRACTING / BULK_COMPLETE / BULK_ERROR）是单向广播，
 * 不使用 request-response 模式，直接用 chrome.runtime.onMessage 监听。
 */

import { defineExtensionMessaging } from '@webext-core/messaging';
import type { LicenseState } from '../../types/license';
import type { SceneMode } from '../../types/bulk';

export const { sendMessage, onMessage } = defineExtensionMessaging<{
  /** Side Panel → SW: 激活/验证 License Key */
  VALIDATE_LICENSE: (data: { licenseKey: string }) => LicenseState;

  /** Side Panel → SW: 检查本地缓存的授权状态 */
  CHECK_LICENSE: () => LicenseState;

  /** Side Panel → SW: 触发批量列表提取（结果通过 BULK_COMPLETE 广播返回） */
  EXTRACT_BULK_LIST: (data: { sceneMode: SceneMode }) => void;
}>();
