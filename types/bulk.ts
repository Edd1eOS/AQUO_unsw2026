/**
 * 批量列表提取相关类型定义（场景化 + 动态字段版）
 * BulkRecord 是从页面抓取的单条记录；BulkResult 是完整的提取结果。
 *
 * 设计要点：
 * - BulkRecord 仅包含 index、invalidFields、data；链接存 data['URL']。
 * - SceneConfig 仅用于抓取端按场景填充 data 的 key，以及 evaluateInvalidFields 校验；
 *   UI 与导出的列/表头不由 SceneConfig.fields 决定，而由 getDataKeys(records) 即实际数据的键驱动。
 * - invalidFields 仅当核心字段（required）为空或格式明显错误时才包含对应 key。
 */

/** 用户在侧边栏中可选的批量抓取场景模式 */
export type SceneMode =
  | 'b2b'
  | 'local_travel'
  | 'ecommerce'
  | 'real_estate'
  | 'social_chat';

/** bulkExtractor 原始值枚举，用于按 source 映射到 data[key] */
export type RawFieldSource =
  | 'title'
  | 'phone'
  | 'email'
  | 'url'
  | 'address'
  | 'snippet'
  | 'rating'
  | 'reviewCount'
  | 'category'
  | 'priceRange'
  | 'price'
  | 'sku'
  | 'vendor'
  | 'agent'
  | 'propertyType'
  | 'sender'
  | 'content'
  | 'time'
  | 'platform';

/** 场景字段定义（驱动动态表单 + 智能校验） */
export interface SceneFieldDef {
  /** 字段在记录中的 key，如 Company / Price（英文） */
  key: string;
  /** UI 展示用标签，如“公司名” */
  label: string;
  /** 对应 bulkExtractor 的原始值键，用于按场景动态填充 data */
  source?: RawFieldSource;
  /** 是否为必填字段（为空时直接触发 invalidFields） */
  required?: boolean;
  /** 字段语义类型，用于基础正则校验 */
  type?: 'text' | 'phone' | 'email' | 'price' | 'rating' | 'url' | 'address';
  /** 正常情况下的最小长度（含），如地址至少 5 个字符 */
  minLength?: number;
  /** 正常情况下的最大长度（含），如公司名不超过 100 字符 */
  maxLength?: number;
  /** 额外的匹配模式（通过则认为正常） */
  pattern?: RegExp;
  /** 是否推荐使用多行输入控件（如聊天内容） */
  multiline?: boolean;
}

/** 单个场景配置：字段 Schema + 文案 + 主展示字段 */
export interface SceneConfig {
  id: SceneMode;
  /** 场景名称，如 “B2B Leads” */
  name: string;
  /** 业务描述，用于 UI 提示 */
  description: string;
  /** 用于列表主行展示的字段 key */
  primaryFieldKey: string;
  /** 本场景下的所有业务字段定义 */
  fields: SceneFieldDef[];
}

/** 从列表页中提取的单条记录；仅 index、invalidFields、data，无具体业务字段名。 */
export interface BulkRecord {
  index: number;
  /** 存在格式问题的字段 key 列表；空数组表示无需核对。 */
  invalidFields: string[];
  data: Record<string, string>;
}

/** 批量提取的完整结果 */
export interface BulkResult {
  /** 被抓取页面的 hostname */
  source: string;
  /** 是否命中站点规则（rule）还是正则回退（fallback） */
  mode: 'rule' | 'fallback';
  /** 命中的规则 key（如 'bing'），回退时为 null */
  ruleKey: string | null;
  /** 触发本次抓取时选择的场景模式（旧数据可能缺省） */
  sceneMode?: SceneMode;
  /** 所有提取的行 */
  records: BulkRecord[];
  /** 提取时间 ISO 字符串 */
  extractedAt: string;
}

/** 批量提取状态机状态值，与 AIStatus 并列独立 */
export type BulkStatus = 'idle' | 'extracting' | 'complete' | 'error';

/** Sidebar 中批量模式的状态对象 */
export interface BulkState {
  status: BulkStatus;
  result: BulkResult | null;
  error: string | null;
}

// ── 场景配置中心 ────────────────────────────────────────────────────────────────

/** 每个场景的字段 Schema（key 为英文，与 record.data 一致）；source 供 bulkExtractor 动态填充。 */
export const SCENE_CONFIGS: Record<SceneMode, SceneConfig> = {
  b2b: {
    id: 'b2b',
    name: 'B2B Leads',
    description: 'Extract high-value leads from business directories with auto-cleaned contact info.',
    primaryFieldKey: 'Company',
    fields: [
      { key: 'Company', label: 'Company', source: 'title', required: true, type: 'text', minLength: 2, maxLength: 100 },
      { key: 'Phone', label: 'Phone', source: 'phone', type: 'phone' },
      { key: 'Email', label: 'Email', source: 'email', type: 'email' },
      { key: 'Website', label: 'Website', source: 'url', type: 'url' },
      { key: 'Address', label: 'Address', source: 'address', type: 'address', minLength: 5 },
    ],
  },
  local_travel: {
    id: 'local_travel',
    name: 'Local / Travel',
    description: 'Aggregate local business reviews and ratings for competitor and discovery reports.',
    primaryFieldKey: 'Business_Name',
    fields: [
      { key: 'Business_Name', label: 'Business name', source: 'title', required: true, type: 'text', minLength: 2, maxLength: 100 },
      { key: 'Rating', label: 'Rating', source: 'rating', type: 'rating' },
      { key: 'Review_Count', label: 'Review count', source: 'reviewCount', type: 'text' },
      { key: 'Category', label: 'Category', source: 'category', type: 'text' },
      { key: 'Price_Range', label: 'Price range', source: 'priceRange', type: 'price' },
    ],
  },
  ecommerce: {
    id: 'ecommerce',
    name: 'E-commerce',
    description: 'Export competitor prices, SKUs and ratings for cross-platform price monitoring.',
    primaryFieldKey: 'Product_Name',
    fields: [
      { key: 'Product_Name', label: 'Product name', source: 'title', required: true, type: 'text', minLength: 2, maxLength: 120 },
      { key: 'Price', label: 'Price', source: 'price', required: true, type: 'price' },
      { key: 'SKU', label: 'SKU', source: 'sku', type: 'text', maxLength: 80 },
      { key: 'Rating', label: 'Rating', source: 'rating', type: 'rating' },
      { key: 'Vendor', label: 'Vendor', source: 'vendor', type: 'text' },
    ],
  },
  real_estate: {
    id: 'real_estate',
    name: 'Real Estate',
    description: 'Extract listing address, price and property type to avoid manual entry errors.',
    primaryFieldKey: 'Address',
    fields: [
      { key: 'Address', label: 'Address', source: 'address', required: true, type: 'address', minLength: 5 },
      { key: 'Price', label: 'Price', source: 'price', required: true, type: 'price' },
      { key: 'Property_Type', label: 'Property type', source: 'propertyType', type: 'text' },
      { key: 'Agent', label: 'Agent', source: 'agent', type: 'text' },
    ],
  },
  social_chat: {
    id: 'social_chat',
    name: 'Social / Chat',
    description: 'Structure and back up chat logs with sender and timestamp for business records.',
    primaryFieldKey: 'Sender',
    fields: [
      { key: 'Sender', label: 'Sender', source: 'sender', required: true, type: 'text', minLength: 1, maxLength: 80 },
      { key: 'Content', label: 'Content', source: 'content', required: true, type: 'text', minLength: 2, multiline: true },
      { key: 'Time', label: 'Time', source: 'time', type: 'text' },
      { key: 'Platform', label: 'Platform', source: 'platform', type: 'text' },
    ],
  },
};

/** 安全获取场景配置（缺失时默认 B2B） */
export function getSceneConfig(mode: SceneMode | undefined): SceneConfig {
  if (!mode) return SCENE_CONFIGS.b2b;
  return SCENE_CONFIGS[mode] ?? SCENE_CONFIGS.b2b;
}

/**
 * 将可能存在的旧格式 record（含 title/phone/email 等）规范为 BulkRecord（data 使用英文 key）。
 */
export function normalizeBulkRecord(r: BulkRecord & { needsReview?: boolean; title?: string; phone?: string; email?: string; url?: string; address?: string; snippet?: string }): BulkRecord {
  if (r.data && typeof r.data === 'object') return { index: r.index, invalidFields: r.invalidFields ?? [], data: r.data };
  const data: Record<string, string> = {};
  const oldRecord = r as unknown as Record<string, string>;
  if (oldRecord['url']) data['URL'] = oldRecord['url'];
  for (const field of SCENE_CONFIGS.b2b.fields) {
    if (field.source) {
      data[field.key] = oldRecord[field.source] ?? '';
    }
  }
  return { index: r.index, invalidFields: [], data };
}

/**
 * 从所有记录的 data 合并出唯一键，用于 UI 表头/编辑框与 Excel 导出列。
 * URL 固定排在最后；其余按字母排序。无数据时返回 []。
 */
export function getDataKeys(records: BulkRecord[]): string[] {
  const set = new Set<string>();
  for (const r of records) {
    const data = r.data && typeof r.data === 'object' ? r.data : normalizeBulkRecord(r as Parameters<typeof normalizeBulkRecord>[0]).data;
    for (const k of Object.keys(data)) set.add(k);
  }
  if (set.size === 0) return [];
  const url = 'URL';
  const rest = Array.from(set).filter(k => k !== url).sort();
  return set.has(url) ? [...rest, url] : rest;
}

// ── 智能字段校验工具 ──────────────────────────────────────────────────────────────

/** 单字段是否存在”问题”（决定是否进入 invalidFields） */
export function evaluateFieldIssue(
  rawValue: string | undefined,
  def: SceneFieldDef,
): boolean {
  const value = (rawValue ?? '').trim();

  // 必填字段为空：直接视为问题
  if (!value) {
    return !!def.required;
  }

  // 长度约束（先粗粒度过滤）
  if (typeof def.minLength === 'number' && value.length < def.minLength) {
    return true;
  }
  if (typeof def.maxLength === 'number' && value.length > def.maxLength) {
    return true;
  }

  // 模式约束：如果提供 pattern，则必须匹配
  if (def.pattern && !def.pattern.test(value)) {
    return true;
  }

  // 类型约束：针对电话/价格/评分/地址等做“常识性”检查
  switch (def.type) {
    case 'phone': {
      // 电话必须包含数字，且不应包含字母
      if (!/\d/.test(value)) return true;
      if (/[A-Za-z]/.test(value)) return true;
      // 过短或过长也视为异常
      if (value.replace(/\D/g, '').length < 6 || value.replace(/\D/g, '').length > 20) {
        return true;
      }
      return false;
    }
    case 'price': {
      // 价格中必须至少包含一个数字
      if (!/\d/.test(value)) return true;
      return false;
    }
    case 'email': {
      const EMAIL_VALID_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!EMAIL_VALID_RE.test(value)) return true;
      return false;
    }
    case 'rating': {
      // 简单校验：包含 0-5 之间的一位或一位带小数，可带 /5
      const match = value.match(/([0-5](?:\.\d)?)(?:\s*\/\s*5)?/);
      if (!match) return true;
      const num = parseFloat(match[1]);
      if (Number.isNaN(num) || num < 0 || num > 5) return true;
      return false;
    }
    case 'address': {
      // 地址太短视为异常（若未在 def.minLength 指明）
      if (value.length < (def.minLength ?? 5)) return true;
      return false;
    }
    case 'url': {
      // 简易 URL 检查：包含 . 和 无空格
      if (!value.includes('.') || /\s/.test(value)) return true;
      return false;
    }
    default:
      return false;
  }
}

/**
 * 返回所有存在字段问题的 key 列表。空数组表示该记录无需核对。
 * 取代旧的 evaluateRecordNeedsReview，提供字段级精度。
 */
export function evaluateInvalidFields(
  record: BulkRecord,
  sceneConfig: SceneConfig,
): string[] {
  const invalid: string[] = [];
  for (const field of sceneConfig.fields) {
    if (evaluateFieldIssue(record.data[field.key], field)) {
      invalid.push(field.key);
    }
  }
  return invalid;
}

/** @deprecated 使用 evaluateInvalidFields 替代。保留以兼容旧调用。 */
export function evaluateRecordNeedsReview(
  record: BulkRecord,
  sceneConfig: SceneConfig,
): boolean {
  return evaluateInvalidFields(record, sceneConfig).length > 0;
}

