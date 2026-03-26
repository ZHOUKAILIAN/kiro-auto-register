import crypto from 'node:crypto';

import { formatErrorDetails } from './errorDetails.ts';
import type { FetchImpl } from './httpClient.ts';
import type { ManagedEmailProvider } from '../shared/contracts.ts';

const DEFAULT_BASE_URL = 'https://moemail.app';
const DEFAULT_EXPIRY_TIME_MS = 60 * 60 * 1000;
const DEFAULT_POLL_INTERVAL_MS = 3_000;
const OTP_SENT_AT_TOLERANCE_MS = 2_000;
const AWS_SENDERS = [
  'no-reply@signin.aws',
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

export interface MoeMailConfig {
  baseUrl?: string;
  apiKey: string;
  preferredDomain?: string;
  fetchImpl?: FetchImpl;
  onProgress?: (message: string) => void;
}

export interface MoeMailInbox {
  id: string;
  email: string;
  createdAt: number;
  provider: Extract<ManagedEmailProvider, 'moemail-api'>;
}

interface MoeMailMessage {
  id: string;
  from_address?: string;
  subject?: string;
  content?: string;
  html?: string;
  received_at?: number | string;
}

interface ResolvedMoeMailConfig {
  apiKey: string;
  baseUrl: string;
  preferredDomain: string;
  fetchImpl: FetchImpl;
  onProgress?: (message: string) => void;
}

function logProgress(onProgress: ((message: string) => void) | undefined, message: string): void {
  onProgress?.(message);
}

function sleep(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

function summarizeResponseBody(text: string): string {
  const normalized = text.trim().replace(/\s+/g, ' ');
  if (!normalized) {
    return '';
  }

  return normalized.length > 240 ? `${normalized.slice(0, 240)}...` : normalized;
}

function parseJsonSafely<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function normalizeBaseUrl(baseUrl?: string): string {
  const normalized = (baseUrl ?? DEFAULT_BASE_URL).trim() || DEFAULT_BASE_URL;
  return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
}

function maskApiKey(value: string): string {
  if (!value) {
    return '-';
  }

  if (value.length <= 12) {
    return value;
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function resolveConfig(config: MoeMailConfig): ResolvedMoeMailConfig {
  const apiKey = config.apiKey.trim();
  if (!apiKey) {
    throw new Error('缺少 MoeMail API Key');
  }

  return {
    apiKey,
    baseUrl: normalizeBaseUrl(config.baseUrl),
    preferredDomain: config.preferredDomain?.trim() ?? '',
    fetchImpl: config.fetchImpl ?? globalThis.fetch.bind(globalThis),
    onProgress: config.onProgress
  };
}

function buildHeaders(apiKey: string, extraHeaders?: HeadersInit): Headers {
  const headers = new Headers(extraHeaders);
  headers.set('accept', 'application/json');
  headers.set('x-api-key', apiKey);
  return headers;
}

async function requestJson<T>(
  config: ResolvedMoeMailConfig,
  pathname: string,
  init: RequestInit = {},
  errorPrefix: string
): Promise<T> {
  const response = await config.fetchImpl(`${config.baseUrl}${pathname}`, {
    ...init,
    headers: buildHeaders(config.apiKey, init.headers)
  });
  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(
      `${errorPrefix}: HTTP ${response.status}${responseText ? ` ${summarizeResponseBody(responseText)}` : ''}`
    );
  }

  const payload = parseJsonSafely<T>(responseText);
  if (!payload) {
    throw new Error(`${errorPrefix}: 响应不是有效 JSON`);
  }

  return payload;
}

function parseDomains(payload: { emailDomains?: unknown }): string[] {
  if (typeof payload.emailDomains === 'string') {
    return payload.emailDomains
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (Array.isArray(payload.emailDomains)) {
    return payload.emailDomains
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean);
  }

  return [];
}

function pickDomain(preferredDomain: string, domains: string[]): string {
  if (preferredDomain) {
    if (!domains.includes(preferredDomain)) {
      throw new Error(`MoeMail 域名不可用: ${preferredDomain}`);
    }

    return preferredDomain;
  }

  const fallback = domains[0];
  if (!fallback) {
    throw new Error('MoeMail 未返回可用邮箱域名');
  }

  return fallback;
}

function parseMessageTime(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric;
    }

    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }

  return null;
}

function isAwsSender(address: string): boolean {
  const normalized = address.toLowerCase();
  return AWS_SENDERS.some((sender) => normalized.includes(sender));
}

function htmlToText(htmlContent: string): string {
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

function extractVerificationCode(text: string): string | null {
  if (!text) {
    return null;
  }

  for (const pattern of OTP_PATTERNS) {
    const matches = text.matchAll(new RegExp(pattern.source, `${pattern.flags}g`));
    for (const match of matches) {
      const code = match[1];
      if (code && /^\d{6}$/.test(code)) {
        return code;
      }
    }
  }

  return null;
}

async function fetchMessages(
  inbox: MoeMailInbox,
  config: ResolvedMoeMailConfig
): Promise<MoeMailMessage[]> {
  const payload = await requestJson<{ messages?: MoeMailMessage[] }>(
    config,
    `/api/emails/${encodeURIComponent(inbox.id)}`,
    {},
    'MoeMail 读取邮件失败'
  );

  return Array.isArray(payload.messages) ? payload.messages : [];
}

export async function createMoeMailInbox(config: MoeMailConfig): Promise<MoeMailInbox> {
  const resolved = resolveConfig(config);

  logProgress(resolved.onProgress, `MoeMail: base_url=${resolved.baseUrl}`);
  logProgress(resolved.onProgress, `MoeMail: api_key=${maskApiKey(resolved.apiKey)}`);
  logProgress(resolved.onProgress, 'MoeMail: 读取系统配置...');

  const siteConfig = await requestJson<{ emailDomains?: unknown }>(
    resolved,
    '/api/config',
    {},
    'MoeMail 读取配置失败'
  );
  const domain = pickDomain(resolved.preferredDomain, parseDomains(siteConfig));
  const name = `kiro-${crypto.randomUUID().slice(0, 8)}`;

  logProgress(resolved.onProgress, `MoeMail: 选择域名 ${domain}`);
  const payload = await requestJson<{ id?: string; email?: string }>(
    resolved,
    '/api/emails/generate',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        name,
        expiryTime: DEFAULT_EXPIRY_TIME_MS,
        domain
      })
    },
    'MoeMail 创建邮箱失败'
  );

  if (!payload.id || !payload.email) {
    throw new Error('MoeMail 创建邮箱失败: 响应缺少 id/email');
  }

  logProgress(resolved.onProgress, `MoeMail: 邮箱创建成功 ${payload.email}`);
  return {
    id: payload.id,
    email: payload.email,
    createdAt: Date.now(),
    provider: 'moemail-api'
  };
}

export async function waitForMoeMailVerificationCode(
  inbox: MoeMailInbox,
  timeoutMs: number = 120_000,
  options: MoeMailConfig & {
    otpSentAt?: number;
    pollIntervalMs?: number;
  }
): Promise<string | null> {
  const resolved = resolveConfig(options);
  const pollIntervalMs = Math.max(0, options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS);
  const otpSentAt = options.otpSentAt;
  const startTime = Date.now();
  const seenIds = new Set<string>();
  let pollCount = 0;

  logProgress(resolved.onProgress, `MoeMail: 开始轮询邮箱 ${inbox.email}`);

  while (Date.now() - startTime < timeoutMs) {
    pollCount += 1;
    try {
      const messages = await fetchMessages(inbox, resolved);
      logProgress(resolved.onProgress, `MoeMail: 第 ${pollCount} 次轮询，当前 ${messages.length} 封邮件`);

      for (const message of messages) {
        if (!message.id || seenIds.has(message.id)) {
          continue;
        }
        seenIds.add(message.id);

        const sender = message.from_address ?? '';
        if (!isAwsSender(sender)) {
          continue;
        }

        const receivedAt = parseMessageTime(message.received_at);
        if (
          typeof otpSentAt === 'number' &&
          receivedAt !== null &&
          receivedAt < otpSentAt - OTP_SENT_AT_TOLERANCE_MS
        ) {
          continue;
        }

        const candidateText = [message.subject, message.content, htmlToText(message.html ?? '')]
          .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
          .join('\n');
        const code = extractVerificationCode(candidateText);

        logProgress(
          resolved.onProgress,
          `MoeMail: 命中邮件 发件人=${sender || '-'} 主题=${message.subject || '-'}`
        );

        if (code) {
          logProgress(resolved.onProgress, `MoeMail: 找到验证码: ${code}`);
          return code;
        }
      }
    } catch (error) {
      logProgress(resolved.onProgress, `MoeMail: 拉取邮件异常 ${formatErrorDetails(error)}`);
    }

    await sleep(pollIntervalMs);
  }

  logProgress(resolved.onProgress, `MoeMail: 等待验证码超时 ${timeoutMs}ms`);
  return null;
}

export async function probeMoeMailProvider(config: MoeMailConfig): Promise<{
  provider: ManagedEmailProvider;
  success: boolean;
  message: string;
  email?: string;
}> {
  try {
    const inbox = await createMoeMailInbox(config);
    return {
      provider: 'moemail-api',
      success: true,
      message: 'MoeMail provider 可用',
      email: inbox.email
    };
  } catch (error) {
    return {
      provider: 'moemail-api',
      success: false,
      message: `MoeMail provider 不可用: ${formatErrorDetails(error)}`
    };
  }
}
