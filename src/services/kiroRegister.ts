/**
 * AWS Kiro 自动注册服务
 * 对外兼容入口，主流程已切换为纯 HTTP 实现
 */

import { autoRegisterViaApi } from './kiroApiRegister.ts';

export interface RegisterResult {
  success: boolean;
  email?: string;
  ssoToken?: string;
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  name?: string;
  error?: string;
}

/**
 * AWS Kiro 自动注册
 */
export async function autoRegister(
  onProgress?: (message: string) => void,
  proxyUrl?: string
): Promise<RegisterResult> {
  return autoRegisterViaApi(onProgress, proxyUrl);
}
