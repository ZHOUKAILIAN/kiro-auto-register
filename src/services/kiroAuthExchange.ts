import { decode, encode } from 'cbor-x';

const START_URL = 'https://view.awsapps.com/start';
const KIRO_API_BASE = 'https://app.kiro.dev/service/KiroWebPortalService/operation';
const KIRO_SCOPES = [
  'codewhisperer:analysis',
  'codewhisperer:completions',
  'codewhisperer:conversations',
  'codewhisperer:taskassist',
  'codewhisperer:transformations'
];

interface SsoTokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn?: number;
}

interface DeviceAuthorizationResponse {
  deviceCode: string;
  userCode: string;
  interval?: number;
}

interface DeviceSessionResponse {
  token: string;
}

interface AcceptUserCodeResponse {
  deviceContext?: {
    deviceContextId?: string;
    clientId?: string;
    clientType?: string;
  };
}

interface TokenErrorResponse {
  error?: string;
}

interface UserInfoResponse {
  email?: string;
  userId?: string;
}

interface UsageBreakdownItem {
  resourceType?: string;
  currentUsage?: number;
  usageLimit?: number;
}

interface UsageResponse {
  userInfo?: {
    email?: string;
  };
  subscriptionInfo?: {
    subscriptionTitle?: string;
  };
  usageBreakdownList?: UsageBreakdownItem[];
}

export interface CredentialExchangeResult {
  success: boolean;
  accessToken?: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
  expiresIn?: number;
  email?: string;
  userId?: string;
  subscriptionTitle?: string;
  usageCurrent?: number;
  usageLimit?: number;
  region?: string;
  authMethod?: 'builder-id';
  provider?: 'BuilderId';
  error?: string;
}

function logProgress(onProgress: ((message: string) => void) | undefined, message: string): void {
  onProgress?.(message);
}

function createInvocationId(): string {
  return crypto.randomUUID();
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function kiroApiRequest<T>(
  operation: string,
  body: Record<string, unknown>,
  accessToken: string
): Promise<T> {
  const response = await fetch(`${KIRO_API_BASE}/${operation}`, {
    method: 'POST',
    headers: {
      accept: 'application/cbor',
      'content-type': 'application/cbor',
      'smithy-protocol': 'rpc-v2-cbor',
      'amz-sdk-invocation-id': createInvocationId(),
      'amz-sdk-request': 'attempt=1; max=1',
      'x-amz-user-agent': 'aws-sdk-js/1.0.0 kiro-auto-register/1.0.0',
      authorization: `Bearer ${accessToken}`,
      cookie: `Idp=BuilderId; AccessToken=${accessToken}`
    },
    body: Buffer.from(encode(body))
  });

  if (!response.ok) {
    const errorBuffer = Buffer.from(await response.arrayBuffer());
    try {
      const errorPayload = decode(errorBuffer) as { __type?: string; message?: string };
      const errorType = errorPayload.__type?.split('#').pop();
      throw new Error(errorPayload.message ? `${errorType || 'KiroError'}: ${errorPayload.message}` : `HTTP ${response.status}`);
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`HTTP ${response.status}`);
    }
  }

  return decode(Buffer.from(await response.arrayBuffer())) as T;
}

async function getUserInfo(accessToken: string): Promise<UserInfoResponse | undefined> {
  return kiroApiRequest<UserInfoResponse>('GetUserInfo', { origin: 'KIRO_IDE' }, accessToken);
}

async function getUsage(accessToken: string): Promise<UsageResponse | undefined> {
  return kiroApiRequest<UsageResponse>(
    'GetUserUsageAndLimits',
    { isEmailRequired: true, origin: 'KIRO_IDE' },
    accessToken
  );
}

export async function exchangeSsoToken(
  ssoToken: string,
  region: string = 'us-east-1',
  onProgress?: (message: string) => void
): Promise<CredentialExchangeResult> {
  const oidcBase = `https://oidc.${region}.amazonaws.com`;
  const portalBase = `https://portal.sso.${region}.amazonaws.com`;

  try {
    logProgress(onProgress, '========== 兑换凭证：注册 OIDC 客户端 ==========');
    const registerResponse = await fetch(`${oidcBase}/client/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        clientName: 'Kiro Auto Register',
        clientType: 'public',
        scopes: KIRO_SCOPES,
        grantTypes: ['urn:ietf:params:oauth:grant-type:device_code', 'refresh_token'],
        issuerUrl: START_URL
      })
    });

    if (!registerResponse.ok) {
      throw new Error(`OIDC 客户端注册失败: ${registerResponse.status}`);
    }

    const { clientId, clientSecret } = await readJson<{ clientId: string; clientSecret: string }>(
      registerResponse
    );

    logProgress(onProgress, '========== 兑换凭证：申请设备授权 ==========');
    const deviceAuthorizationResponse = await fetch(`${oidcBase}/device_authorization`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        clientId,
        clientSecret,
        startUrl: START_URL
      })
    });

    if (!deviceAuthorizationResponse.ok) {
      throw new Error(`设备授权失败: ${deviceAuthorizationResponse.status}`);
    }

    const { deviceCode, userCode, interval = 1 } = await readJson<DeviceAuthorizationResponse>(
      deviceAuthorizationResponse
    );

    logProgress(onProgress, '========== 兑换凭证：校验 SSO Token ==========');
    const whoAmIResponse = await fetch(`${portalBase}/token/whoAmI`, {
      headers: {
        Authorization: `Bearer ${ssoToken}`,
        Accept: 'application/json'
      }
    });

    if (!whoAmIResponse.ok) {
      throw new Error(`SSO Token 校验失败: ${whoAmIResponse.status}`);
    }

    logProgress(onProgress, '========== 兑换凭证：创建设备会话 ==========');
    const deviceSessionResponse = await fetch(`${portalBase}/session/device`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ssoToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });

    if (!deviceSessionResponse.ok) {
      throw new Error(`设备会话创建失败: ${deviceSessionResponse.status}`);
    }

    const { token: deviceSessionToken } = await readJson<DeviceSessionResponse>(deviceSessionResponse);

    logProgress(onProgress, '========== 兑换凭证：接受用户代码 ==========');
    const acceptUserCodeResponse = await fetch(`${oidcBase}/device_authorization/accept_user_code`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Referer: 'https://view.awsapps.com/'
      },
      body: JSON.stringify({
        userCode,
        userSessionId: deviceSessionToken
      })
    });

    if (!acceptUserCodeResponse.ok) {
      throw new Error(`接受用户代码失败: ${acceptUserCodeResponse.status}`);
    }

    const acceptUserCodeResult = await readJson<AcceptUserCodeResponse>(acceptUserCodeResponse);

    if (acceptUserCodeResult.deviceContext?.deviceContextId) {
      logProgress(onProgress, '========== 兑换凭证：批准设备授权 ==========');
      const associateTokenResponse = await fetch(`${oidcBase}/device_authorization/associate_token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Referer: 'https://view.awsapps.com/'
        },
        body: JSON.stringify({
          deviceContext: {
            deviceContextId: acceptUserCodeResult.deviceContext.deviceContextId,
            clientId: acceptUserCodeResult.deviceContext.clientId || clientId,
            clientType: acceptUserCodeResult.deviceContext.clientType || 'public'
          },
          userSessionId: deviceSessionToken
        })
      });

      if (!associateTokenResponse.ok) {
        throw new Error(`批准设备授权失败: ${associateTokenResponse.status}`);
      }
    }

    logProgress(onProgress, '========== 兑换凭证：轮询 Access Token ==========');
    const pollStartedAt = Date.now();

    while (Date.now() - pollStartedAt < 120000) {
      await new Promise((resolve) => setTimeout(resolve, interval * 1000));

      const tokenResponse = await fetch(`${oidcBase}/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          clientId,
          clientSecret,
          grantType: 'urn:ietf:params:oauth:grant-type:device_code',
          deviceCode
        })
      });

      if (tokenResponse.ok) {
        const tokenPayload = await readJson<SsoTokenResponse>(tokenResponse);
        logProgress(onProgress, '========== 兑换凭证：读取 Kiro 用户信息 ==========');

        const [userInfo, usageInfo] = await Promise.all([
          getUserInfo(tokenPayload.accessToken).catch(() => undefined),
          getUsage(tokenPayload.accessToken).catch(() => undefined)
        ]);

        const creditUsage = usageInfo?.usageBreakdownList?.find(
          (item) => item.resourceType === 'CREDIT'
        );

        return {
          success: true,
          accessToken: tokenPayload.accessToken,
          refreshToken: tokenPayload.refreshToken,
          clientId,
          clientSecret,
          expiresIn: tokenPayload.expiresIn ?? 3600,
          email: userInfo?.email || usageInfo?.userInfo?.email,
          userId: userInfo?.userId,
          subscriptionTitle: usageInfo?.subscriptionInfo?.subscriptionTitle || '',
          usageCurrent: creditUsage?.currentUsage ?? 0,
          usageLimit: creditUsage?.usageLimit ?? 0,
          region,
          authMethod: 'builder-id',
          provider: 'BuilderId'
        };
      }

      if (tokenResponse.status === 400) {
        const tokenError = await readJson<TokenErrorResponse>(tokenResponse);
        if (tokenError.error === 'authorization_pending') {
          continue;
        }
        if (tokenError.error === 'slow_down') {
          continue;
        }
        throw new Error(`Token 轮询失败: ${tokenError.error || 'unknown_error'}`);
      }

      throw new Error(`Token 轮询失败: ${tokenResponse.status}`);
    }

    throw new Error('Token 兑换超时');
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
