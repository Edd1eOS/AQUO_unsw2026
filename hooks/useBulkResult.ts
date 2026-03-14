/**
 * useBulkResult — 批量提取结果状态 hook
 * 监听 SW 广播的 BULK_EXTRACTING / BULK_COMPLETE / BULK_ERROR 消息
 */

import { useState, useEffect, useCallback } from 'react';
import type { BulkState } from '../types/bulk';

const INITIAL: BulkState = { status: 'idle', result: null, error: null };

export function useBulkResult() {
  const [bulkState, setBulkState] = useState<BulkState>(INITIAL);

  useEffect(() => {
    const listener = (message: unknown) => {
      const msg = message as { type: string; payload: unknown };
      switch (msg.type) {
        case 'BULK_EXTRACTING':
          setBulkState({ status: 'extracting', result: null, error: null });
          break;
        case 'BULK_COMPLETE':
          setBulkState({ status: 'complete', result: msg.payload as BulkState['result'], error: null });
          break;
        case 'BULK_ERROR':
          setBulkState(prev => ({
            ...prev,
            status: 'error',
            error: (msg.payload as { message: string }).message,
          }));
          break;
      }
    };

    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  const resetBulk = useCallback(() => setBulkState(INITIAL), []);

  return { bulkState, resetBulk };
}
