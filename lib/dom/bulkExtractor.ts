/**
 * 批量列表提取器 — CSS 选择器规则驱动 + 语义/密度回退（场景化动态字段版）
 * 在 Content Script 上下文中运行（有 DOM 访问权限）。
 *
 * 关键修复（2026-03）：
 * - extractWithRule: 容器选择器改为并集（UNION）去重，不再只取最大匹配组，
 *   修复 TripAdvisor 等多选择器站点漏抓 50% 的 Bug。
 * - validateFieldValue: 语义类型校验，阻止 URL 流入 phone/address/text 字段。
 * - TripAdvisor 选择器全面更新，兼容 2025-2026 DOM 结构变化。
 */

import {
  type BulkRecord,
  type BulkResult,
  type SceneMode,
  type SceneFieldDef,
  getSceneConfig,
  evaluateInvalidFields,
} from '../../types/bulk';

// ── 站点规则定义 ──────────────────────────────────────────────────────────────

interface SiteRule {
  /** querySelectorAll 的容器选择器（逗号分隔多备选，取 UNION） */
  container: string;
  fields: {
    title?: string;
    url?: string;
    phone?: string;
    email?: string;
    address?: string;
    snippet?: string;
    rating?: string;
    category?: string;
    reviewCount?: string;
    priceRange?: string;
  };
  /**
   * 可选的启发式卡片提取器，优先级高于 fields CSS 选择器。
   * 返回值中有值的字段会覆盖 CSS 选择器结果。
   */
  cardExtractor?: (el: Element) => Partial<{
    title: string;
    rating: string;
    reviewCount: string;
    category: string;
    priceRange: string;
  }>;
}

// ── TripAdvisor 启发式卡片提取器 ─────────────────────────────────────────────
// 完全不依赖任何混淆 Class Name，改用语义 DOM + 正则匹配。

function extractTripAdvisorCard(el: Element): Partial<{
  title: string; rating: string; reviewCount: string;
  category: string; priceRange: string;
}> {
  const innerText = (el as HTMLElement).innerText ?? el.textContent ?? '';
  const lines = innerText.split('\n').map(s => s.trim()).filter(Boolean);
  const result: Partial<{
    title: string; rating: string; reviewCount: string;
    category: string; priceRange: string;
  }> = {};

  const NOISE_RE = /^(open now|closed|opens soon|menu|sponsored|write a review|赞助|广告|已关闭|营业中)/i;
  const REVIEW_RE = /\(([\d,]+)\s*(?:reviews?|ratings?|条评价|条点评)\)/i;

  // ── 1. Title — lines[0], strip leading rank "1. " ─────────────────────────
  try {
    if (lines[0]) result.title = lines[0].replace(/^\d+\.\s*/, '').trim();
  } catch { /* defensive */ }

  // ── 2. Rating — line exactly matching "N.N" e.g. "4.3" or "5.0" ──────────
  try {
    const ratingLine = lines.find(l => /^[0-5]\.\d$/.test(l));
    if (ratingLine) result.rating = ratingLine;
  } catch { /* defensive */ }

  // ── 3. Review Count — "(16 reviews)" or "(1,234 条评价)" ─────────────────
  try {
    for (const l of lines) {
      const m = l.match(REVIEW_RE);
      if (m) { result.reviewCount = m[1].replace(/,/g, ''); break; }
    }
  } catch { /* defensive */ }

  // ── 4. Price — first line containing "$", extract "$$-$$$" token ──────────
  try {
    for (const l of lines) {
      if (l.includes('$')) {
        const m = l.match(/\${1,4}(?:\s*[-–]\s*\${1,4})?/);
        if (m) { result.priceRange = m[0].trim(); break; }
      }
    }
  } catch { /* defensive */ }

  // ── 5. Category — first short line not matched by any other field ─────────
  try {
    const usedLines = new Set<string | undefined>([
      result.title,
      result.rating,
      lines.find(l => REVIEW_RE.test(l)),
      lines.find(l => l.includes('$') && /\${1,4}/.test(l)),
    ]);
    for (const l of lines) {
      if (
        usedLines.has(l) ||
        NOISE_RE.test(l) ||
        l.length > 60 ||
        /\d{4,}/.test(l) ||
        /\bkm\b|\bmi\b/i.test(l)
      ) continue;
      result.category = l;
      break;
    }
  } catch { /* defensive */ }

  return result;
}

// ── 站点规则定义 ──────────────────────────────────────────────────────────────

const SITE_RULES: Record<string, SiteRule> = {
  'www.bing.com': {
    container: 'li.b_algo',
    fields: {
      title:   'h2 > a',
      url:     'h2 > a',
      snippet: '.b_caption > p',
      phone:   '.b_factrow',
    },
  },
  'yellowpages.com.au': {
    container: 'div.listing-static, div.search-contact, [data-test-id="listing"]',
    fields: {
      title:       '[data-test-id="listing-name"], a.listing-name, h3, .business-name, .listing-name, h2, [class*="businessName"], [class*="name"]',
      phone:       '.contact-number, [href^="tel:"], [class*="phone"]',
      address:     '.contact-address, address, [class*="address"]',
      rating:      '[class*="star-rating"], [class*="rating"], [aria-label*="rating" i], [aria-label*="star" i]',
      category:    '.listing-category, [class*="category"], [class*="business-type"], [class*="subcategory"]',
      reviewCount: '[class*="review-count"], [class*="num-reviews"], [class*="reviews"]',
    },
  },
  'www.yellowpages.com': {
    container: '.result.organic, .srp-listing, [class*="organic"]',
    fields: {
      title:   'h2, h3, a[data-test="listing-name"], .business-name > a, .listing-name',
      url:     'a[data-test="listing-name"], .business-name > a, h2 > a, h3 > a',
      phone:   '.phones.phone.primary, [class*="phone"], [href^="tel:"]',
      address: '.street-address, address, [class*="address"]',
      snippet: '.snippet, p',
    },
  },
  'www.yelp.com': {
    container: '[data-testid="serp-ia-card"]',
    fields: {
      title:   'h3 a',
      url:     'h3 a',
      phone:   '[data-testid="phone"]',
      address: 'address',
      snippet: 'p',
      rating:  '[aria-label*="rating" i], [aria-label*="star" i]',
    },
  },
  'tripadvisor.com': {
    // UNION 并集：酒店 + 餐厅 + 景点 + 通用列表项，修复漏抓 50% 的 Bug
    container: [
      '[data-automation="hotel-result"]',
      '[data-test-target="restaurants-list-item"]',
      '[data-test-target="hotel-list-item"]',
      '[data-test-target="attraction-list-item"]',
      'div[class*="listItem_"]',
      'li[class*="ListItem_"]',
      'div[class*="result-card"]',
    ].join(', '),
    fields: {
      title: [
        '[data-automation="hotel-name"]',
        'a[href*="/Hotel_Review"]',
        'a[href*="/Restaurant_Review"]',
        'a[href*="/Attraction_Review"]',
        '[class*="listingTitle"]',
        'h3 a',
        'h2 a',
      ].join(', '),
      url: [
        'a[href*="/Hotel_Review"]',
        'a[href*="/Restaurant_Review"]',
        'a[href*="/Attraction_Review"]',
      ].join(', '),
      rating: [
        '[data-automation="HotelRating"] span:first-child',
        'svg[aria-label*="bubble" i]',
        '[class*="ui_bubble_rating"]',
        '[class*="Bubble_"]',
        '[aria-label*="rating" i]',
        '[aria-label*="star" i]',
        'span[class*="Rating_"]',
      ].join(', '),
      reviewCount: [
        '[data-automation="review-count"]',
        'a[href*="Reviews"]',
        'span[class*="reviewCount"]',
        '[class*="review"] span',
        'span[class*="Review_"]',
      ].join(', '),
      category: [
        '[data-automation="categories"]',
        '[class*="category"]',
        '[class*="cuisine"]',
        '[class*="Category_"]',
      ].join(', '),
      priceRange: [
        '[data-automation="price-level"]',
        '[class*="priceTag"]',
        '[class*="price-range"]',
        '[class*="priceRange"]',
        '[class*="Price_"]',
      ].join(', '),
      address: [
        '[class*="address"]',
        '[data-automation="address"]',
        'address',
        '[class*="Address_"]',
      ].join(', '),
    },
    cardExtractor: extractTripAdvisorCard,
  },
};

// ── 正则模式 ──────────────────────────────────────────────────────────────────

const PHONE_RE  = /(?:\+?86[-\s]?)?1[3-9]\d{9}|(?:\+?\d{1,3}[-\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/g;
const EMAIL_RE  = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const PRICE_LIKE_RE = /(?:[$€£¥]|￥)\s*\d[\d,.\s]*/;
const RATING_LIKE_RE = /([0-5](?:\.\d)?)(?:\s*\/\s*5)?/;
const REVIEW_COUNT_RE = /\b(\d{1,3}(?:,\d{3})*|\d+(?:\.\d+)?[Kk])\s*(?:reviews?|ratings?|条评价|评价)\b|\((\d{1,3}(?:,\d{3})*)\)/i;
const URL_RE = /^https?:\/\//;

// ── 语义类型校验 ──────────────────────────────────────────────────────────────

/**
 * 阻止值类型与字段类型语义不匹配的映射。
 * 例如：URL 不能流入 phone / address / text 类型字段。
 */
function validateFieldValue(
  value: string,
  fieldType: SceneFieldDef['type'],
): string {
  if (!value) return value;
  const isUrl = URL_RE.test(value);

  switch (fieldType) {
    case 'phone':
      // URL 不是电话号码
      return isUrl ? '' : value;
    case 'email':
      // URL 不是 email；email 必须含 @
      return (isUrl || !value.includes('@')) ? '' : value;
    case 'address':
      // URL 不是地址
      return isUrl ? '' : value;
    case 'text':
      // 普通文本字段不应含纯 URL
      return isUrl ? '' : value;
    case 'url':
      // URL 字段必须是合法 URL
      try { new URL(value); return value; } catch { return ''; }
    default:
      return value;
  }
}

// ── 工具函数 ──────────────────────────────────────────────────────────────────

function queryTextMulti(root: Element, selector: string | undefined): string | null {
  if (!selector) return null;
  for (const sel of selector.split(',').map(s => s.trim()).filter(Boolean)) {
    const t = root.querySelector(sel)?.textContent?.replace(/\s+/g, ' ').trim();
    if (t) return t;
  }
  return null;
}

function queryHrefMulti(root: Element, selector: string | undefined): string | null {
  if (!selector) return null;
  for (const sel of selector.split(',').map(s => s.trim()).filter(Boolean)) {
    const el   = root.querySelector(sel);
    const href = el?.getAttribute('href');
    if (!href) continue;
    if (href.startsWith('tel:') || href.startsWith('mailto:')) continue;
    try {
      return new URL(href, document.location.href).href;
    } catch {
      return href;
    }
  }
  return null;
}

function queryMailto(root: Element): string | null {
  for (const a of Array.from(root.querySelectorAll('a[href^="mailto:"]'))) {
    const href  = a.getAttribute('href') ?? '';
    const match = /mailto:([^?]+)/.exec(href);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

function firstMatch(text: string, re: RegExp): string | null {
  re.lastIndex = 0;
  return re.exec(text)?.[0]?.trim() ?? null;
}

function extractRatingFromContainer(root: Element, ruleRatingSelector: string | undefined): string {
  if (ruleRatingSelector) {
    for (const sel of ruleRatingSelector.split(',').map(s => s.trim()).filter(Boolean)) {
      const el = root.querySelector(sel);
      if (!el) continue;
      const aria = el.getAttribute('aria-label');
      if (aria) {
        const m = aria.match(/([0-5](?:\.\d)?)\s*(?:star|rating|bubble)/i) ?? aria.match(/([0-5](?:\.\d)?)/);
        if (m?.[1]) return m[1].trim();
      }
      const fromText = el.textContent ?? '';
      const like = firstMatch(fromText, RATING_LIKE_RE);
      if (like) return like.replace(/\s*\/\s*5/g, '').trim();
    }
  }
  for (const el of Array.from(root.querySelectorAll('[aria-label*="rating" i], [aria-label*="star" i], [aria-label*="bubble" i]'))) {
    const aria = el.getAttribute('aria-label') ?? '';
    const m = aria.match(/([0-5](?:\.\d)?)\s*(?:star|rating|bubble)/i) ?? aria.match(/([0-5](?:\.\d)?)/);
    if (m?.[1]) return m[1].trim();
  }
  const starEl = root.querySelector('[class*="star" i], [class*="rating" i], [class*="Bubble" i]');
  if (starEl) {
    const t = starEl.textContent ?? starEl.getAttribute('aria-label') ?? '';
    const like = firstMatch(t, RATING_LIKE_RE);
    if (like) return like.replace(/\s*\/\s*5/g, '').trim();
  }
  return firstMatch(root.textContent ?? '', RATING_LIKE_RE)?.replace(/\s*\/\s*5/g, '').trim() ?? '';
}

function normalizePhone(raw: string | null): string | null {
  if (!raw) return null;
  // 电话不应是 URL
  if (URL_RE.test(raw)) return null;
  const cleaned = raw.replace(/[^\d+\s]/g, '').replace(/\s+/g, ' ').trim();
  return cleaned || null;
}

// ── 高可靠性标题提取 ──────────────────────────────────────────────────────────

function extractTitle(
  container: Element,
  titleSelector: string | undefined,
  businessUrl: string | null,
  sceneMode: SceneMode,
): { title: string; forcedReview: boolean } {
  const byCss = queryTextMulti(container, titleSelector);
  if (byCss) return { title: byCss, forcedReview: false };

  const links = Array.from(container.querySelectorAll<HTMLAnchorElement>('a[href]'));
  const bizLink = (() => {
    if (sceneMode === 'b2b') {
      const MERCHANT_PATTERNS = ['/biz', '/company', '/listing', '/store', '/profile'];
      const candidate = links.find(a => {
        const href = a.getAttribute('href') ?? '';
        if (!href || href.startsWith('tel:') || href.startsWith('mailto:') ||
            href.startsWith('#') || href.startsWith('javascript:')) return false;
        return MERCHANT_PATTERNS.some(p => href.includes(p));
      });
      if (candidate) return candidate;
    }
    return links.find(a => {
      const href = a.getAttribute('href') ?? '';
      return (
        href.length > 1 &&
        !href.startsWith('tel:') &&
        !href.startsWith('mailto:') &&
        !href.startsWith('#') &&
        !href.startsWith('javascript:')
      );
    });
  })();

  if (bizLink) {
    const name =
      bizLink.innerText?.trim() ||
      bizLink.getAttribute('title')?.trim() ||
      container.querySelector('h3, h2, [class*="name"]')?.textContent?.replace(/\s+/g, ' ').trim();
    if (name) return { title: name, forcedReview: false };
  }

  const urlStr = businessUrl ?? (container.querySelector('a[href]') as HTMLAnchorElement | null)?.href;
  if (urlStr) {
    try {
      const pathname = new URL(urlStr).pathname;
      const segment = pathname.split('/').filter(Boolean).pop() ?? '';
      if (segment) {
        const formatted = segment
          .replace(/[-_]/g, ' ')
          .replace(/\b\w/g, c => c.toUpperCase());
        return { title: formatted, forcedReview: true };
      }
    } catch { /* ignore */ }
  }

  return { title: '(无标题)', forcedReview: true };
}

// ── 将 DOM 容器转换为场景化 BulkRecord ─────────────────────────────────────────

function buildRecordFromContainer(
  el: Element,
  index: number,
  sceneMode: SceneMode,
  rule: SiteRule | null,
): BulkRecord {
  const sceneConfig = getSceneConfig(sceneMode);
  const text = el.textContent ?? '';
  // 启发式卡片提取器（如 TripAdvisor）优先于 CSS 选择器字段结果
  const heuristic = rule?.cardExtractor?.(el) ?? {};

  const email =
    (rule && queryTextMulti(el, rule.fields.email)) ??
    queryMailto(el) ??
    firstMatch(text, EMAIL_RE);

  const url =
    (rule && queryHrefMulti(el, rule.fields.url)) ??
    (() => {
      const a = el.querySelector<HTMLAnchorElement>('a[href]');
      if (!a) return null;
      const href = a.getAttribute('href') ?? '';
      if (!href || href.startsWith('tel:') || href.startsWith('mailto:')) return null;
      try {
        return new URL(href, document.location.href).href;
      } catch {
        return href;
      }
    })();

  const { title, forcedReview } = heuristic.title
    ? { title: heuristic.title, forcedReview: false }
    : extractTitle(el, rule ? rule.fields.title : 'h1,h2,h3,a', url, sceneMode);

  const phone = normalizePhone(
    (rule && queryTextMulti(el, rule.fields.phone)) ?? firstMatch(text, PHONE_RE),
  );

  const address =
    (rule && queryTextMulti(el, rule.fields.address)) ??
    el.querySelector('address,[class*="address"]')?.textContent?.replace(/\s+/g, ' ').trim() ??
    null;

  const snippet =
    (rule && queryTextMulti(el, rule.fields.snippet)) ??
    el.querySelector('p, .snippet, .desc')?.textContent?.replace(/\s+/g, ' ').trim() ??
    null;

  const priceLike = firstMatch(text, PRICE_LIKE_RE);
  const ratingFromDom =
    heuristic.rating ?? extractRatingFromContainer(el, rule?.fields.rating);
  const ratingStr = ratingFromDom || (firstMatch(text, RATING_LIKE_RE)?.replace(/\s*\/\s*5/g, '').trim() ?? '');

  const reviewsLike =
    heuristic.reviewCount ??
    (rule && queryTextMulti(el, rule.fields.reviewCount)) ??
    firstMatch(text, REVIEW_COUNT_RE);

  const categoryVal =
    heuristic.category ??
    (rule && queryTextMulti(el, rule.fields.category)) ??
    el.querySelector('[class*="category"],[class*="tag"],[class*="industry"],[class*="type"]')?.textContent?.replace(/\s+/g, ' ').trim() ??
    '';

  const priceRangeVal =
    heuristic.priceRange ??
    (rule && queryTextMulti(el, rule.fields.priceRange)) ??
    el.querySelector('[class*="price"],[class*="pricetag"]')?.textContent?.replace(/\s+/g, ' ').trim() ??
    '';

  const raw: Record<string, string> = {
    title:        title ?? '',
    phone:        phone ?? '',
    email:        email ?? '',
    url:          url ?? '',
    address:      (sceneMode === 'real_estate' ? (address ?? title) : address) ?? '',
    snippet:      snippet ?? '',
    rating:       ratingStr,
    reviewCount:  reviewsLike ?? '',
    category:     categoryVal,
    priceRange:   priceRangeVal,
    price:
      (el.querySelector('[class*="price"],[data-price],[class*="rent"],[class*="amount"]')?.textContent
        ?.replace(/\s+/g, ' ').trim() ?? priceLike ?? '') || '',
    sku:
      el.getAttribute('data-sku') ??
      el.querySelector('[data-sku],[class*="sku"]')?.textContent?.trim() ?? '',
    vendor:
      el.querySelector('[class*="store"],[class*="seller"]')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    agent:
      el.querySelector('[class*="agent"],[class*="broker"]')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    propertyType:
      el.querySelector('[class*="bed"],[class*="bath"],[class*="feature"]')?.textContent
        ?.replace(/\s+/g, ' ').trim() ?? '',
    sender:
      el.querySelector('[class*="author"],[class*="user"],[class*="sender"]')?.textContent
        ?.replace(/\s+/g, ' ').trim() ?? '',
    content:
      snippet ??
      el.querySelector('[class*="content"],[class*="text"],p')?.textContent?.replace(/\s+/g, ' ').trim() ??
      title ?? '',
    time:
      el.querySelector('time,[datetime],[class*="time"]')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    platform: document.location.hostname,
  };

  // ── 映射原始值到场景字段，并应用语义类型校验 ────────────────────────────────
  const data: Record<string, string> = {};
  if (url) data['URL'] = url;
  for (const field of sceneConfig.fields) {
    if (field.source != null) {
      const rawVal = raw[field.source] ?? '';
      data[field.key] = validateFieldValue(rawVal, field.type);
    }
  }

  const record: BulkRecord = {
    index,
    invalidFields: forcedReview
      ? [sceneConfig.primaryFieldKey]
      : evaluateInvalidFields({ index, invalidFields: [], data }, sceneConfig),
    data,
  };
  return record;
}

// ── 规则驱动提取（UNION 并集，修复漏抓 Bug）──────────────────────────────────

function extractWithRule(rule: SiteRule, ruleKey: string, sceneMode: SceneMode): BulkResult {
  // ── TripAdvisor 动态寻址：顺藤摸瓜找真实卡片 Wrapper ────────────────────────
  // 静态 container 选择器抓到的是空隐藏节点，改为从 /Restaurant_Review 链接反推
  let containers: Element[];

  if (window.location.hostname.includes('tripadvisor')) {
    const links = Array.from(document.querySelectorAll('a[href*="/Restaurant_Review"]'));
    const cards = links.map(link => {
      let card: Element = link;
      for (let i = 0; i < 4; i++) {
        if (card.parentElement) card = card.parentElement;
      }
      return card;
    });
    containers = Array.from(new Set(cards));
  } else {
    // ── 原有逻辑：取所有选择器的 UNION，用 Set 去重，保持 DOM 顺序 ─────────────
    const parts = rule.container.split(',').map(s => s.trim()).filter(Boolean);
    const seen = new Set<Element>();
    containers = [];
    for (const sel of parts) {
      try {
        for (const el of document.querySelectorAll(sel)) {
          if (!seen.has(el)) {
            seen.add(el);
            containers.push(el);
          }
        }
      } catch {
        // 选择器语法无效（如旧浏览器不支持 :has()），安全跳过
      }
    }
  }

  // 按 DOM 顺序排序（保证导出顺序与页面视觉一致）
  containers.sort((a, b) =>
    a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
  );

  // 若容器数为 0，说明规则选择器已全部失效，进入通用回退
  if (containers.length === 0) {
    return extractFallbackGeneric(sceneMode);
  }

  // 若匹配数量过少（<3），补充语义/密度启发式结果
  if (containers.length < 3) {
    const auto = autoFixContainerSelector();
    if (auto && auto.containers.length > containers.length) {
      return {
        source:      document.location.hostname,
        mode:        'fallback',
        ruleKey:     null,
        sceneMode,
        records:     auto.containers.slice(0, 50).map((el, i) =>
          buildRecordFromContainer(el, i, sceneMode, null)
        ),
        extractedAt: new Date().toISOString(),
      };
    }
  }

  const records: BulkRecord[] = containers
    .slice(0, 50)
    .map((el, i) => buildRecordFromContainer(el, i, sceneMode, rule));

  return {
    source:      document.location.hostname,
    mode:        'rule',
    ruleKey,
    sceneMode,
    records,
    extractedAt: new Date().toISOString(),
  };
}

// ── 自适应容器发现器（Level 2 语义 + Level 3 密度）──────────────────────────

interface AutoFixResult {
  containers: Element[];
  strategy: 'semantic' | 'density_heuristic';
  confidence: number;
}

function autoFixContainerSelector(): AutoFixResult | null {
  // Level 2：语义指纹选择器优先级链
  const SEMANTIC_SELECTORS = [
    '[role="article"]',
    '[role="listitem"]',
    'article',
    'li:has(h2)',
    'li:has(h3)',
    'li:has(a[href])',
    '[data-testid]',
  ];

  for (const sel of SEMANTIC_SELECTORS) {
    try {
      const els = Array.from(document.querySelectorAll(sel));
      if (els.length >= 3) {
        return {
          containers: els,
          strategy:   'semantic',
          confidence: els.length >= 5 ? 0.7 : 0.5,
        };
      }
    } catch {
      // :has() 可能在旧环境抛出，安全跳过
    }
  }

  // Level 3：密度启发式 — 同父级重复 5+ 次、含链接和文本的元素
  const CANDIDATE_TAGS = ['div', 'li', 'section', 'tr'] as const;
  for (const tag of CANDIDATE_TAGS) {
    const els = Array.from(document.querySelectorAll(tag)).filter(el => {
      const text = (el.textContent ?? '').trim();
      return (
        el.querySelector('a[href]') !== null &&
        text.length > 20 &&
        el.closest('nav, footer, header, aside') === null
      );
    });
    if (els.length >= 5) {
      const parent = els[0].parentElement;
      const siblings = els.filter(e => e.parentElement === parent);
      if (siblings.length >= 5) {
        return {
          containers: siblings,
          strategy:   'density_heuristic',
          confidence: 0.4,
        };
      }
    }
  }

  return null;
}

// ── 通用结构回退 ──────────────────────────────────────────────────────────────

function extractFallbackGeneric(sceneMode: SceneMode): BulkResult {
  const autoFixed = autoFixContainerSelector();
  if (autoFixed !== null && autoFixed.containers.length >= 3) {
    const records: BulkRecord[] = autoFixed.containers
      .slice(0, 50)
      .map((el, i) => buildRecordFromContainer(el, i, sceneMode, null));
    return {
      source:      document.location.hostname,
      mode:        'fallback',
      ruleKey:     null,
      sceneMode,
      records,
      extractedAt: new Date().toISOString(),
    };
  }

  const GENERIC_SELECTORS = ['.result', 'article', '[class*="card"]', '[class*="listing"]', 'li'];
  for (const sel of GENERIC_SELECTORS) {
    const els = Array.from(document.querySelectorAll(sel));
    if (els.length >= 3) {
      const records: BulkRecord[] = els
        .slice(0, 50)
        .map((el, i) => buildRecordFromContainer(el, i, sceneMode, null));
      return {
        source:      document.location.hostname,
        mode:        'fallback',
        ruleKey:     null,
        sceneMode,
        records,
        extractedAt: new Date().toISOString(),
      };
    }
  }

  return extractFallback(sceneMode);
}

// ── 正则回退：全页扫描 ────────────────────────────────────────────────────────

function extractFallback(sceneMode: SceneMode): BulkResult {
  const body = (document.body as HTMLElement | null)?.innerText ?? '';

  const phones = [...body.matchAll(PHONE_RE)].map(m => m[0].trim());
  const emails = [...body.matchAll(EMAIL_RE)].map(m => m[0].trim());
  const maxRows = Math.max(phones.length, emails.length, 0);
  const sceneConfig = getSceneConfig(sceneMode);
  const hostname = document.location.hostname;

  const records: BulkRecord[] = Array.from(
    { length: Math.min(maxRows, 50) },
    (_, i) => {
      const url = document.location.href;
      const raw: Record<string, string> = {
        title:        document.title || '',
        phone:        normalizePhone(phones[i] ?? null) ?? '',
        email:        emails[i] ?? '',
        url,
        address:      sceneMode === 'real_estate' ? document.title || '' : '',
        snippet:      '',
        rating:       '',
        reviewCount:  '',
        category:     '',
        priceRange:   '',
        price:        '',
        sku:          '',
        vendor:       '',
        agent:        '',
        propertyType: '',
        sender:       '',
        content:      document.title || '',
        time:         '',
        platform:     hostname,
      };

      const data: Record<string, string> = { URL: url };
      for (const field of sceneConfig.fields) {
        if (field.source != null) {
          data[field.key] = validateFieldValue(raw[field.source] ?? '', field.type);
        }
      }

      return {
        index: i,
        invalidFields: evaluateInvalidFields({ index: i, invalidFields: [], data }, sceneConfig),
        data,
      };
    },
  );

  return {
    source:      hostname,
    mode:        'fallback',
    ruleKey:     null,
    sceneMode,
    records,
    extractedAt: new Date().toISOString(),
  };
}

// ── 主入口 ────────────────────────────────────────────────────────────────────

/**
 * Extracts bulk list data from the current page using CSS rules and heuristics.
 * Called by the content script when it receives TRIGGER_BULK_EXTRACT.
 * @param sceneMode - Scenario (b2b, local_travel, ecommerce, real_estate, social_chat).
 * @returns BulkResult with records and metadata (source, mode, ruleKey, sceneMode).
 */
export function extractBulkList(sceneMode: SceneMode = 'b2b'): BulkResult {
  // 终极全局拦截：彻底接管 TripAdvisor 域名
  if (window.location.hostname.includes('tripadvisor')) {
    try {
      const rawList = forceExtractTripAdvisor();
      const sceneConfig = getSceneConfig('local_travel');
      const records: BulkRecord[] = rawList.map((raw: Record<string, unknown>, i: number) => {
        const data: Record<string, string> = {};
        if (raw.url) data['URL'] = String(raw.url);
        for (const field of sceneConfig.fields) {
          if (field.source != null) {
            const rawVal = (raw[field.source] ?? '') as string;
            data[field.key] = validateFieldValue(rawVal, field.type);
          }
        }
        return {
          index: i,
          invalidFields: evaluateInvalidFields({ index: i, invalidFields: [], data }, sceneConfig),
          data,
        };
      });
      return {
        source:      window.location.href,
        mode:        'heuristic',
        ruleKey:     'tripadvisor_global',
        sceneMode,
        records,
        extractedAt: new Date().toISOString(),
      };
    } catch (e) {
      console.error('[AQUO] Intercept Error:', e);
      return {
        source:      window.location.href,
        mode:        'heuristic',
        ruleKey:     'tripadvisor_global',
        sceneMode,
        records:     [],
        extractedAt: new Date().toISOString(),
      };
    }
  }

  const hostname = document.location.hostname;

  for (const [key, rule] of Object.entries(SITE_RULES)) {
    if (hostname.includes(key)) {
      return extractWithRule(rule, key, sceneMode);
    }
  }

  return extractFallbackGeneric(sceneMode);
}

// ── TripAdvisor 硬劫持：完全独立、自带容错 ───────────────────────────────────

function forceExtractTripAdvisor(): any[] {
  const links = Array.from(document.querySelectorAll('a[href*="/Restaurant_Review"]'));
  const cardSet = new Set<Element>();

  for (const link of links) {
    let current: Element | null = link;
    let depth = 0;
    while (current && depth < 10) {
      const text = (current as HTMLElement).innerText || '';
      // 智能判断：如果这个节点的文本包含换行，且长度足够，大概率是卡片主容器
      if (text.length > 30 && text.split('\n').length >= 3) {
        cardSet.add(current);
        break; // 找到了就停止向上爬
      }
      current = current.parentElement;
      depth++;
    }
  }

  const cards = Array.from(cardSet);
  const records = [];

  for (const [index, card] of cards.entries()) {
    const innerText = (card as HTMLElement).innerText;
    if (!innerText) continue;

    const lines = innerText.split('\n').map(s => s.trim()).filter(Boolean);
    if (lines.length < 2) continue; // 文本太少绝对不是有效卡片

    const title = lines[0].replace(/^\d+\.\s*/, '').trim() || '';
    const rating = lines.find(l => /^[0-5]\.\d$/.test(l)) || '';

    let reviewCount = '';
    const revLine = lines.find(l => /\(([\d,]+)\s*(?:reviews?|条评价|条点评)\)/i.test(l));
    if (revLine) {
      const m = revLine.match(/\(([\d,]+)/);
      if (m) reviewCount = m[1].replace(/,/g, '') || '';
    }

    const priceLine = lines.find(l => /\$/.test(l));
    const priceRange = priceLine ? (priceLine.match(/\${1,4}(?:\s*[-–]\s*\${1,4})?/) || [''])[0] : '';

    const noise = ['Open now', 'Closed', 'Menu', 'Sponsored', 'Write a review'];
    const category = lines.find(l =>
      l !== title && l !== rating && l !== revLine && l !== priceLine &&
      l.length < 60 && !noise.some(n => l.includes(n)) && !/\d{4}/.test(l)
    ) || '';

    const url = (card.querySelector('a[href]') as HTMLAnchorElement)?.href || '';

    const record = { title, rating, reviewCount, category, priceRange, url, forcedReview: false };

    // 防御：只有提取到了名字，才算一条有效数据
    if (title) {
      records.push(record);
    }
  }

  return records;
}
