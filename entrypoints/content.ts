/**
 * Content Script — 批量列表提取与中继 (AQUO Local-First)
 *
 * 职责：
 * 1. 监听 Service Worker 的 TRIGGER_BULK_EXTRACT 消息
 * 2. 步进式滚动触发懒加载，确保 DOM 完全渲染
 * 3. 调用 extractBulkList(sceneMode) 进行本地 DOM/CSS/XPath 规则提取
 * 4. 若无规则匹配结果，回退到全文 phone/email 正则提取
 * 5. 将结果通过 BULK_EXTRACTED 消息发回 Service Worker
 *
 * 防御性编程：
 * - 通过 ctx.isValid 检查防止 "Extension context invalidated" 错误
 * - 所有 sendMessage 调用包裹在 try-catch 中，静默处理上下文失效
 */

import { extractBulkList } from '../lib/dom/bulkExtractor';
import { getSceneConfig, type SceneMode } from '../types/bulk';

// ── 步进式滚动（解决 IntersectionObserver 懒加载） ────────────────────────────

/**
 * 每次滚动一个视窗高度，等待 400ms 让 IntersectionObserver 触发渲染。
 * 连续 2 轮 DOM 节点数不再增加时停止，避免死循环。
 */
async function stepScrollToLoad(): Promise<void> {
  const STEP = window.innerHeight;
  const DELAY_MS = 400;
  const MAX_STABLE_ROUNDS = 2;
  let stableCount = 0;
  let lastNodeCount = document.querySelectorAll('*').length;

  while (stableCount < MAX_STABLE_ROUNDS) {
    window.scrollBy(0, STEP);
    await new Promise<void>((r) => setTimeout(r, DELAY_MS));
    const current = document.querySelectorAll('*').length;
    if (current === lastNodeCount) {
      stableCount++;
    } else {
      stableCount = 0;
      lastNodeCount = current;
    }
    // 已滚到底部则提前退出
    if (window.scrollY + window.innerHeight >= document.body.scrollHeight - 10) break;
  }

  window.scrollTo(0, 0); // 恢复用户视角
}

// ── Content Script 主体 ───────────────────────────────────────────────────────

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_end',

  main(ctx) {
    browser.runtime.onMessage.addListener((message: unknown) => {
      if (!ctx.isValid) return;

      const msg = message as {
        type: string;
        sceneMode?: SceneMode;
      };

      if (msg.type !== 'TRIGGER_BULK_EXTRACT') return;

      // 异步提取流程（消息监听器不直接 await，启动独立 async 任务）
      void (async () => {
        try {
          const sceneMode: SceneMode = msg.sceneMode ?? 'b2b';

          // ── Step 1: 步进式滚动，触发懒加载 ─────────────────────────────────
          await stepScrollToLoad();

          // ── Step 2: 本地 DOM/CSS 规则提取（Local-First，无 AI）─────────────
          const result = extractBulkList(sceneMode);

          // ── Step 3: 有结果则直接返回 ─────────────────────────────────────
          if (result.records.length > 0) {
            void browser.runtime.sendMessage({ type: 'BULK_EXTRACTED', payload: result });
            return;
          }

          // ── Step 4: 终极回退：全文 phone/email 正则 ──────────────────────
          const sceneConfig = getSceneConfig(sceneMode);
          const PHONE_RE =
            /(?:\+?86[-\s]?)?1[3-9]\d{9}|(?:\+?\d{1,3}[-\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/g;
          const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
          const bodyText = document.body?.innerText ?? '';
          const phones = [...bodyText.matchAll(PHONE_RE)].map((m) => m[0].trim());
          const emails = [...bodyText.matchAll(EMAIL_RE)].map((m) => m[0].trim());
          const maxRows = Math.max(phones.length, emails.length, 0);
          const heading =
            document.querySelector('h1,h2,h3')?.textContent?.trim() ??
            document.title ??
            '(No title)';
          const url = document.location.href;
          const records = Array.from({ length: Math.min(maxRows, 50) }, (_, i) => {
            const data: Record<string, string> = { URL: url };
            for (const f of sceneConfig.fields) {
              if (f.key === sceneConfig.primaryFieldKey) data[f.key] = heading;
              else if (f.source === 'phone') data[f.key] = phones[i] ?? '';
              else if (f.source === 'email') data[f.key] = emails[i] ?? '';
              else if (f.source === 'url') data[f.key] = url;
              else data[f.key] = '';
            }
            return { index: i, invalidFields: sceneConfig.fields.map((f) => f.key), data };
          });
          void browser.runtime.sendMessage({
            type: 'BULK_EXTRACTED',
            payload: {
              source: result.source,
              mode: 'fallback' as const,
              ruleKey: null,
              sceneMode,
              records,
              extractedAt: new Date().toISOString(),
            },
          });
        } catch (err) {
          const errMsg = String(err);
          if (errMsg.includes('Extension context invalidated')) return;
          void browser.runtime
            .sendMessage({
              type: 'BULK_EXTRACTED',
              payload: null,
              error: errMsg,
            })
            .catch(() => {});
        }
      })();
    });
  },
});
