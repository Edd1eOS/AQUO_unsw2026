/**
 * 离线 JWT 验证模块
 * 使用硬编码的 ES256 公钥在本地验证 License JWT，零网络请求
 *
 * License JWT Payload 结构：
 * {
 *   device_id: string,   // 授权绑定的设备 UUID
 *   tier:      string,   // 授权层级，如 "basic" | "pro"
 *   exp:       number,   // Unix 时间戳（秒），过期时间
 *   iat:       number,   // Unix 时间戳（秒），签发时间
 * }
 *
 * 使用方法（开发者签发 JWT）：
 *   1. 生成 ES256 密钥对（见下方注释）
 *   2. 将公钥 JWK 的 x/y 字段填入 PUBLIC_KEY_JWK
 *   3. 使用私钥离线签发 JWT，在 payload 中嵌入 device_id、tier、exp
 *
 * 生成密钥对示例（Node.js）：
 *   import { generateKeyPair, exportJWK } from 'jose';
 *   const { privateKey, publicKey } = await generateKeyPair('ES256');
 *   console.log(await exportJWK(publicKey));  // 填入下方
 *   console.log(await exportJWK(privateKey)); // 离线保存，绝不提交到仓库
 */

import { jwtVerify, importJWK } from 'jose';

/**
 * 硬编码的 ES256 公钥（JWK 格式）
 *
 * ⚠️  生产环境：将下方 x/y 替换为你实际生成的公钥字段
 * ⚠️  私钥绝不提交到代码仓库，只用于离线签发 JWT
 */
const PUBLIC_KEY_JWK = {
  kty: 'EC',
  crv: 'P-256',
  // TODO: 替换为你的 ES256 公钥的 x/y 坐标（Base64URL 编码）
  x: 'cREjP6ZcHuIcaDKv2kqoIHiN_Axi5uMkQSXhUy876yk',
  y: 'LUtIRkS76hbyoOGAb2VCUqGdWl9NdI_0VYLNTANo-1U',
} as const;

export interface JwtVerifyResult {
  tier: string;
  /** Unix 时间戳（秒），null 表示永不过期（jose 允许省略 exp） */
  exp: number | null;
  /** ISO 字符串，方便写入 StoredLicenseData.expiresAt */
  expiresAt: string | null;
}

/**
 * 验证 License JWT
 *
 * @param token    用户输入的 JWT 字符串
 * @param deviceId 本机设备 UUID（来自 getOrCreateDeviceId()）
 *
 * @throws {Error} 签名无效、已过期、设备 ID 不匹配等情况均抛出错误
 *                 错误消息格式：'JWT_<CODE>: <描述>'
 */
export async function verifyJwt(token: string, deviceId: string): Promise<JwtVerifyResult> {
  // 导入硬编码公钥（每次调用，jose 内部缓存 CryptoKey 对象）
  let publicKey: CryptoKey;
  try {
    publicKey = await importJWK(PUBLIC_KEY_JWK, 'ES256') as CryptoKey;
  } catch {
    throw new Error('JWT_KEY_ERROR: 公钥加载失败，请检查扩展配置');
  }

  // 验证签名 + exp + nbf（jose 自动处理）
  let payload: Record<string, unknown>;
  try {
    const result = await jwtVerify(token, publicKey, { algorithms: ['ES256'] });
    payload = result.payload as Record<string, unknown>;
  } catch (err) {
    const msg = String(err);
    if (msg.includes('JWTExpired') || msg.includes('exp')) {
      throw new Error('JWT_EXPIRED: License 已过期，请联系支持续期');
    }
    if (msg.includes('JWSSignatureVerificationFailed') || msg.includes('signature')) {
      throw new Error('JWT_INVALID_SIGNATURE: License Key 签名无效');
    }
    throw new Error(`JWT_INVALID: License Key 无效（${msg}）`);
  }

  // 验证 device_id 与本机匹配
  const claimedDeviceId = payload['device_id'];
  if (typeof claimedDeviceId !== 'string' || claimedDeviceId !== deviceId) {
    throw new Error('JWT_DEVICE_MISMATCH: 此 License Key 不适用于当前设备');
  }

  // 提取 tier
  const tier = typeof payload['tier'] === 'string' ? payload['tier'] : 'basic';

  // 提取过期时间（jose payload.exp 单位为秒）
  const exp = typeof payload['exp'] === 'number' ? payload['exp'] : null;
  const expiresAt = exp !== null ? new Date(exp * 1000).toISOString() : null;

  return { tier, exp, expiresAt };
}
