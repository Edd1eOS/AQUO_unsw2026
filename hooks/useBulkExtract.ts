/**
 * useBulkExtract — 触发批量列表提取的 hook
 * 向 Service Worker 发送 EXTRACT_BULK_LIST 消息，并携带当前场景模式。
 */

import { useCallback, useState } from 'react';
import { sendMessage } from '../lib/messaging/protocol';
import type { SceneMode } from '../types/bulk';

export function useBulkExtract() {
  const [isTriggering, setIsTriggering] = useState(false);

  const triggerBulkExtract = useCallback(
    async (sceneMode: SceneMode) => {
      if (isTriggering) return;
      setIsTriggering(true);
      try {
        await sendMessage('EXTRACT_BULK_LIST', { sceneMode });
      } catch (err) {
        console.error('[AQUO] 批量抓取触发失败:', err);
      } finally {
        setIsTriggering(false);
      }
    },
    [isTriggering],
  );

  return { triggerBulkExtract, isTriggering };
}
