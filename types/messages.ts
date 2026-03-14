/**
 * 消息传递协议 — 定义所有 chrome.runtime 广播消息的类型
 * 方向：Service Worker → Side Panel（单向广播）
 *       Content Script → Service Worker（批量提取结果）
 */

import type { BulkResult } from './bulk';

// ── Service Worker → Content Script ──────────────────────────────────────────

/** 指令 Content Script 提取批量列表数据 */
export interface TriggerBulkExtractMsg {
  type: 'TRIGGER_BULK_EXTRACT';
  sceneMode: import('./bulk').SceneMode;
}

// ── Content Script → Service Worker ──────────────────────────────────────────

/** 批量列表提取完成，携带结果 */
export interface BulkExtractedMsg {
  type: 'BULK_EXTRACTED';
  payload: BulkResult | null;
  error?: string;
}

// ── Service Worker → Side Panel（广播）────────────────────────────────────────

/** 批量提取开始 */
export interface BulkExtractingMsg {
  type: 'BULK_EXTRACTING';
}

/** 批量提取完成，携带完整结果 */
export interface BulkCompleteMsg {
  type: 'BULK_COMPLETE';
  payload: BulkResult;
}

/** 批量提取失败 */
export interface BulkErrorMsg {
  type: 'BULK_ERROR';
  payload: { message: string; code: string };
}

// ── 联合类型 ───────────────────────────────────────────────────────────────────

export type BulkBroadcast = BulkExtractingMsg | BulkCompleteMsg | BulkErrorMsg;

export type ContentToSwMessage = BulkExtractedMsg;
export type SwToContentMessage = TriggerBulkExtractMsg;
