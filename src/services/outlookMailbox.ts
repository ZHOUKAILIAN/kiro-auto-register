import { formatErrorDetails } from './errorDetails.ts';
import type { FetchImpl } from './httpClient.ts';
import type { MailboxProvider } from '../shared/contracts.ts';

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_POLL_INTERVAL_MS = 5_000;
const GRAPH_MESSAGES_URL = 'https://graph.microsoft.com/v1.0/me/messages';
const TOKEN_ENDPOINTS = [
  'https://login.microsoftonline.com/consumers/oauth2/v2.0/token',
  'https://login.microsoftonline.com/common/oauth2/v2.0/token'
];
const AWS_SENDERS = [
  'no-reply@login.awsapps.com',
  'noreply@amazon.com',
  'account-update@amazon.com',
  'no-reply@aws.amazon.com',
  'noreply@aws.amazon.com',
  'aws'
];
const OTP_PATTERNS = [
  /(?:verification\s*code|验证码|your code is|code is)[：:\s]*(\d{6})/i,
  /(?:is|为)[：:\s]*(\d{6})\b/i,
  /^\s*(\d{6})\s*$/m,
  />\s*(\d{6})\s*</
];

interface OutlookMessage {
  id: string;
  subject: string;
  from?: {
    emailAddress?: {
      address?: string;
    };
  };
  receivedDateTime?: string;
  bodyPreview?: string;
  body?: {
    content?: string;
    contentType?: string;
  };
}

export interface OutlookMailboxConfig {
  email: string;
  clientId: string;
  refreshToken: string;
  otpSentAt?: number;
  timeoutMs?: number;
  pollIntervalMs?: number;
  onProgress?: (message: string) => void;
  fetchImpl?: FetchImpl;
}

export interface OutlookMailboxOtpResult {
  code: string | null;
  nextRefreshToken?: string;
}

export interface OutlookMailboxProbeResult {
  provider: MailboxProvider;
  success: boolean;
  message: string;
  nextRefreshToken?: string;
}

function logProgress(
  onProgress: ((message: string) => void) | undefined,
  message: string
): void {
  onProgress?.(message);
}

function maskSecret(value: string, head: number = 8, tail: number = 6): string {
  if (!value) {
    return '-';
  }

  if (value.length <= head + tail) {
    return value;
  }

  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}

function ensureOutlookCredentials(config: OutlookMailboxConfig): void {
  if (!config.clientId.trim()) {
    throw new Error('缺少 Outlook Graph client id');
  }

  if (!config.refreshToken.trim()) {
    throw new Error('缺少 Outlook Graph refresh token');
  }

  if (!config.email.trim()) {
    throw new Error('缺少 Outlook 邮箱地址');
  }
}

function isAwsSender(address: string): boolean {
  const normalized = address.toLowerCase();
  return AWS_SENDERS.some((sender) => normalized.includes(sender));
}

function isMessageRecent(receivedDateTime: string | undefined, otpSentAt: number | undefined): boolean {
  if (!receivedDateTime || !otpSentAt) {
    return true;
  }

  const receivedAt = Date.parse(receivedDateTime);
  if (Number.isNaN(receivedAt)) {
    return true;
  }

  return receivedAt >= otpSentAt - 60_000;
}

function sleep(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

export function htmlToText(htmlContent: string): string {
  if (!htmlContent) {
    return '';
  }

  return htmlContent
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_match, codePoint) => String.fromCharCode(Number(codePoint)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_match, codePoint) =>
      String.fromCharCode(Number.parseInt(codePoint, 16))
    )
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractVerificationCode(text: string): string | null {
  if (!text) {
    return null;
  }

  for (const pattern of OTP_PATTERNS) {
    const matches = text.matchAll(new RegExp(pattern.source, `${pattern.flags}g`));
    for (const match of matches) {
      const code = match[1];
      if (!code || !/^\d{6}$/.test(code)) {
        continue;
      }

      const start = Math.max(0, (match.index ?? 0) - 20);
      const end = Math.min(text.length, (match.index ?? 0) + match[0].length + 20);
      const context = text.slice(start, end);

      if (/#[0-9a-fA-F]{6}/.test(context) && context.includes(`#${code}`)) {
        continue;
      }

      if (/color[:\s]*[^;]*\d{6}/i.test(context)) {
        continue;
      }

      if (/rgb|rgba|hsl/i.test(context)) {
        continue;
      }

      if (/\d{7,}/.test(context)) {
        continue;
      }

      return code;
    }
  }

  return null;
}

async function refreshOutlookAccessToken(config: OutlookMailboxConfig): Promise<{
  accessToken: string;
  nextRefreshToken?: string;
}> {
  const fetchImpl = config.fetchImpl ?? globalThis.fetch.bind(globalThis);
  let lastError = '未知错误';

  logProgress(config.onProgress, 'Outlook: 刷新 Graph access token...');
  logProgress(config.onProgress, `Outlook: client_id=${config.clientId}`);
  logProgress(config.onProgress, `Outlook: refresh_token=${maskSecret(config.refreshToken)}`);

  for (const endpoint of TOKEN_ENDPOINTS) {
    try {
      const body = new URLSearchParams({
        client_id: config.clientId,
        refresh_token: config.refreshToken,
        grant_type: 'refresh_token'
      });

      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded'
        },
        body: body.toString()
      });

      const responseText = await response.text();
      if (!response.ok) {
        lastError = `HTTP ${response.status}${responseText ? ` ${responseText}` : ''}`;
        logProgress(config.onProgress, `Outlook: token 刷新失败 ${endpoint} -> ${lastError}`);
        continue;
      }

      const payload = JSON.parse(responseText) as {
        access_token?: string;
        refresh_token?: string;
      };

      if (!payload.access_token) {
        lastError = '响应缺少 access_token';
        continue;
      }

      logProgress(config.onProgress, 'Outlook: Graph access token 刷新成功');
      return {
        accessToken: payload.access_token,
        nextRefreshToken:
          typeof payload.refresh_token === 'string' && payload.refresh_token
            ? payload.refresh_token
            : undefined
      };
    } catch (error) {
      lastError = formatErrorDetails(error);
      logProgress(config.onProgress, `Outlook: token 请求异常 ${endpoint} -> ${lastError}`);
    }
  }

  throw new Error(`Outlook Graph token 刷新失败: ${lastError}`);
}

async function readRecentOutlookMessages(
  accessToken: string,
  config: OutlookMailboxConfig
): Promise<OutlookMessage[]> {
  const fetchImpl = config.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const params = new URLSearchParams({
    '$top': '25',
    '$orderby': 'receivedDateTime desc',
    '$select': 'id,subject,from,receivedDateTime,bodyPreview,body'
  });

  const response = await fetchImpl(`${GRAPH_MESSAGES_URL}?${params.toString()}`, {
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: 'application/json',
      prefer: 'outlook.body-content-type="text"'
    }
  });

  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(
      `Graph 邮件读取失败: HTTP ${response.status}${responseText ? ` ${responseText}` : ''}`
    );
  }

  const payload = (await response.json()) as {
    value?: OutlookMessage[];
  };

  return Array.isArray(payload.value) ? payload.value : [];
}

/**
 * Poll Outlook mail through Microsoft Graph until a 6-digit AWS verification code is found.
 */
export async function waitForOutlookVerificationCode(
  config: OutlookMailboxConfig
): Promise<OutlookMailboxOtpResult> {
  ensureOutlookCredentials(config);

  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const pollIntervalMs = config.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const deadline = Date.now() + timeoutMs;
  const checkedIds = new Set<string>();

  logProgress(config.onProgress, '========== Outlook 邮箱自动收码 ==========');
  const tokenResult = await refreshOutlookAccessToken(config);

  while (Date.now() < deadline) {
    const messages = await readRecentOutlookMessages(tokenResult.accessToken, config);
    logProgress(config.onProgress, `Outlook: 本轮读取 ${messages.length} 封邮件`);

    for (const message of messages) {
      if (!message.id || checkedIds.has(message.id)) {
        continue;
      }

      checkedIds.add(message.id);
      const fromAddress = message.from?.emailAddress?.address?.toLowerCase() ?? '';
      if (!isAwsSender(fromAddress)) {
        continue;
      }

      if (!isMessageRecent(message.receivedDateTime, config.otpSentAt)) {
        continue;
      }

      logProgress(
        config.onProgress,
        `Outlook: 命中 AWS 邮件 ${fromAddress} / ${message.subject || '(无主题)'} / ${message.receivedDateTime || '-'}`
      );

      const bodyContent = message.body?.content ?? '';
      const candidates = [htmlToText(bodyContent), bodyContent, message.bodyPreview ?? ''];

      for (const candidate of candidates) {
        const code = extractVerificationCode(candidate);
        if (!code) {
          continue;
        }

        logProgress(config.onProgress, `Outlook: 成功提取验证码 ${code}`);
        return {
          code,
          nextRefreshToken: tokenResult.nextRefreshToken
        };
      }

      logProgress(config.onProgress, 'Outlook: 此邮件未提取到验证码，继续轮询');
    }

    await sleep(pollIntervalMs);
  }

  logProgress(config.onProgress, 'Outlook: 轮询超时，未获取到验证码');
  return {
    code: null,
    nextRefreshToken: tokenResult.nextRefreshToken
  };
}

/**
 * Verify that the configured Outlook mailbox can refresh a token and read recent mail.
 */
export async function probeOutlookMailbox(
  config: OutlookMailboxConfig
): Promise<OutlookMailboxProbeResult> {
  try {
    ensureOutlookCredentials(config);
    const tokenResult = await refreshOutlookAccessToken(config);
    const messages = await readRecentOutlookMessages(tokenResult.accessToken, config);

    return {
      provider: 'outlook-graph',
      success: true,
      message: `Outlook 邮箱连接正常，最近读取 ${messages.length} 封邮件`,
      nextRefreshToken: tokenResult.nextRefreshToken
    };
  } catch (error) {
    return {
      provider: 'outlook-graph',
      success: false,
      message: `Outlook 邮箱连接失败: ${formatErrorDetails(error)}`
    };
  }
}
