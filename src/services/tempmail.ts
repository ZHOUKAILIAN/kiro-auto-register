/**
 * Tempmail.lol 邮箱服务
 * 基于 API v2
 */

import type { FetchImpl } from './httpClient.ts';

export interface TempmailInbox {
  email: string;
  token: string;
  createdAt: number;
}

export interface EmailMessage {
  id: string;
  from: string;
  subject: string;
  body: string;
  html: string;
  date?: number;
  received_at?: number;
  created_at?: number;
}

const BASE_URL = 'https://api.tempmail.lol/v2';
const CODE_PATTERN = /\b(\d{6})\b/g;
const OTP_SENT_AT_TOLERANCE_MS = 2000;
const DEFAULT_RETRY_DELAY_MS = 1500;

// AWS 验证码发件人
const AWS_SENDERS = [
  'no-reply@signin.aws',
  'no-reply@login.awsapps.com',
  'noreply@amazon.com',
  'account-update@amazon.com',
  'no-reply@aws.amazon.com',
  'noreply@aws.amazon.com',
  'aws'
];

interface CreateInboxOptions {
  fetchImpl?: FetchImpl;
  maxRetries?: number;
  retryDelayMs?: number;
}

interface GetInboxOptions {
  fetchImpl?: FetchImpl;
}

interface WaitForVerificationCodeOptions {
  fetchImpl?: FetchImpl;
  otpSentAt?: number;
  pollIntervalMs?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function parseMessageTime(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value > 1e12) {
      return value;
    }
    if (value > 1e9) {
      return value * 1000;
    }
    return null;
  }

  const text = String(value).trim();
  if (!text) {
    return null;
  }

  const numeric = Number(text);
  if (Number.isFinite(numeric)) {
    if (numeric > 1e12) {
      return numeric;
    }
    if (numeric > 1e9) {
      return numeric * 1000;
    }
  }

  const timestamp = Date.parse(text);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function getMessageReceivedAt(message: Partial<EmailMessage>): number | null {
  return (
    parseMessageTime(message.received_at) ??
    parseMessageTime(message.date) ??
    parseMessageTime(message.created_at)
  );
}

/**
 * 创建临时邮箱
 */
export async function createInbox(options: CreateInboxOptions = {}): Promise<TempmailInbox> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const maxRetries = Math.max(0, options.maxRetries ?? 2);
  const retryDelayMs = Math.max(0, options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS);

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const response = await fetchImpl(`${BASE_URL}/inbox/create`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });

      if (!response.ok) {
        if (attempt < maxRetries && isRetryableStatus(response.status)) {
          await sleep(retryDelayMs);
          continue;
        }
        throw new Error(`创建邮箱失败: ${response.status}`);
      }

      const data = await response.json();
      return {
        email: data.address,
        token: data.token,
        createdAt: Date.now()
      };
    } catch (error) {
      if (attempt < maxRetries) {
        await sleep(retryDelayMs);
        continue;
      }

      if (error instanceof Error) {
        throw error;
      }
      throw new Error(String(error));
    }
  }

  throw new Error('创建邮箱失败: exhausted retries');
}

/**
 * 获取收件箱邮件列表
 */
export async function getInbox(
  token: string,
  options: GetInboxOptions = {}
): Promise<EmailMessage[]> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const response = await fetchImpl(`${BASE_URL}/inbox?token=${token}`, {
    headers: {
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`获取邮件失败: ${response.status}`);
  }

  const data = await response.json();

  if (!data || !data.emails) {
    return [];
  }

  return data.emails;
}

/**
 * 从文本中提取验证码
 */
function extractCode(text: string): string | null {
  if (!text) return null;

  const matches = text.matchAll(CODE_PATTERN);
  for (const match of matches) {
    const code = match[1];
    if (code && /^\d{6}$/.test(code)) {
      return code;
    }
  }
  return null;
}

/**
 * 等待并获取 AWS 验证码
 */
export async function waitForVerificationCode(
  token: string,
  timeout: number = 120000,
  onProgress?: (message: string) => void,
  options: WaitForVerificationCodeOptions = {}
): Promise<string | null> {
  const startTime = Date.now();
  const seenIds = new Set<string>();
  const otpSentAt = options.otpSentAt;
  const pollIntervalMs = Math.max(0, options.pollIntervalMs ?? 3000);

  onProgress?.('开始等待验证码...');

  while (Date.now() - startTime < timeout) {
    try {
      const emails = await getInbox(token, {
        fetchImpl: options.fetchImpl
      });

      if (emails.length === 0) {
        onProgress?.(`收件箱为空，继续等待...`);
        await new Promise(r => setTimeout(r, 3000));
        continue;
      }

      for (const msg of emails) {
        const msgId = msg.id || msg.date?.toString() || '';
        if (seenIds.has(msgId)) continue;

        const sender = (msg.from || '').toLowerCase();
        const content = [msg.subject, msg.body, msg.html].join('\n');
        const receivedAt = getMessageReceivedAt(msg);

        if (
          typeof otpSentAt === 'number' &&
          (!receivedAt || receivedAt <= otpSentAt - OTP_SENT_AT_TOLERANCE_MS)
        ) {
          continue;
        }

        seenIds.add(msgId);

        // 检查是否是 AWS 邮件
        const isAwsMail = AWS_SENDERS.some(s => sender.includes(s.toLowerCase()));

        if (isAwsMail) {
          onProgress?.(`收到 AWS 邮件，正在提取验证码...`);

          const code = extractCode(content);
          if (code) {
            onProgress?.(`找到验证码: ${code}`);
            return code;
          }
        }
      }

      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      onProgress?.(`已等待 ${elapsed}s，已检查 ${seenIds.size} 封邮件...`);

      await sleep(pollIntervalMs);

    } catch (error) {
      onProgress?.(`检查邮件时出错: ${error}`);
      await sleep(Math.max(pollIntervalMs, 500));
    }
  }

  onProgress?.('等待验证码超时');
  return null;
}
