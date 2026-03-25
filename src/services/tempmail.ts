/**
 * Tempmail.lol 邮箱服务
 * 基于 API v2
 */

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

/**
 * 创建临时邮箱
 */
export async function createInbox(): Promise<TempmailInbox> {
  const response = await fetch(`${BASE_URL}/inbox/create`, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({})
  });

  if (!response.ok) {
    throw new Error(`创建邮箱失败: ${response.status}`);
  }

  const data = await response.json();

  return {
    email: data.address,
    token: data.token,
    createdAt: Date.now()
  };
}

/**
 * 获取收件箱邮件列表
 */
export async function getInbox(token: string): Promise<EmailMessage[]> {
  const response = await fetch(`${BASE_URL}/inbox?token=${token}`, {
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
  onProgress?: (message: string) => void
): Promise<string | null> {
  const startTime = Date.now();
  const seenIds = new Set<string>();

  onProgress?.('开始等待验证码...');

  while (Date.now() - startTime < timeout) {
    try {
      const emails = await getInbox(token);

      if (emails.length === 0) {
        onProgress?.(`收件箱为空，继续等待...`);
        await new Promise(r => setTimeout(r, 3000));
        continue;
      }

      for (const msg of emails) {
        const msgId = msg.id || msg.date?.toString() || '';
        if (seenIds.has(msgId)) continue;
        seenIds.add(msgId);

        const sender = (msg.from || '').toLowerCase();
        const content = [msg.subject, msg.body, msg.html].join('\n');

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

      await new Promise(r => setTimeout(r, 3000));

    } catch (error) {
      onProgress?.(`检查邮件时出错: ${error}`);
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  onProgress?.('等待验证码超时');
  return null;
}
