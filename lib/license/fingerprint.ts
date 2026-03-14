/**
 * 设备指纹模块
 * 生成并持久化一个基于安装的唯一设备 ID
 *
 * 安全说明：
 * - 使用 crypto.randomUUID()，不依赖任何硬件指纹
 * - UUID 与扩展安装绑定，卸载重装后会生成新 ID
 * - 这是有意为之的设计：用户可通过重新激活迁移授权
 */

const DEVICE_ID_KEY = 'dataplumber_device_id';

/**
 * 获取或创建本次安装唯一的设备 ID
 * 首次调用时通过 crypto.randomUUID() 生成并持久化
 */
export async function getOrCreateDeviceId(): Promise<string> {
  const result = await chrome.storage.local.get(DEVICE_ID_KEY);
  if (result[DEVICE_ID_KEY]) {
    return result[DEVICE_ID_KEY] as string;
  }

  // 首次运行：生成并存储设备 ID
  const deviceId = crypto.randomUUID();
  await chrome.storage.local.set({ [DEVICE_ID_KEY]: deviceId });
  return deviceId;
}
