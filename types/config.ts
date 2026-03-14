/**
 * 云端 AI 配置结构
 *
 * 存储于 chrome.storage.local（key: dataplumber_cloud_config）
 * 包含 Provider、API Key、模型名，以及 Custom Provider 的自定义 Base URL。
 */

export interface CloudConfig {
  provider: 'openai' | 'anthropic' | 'custom';
  apiKey: string;
  model: string;
  baseUrl?: string; // 仅 provider === 'custom' 时有效
}
