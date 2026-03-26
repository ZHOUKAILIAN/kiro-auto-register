import type {
  BatchRegisterResult,
  MailboxProvider,
  ManagedEmailProvider,
  OtpMode,
  RegistrationEmailMode
} from './contracts.ts';

function describeManagedEmailProvider(provider?: ManagedEmailProvider): string {
  return provider === 'moemail-api' ? 'MoeMail API' : 'Tempmail.lol';
}

function describeEmailMode(
  mode: RegistrationEmailMode,
  managedEmailProvider?: ManagedEmailProvider
): string {
  if (mode === 'custom') {
    return '我自己的邮箱';
  }

  return managedEmailProvider === 'moemail-api'
    ? '自动邮箱提供方（MoeMail API）'
    : 'Tempmail 自动创建';
}

function describeOtpMode(
  mode: OtpMode,
  mailboxProvider?: MailboxProvider,
  managedEmailProvider?: ManagedEmailProvider
): string {
  if (mode === 'manual') {
    return '界面手动输入';
  }

  if (mode === 'mailbox') {
    return mailboxProvider === 'outlook-graph'
      ? '邮箱自动收码（Outlook Graph）'
      : '邮箱自动收码';
  }

  return managedEmailProvider === 'moemail-api'
    ? `自动轮询（${describeManagedEmailProvider(managedEmailProvider)}）`
    : 'Tempmail 自动轮询';
}

export function maskProxyUrlForDisplay(proxyUrl: string): string {
  const normalized = proxyUrl.trim();
  if (!normalized) {
    return '';
  }

  if (normalized.startsWith('ipfoxy://')) {
    const credentialPart = normalized.slice('ipfoxy://'.length).split('@', 1)[0] ?? '';
    const separatorIndex = credentialPart.indexOf(':');
    if (separatorIndex > 0) {
      const userId = credentialPart.slice(0, separatorIndex);
      const token = credentialPart.slice(separatorIndex + 1);
      const maskedToken = token.length > 4 ? `****${token.slice(-4)}` : '****';
      return `ipfoxy://${userId}:${maskedToken}`;
    }
  }

  try {
    const parsed = new URL(normalized);
    if (parsed.password) {
      parsed.password = '****';
    }
    const displayUrl = parsed.toString();
    if (parsed.pathname === '/' && !parsed.search && !parsed.hash) {
      return displayUrl.slice(0, -1);
    }
    return displayUrl;
  } catch {
    return normalized;
  }
}

export function buildRegisterStartupMessages(input: {
  count: number;
  managedEmailProvider?: ManagedEmailProvider;
  mailboxProvider?: MailboxProvider;
  proxyUrl: string;
  registrationEmailMode: RegistrationEmailMode;
  otpMode: OtpMode;
}): string[] {
  const proxyUrl = maskProxyUrlForDisplay(input.proxyUrl);
  const effectiveOtpMode =
    input.registrationEmailMode === 'custom' && input.otpMode === 'tempmail'
      ? 'manual'
      : input.otpMode;

  return [
    `已提交注册任务，准备启动 ${input.count} 个注册流程`,
    proxyUrl ? `网络出口：代理 ${proxyUrl}` : '网络出口：未设置代理，将使用当前系统网络',
    `邮箱来源：${describeEmailMode(input.registrationEmailMode, input.managedEmailProvider)}`,
    `OTP 获取：${describeOtpMode(
      effectiveOtpMode,
      input.mailboxProvider,
      input.managedEmailProvider
    )}`
  ];
}

export function buildRegisterOutcomeMessage(result: BatchRegisterResult): string {
  if (result.failureCount === 0) {
    return `注册任务完成：成功 ${result.successCount} / ${result.total}`;
  }

  const firstFailure = result.results.find((item) => !item.success)?.message;

  return firstFailure
    ? `注册任务失败：成功 ${result.successCount} / ${result.total}；${firstFailure}`
    : `注册任务失败：成功 ${result.successCount} / ${result.total}`;
}
