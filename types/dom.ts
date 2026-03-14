/**
 * DOM 提取相关类型定义
 */

/** Content Script 从页面提取的原始内容 */
export interface PageContent {
  /** 清洗后的纯文本内容（最多 50000 字符） */
  text: string;
  /** 当前页面 URL */
  url: string;
  /** 页面标题 */
  title: string;
  /** 大约单词数（用于本地估算阅读时间） */
  wordCount: number;
  /** meta description（如果存在） */
  metaDescription?: string;
  /** 页面中 input / textarea 元素的非空值（Content Script 扫描） */
  inputValues?: string[];
  /** .email / .phone / .contact 元素的非空文本内容 */
  contactClassText?: string[];
}
