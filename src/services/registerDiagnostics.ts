import { createFetchContext, type FetchImpl } from './httpClient.ts';
import { formatErrorDetails } from './errorDetails.ts';
import { probeMoeMailProvider } from './moemail.ts';
import {
  probeOutlookMailbox,
  type OutlookMailboxProbeResult
} from './outlookMailbox.ts';
import { createInbox, type TempmailInbox } from './tempmail.ts';
import type {
  MailboxProvider,
  ManagedEmailProvider,
  RegisterDiagnostics,
  RegistrationFailureSummary
} from '../shared/contracts.ts';

interface RunRegisterDiagnosticsOptions {
  proxyUrl?: string;
  lastFailure?: RegistrationFailureSummary;
  fetchImpl?: FetchImpl;
  createInboxFn?: (options: { fetchImpl?: FetchImpl }) => Promise<TempmailInbox>;
  managedEmailConfig?:
    | {
        provider: Extract<ManagedEmailProvider, 'tempmail.lol'>;
      }
    | {
        provider: Extract<ManagedEmailProvider, 'moemail-api'>;
        baseUrl: string;
        apiKey: string;
        preferredDomain?: string;
      };
  probeManagedEmailFn?: (options: {
    provider: Extract<ManagedEmailProvider, 'moemail-api'>;
    baseUrl: string;
    apiKey: string;
    preferredDomain?: string;
    fetchImpl?: FetchImpl;
  }) => Promise<{
    provider: ManagedEmailProvider;
    success: boolean;
    message: string;
    email?: string;
  }>;
  mailboxConfig?: {
    provider: MailboxProvider;
    email: string;
    clientId: string;
    refreshToken: string;
    onRefreshToken?: (value: string) => void;
  };
  probeOutlookMailboxFn?: (options: {
    email: string;
    clientId: string;
    refreshToken: string;
  }) => Promise<OutlookMailboxProbeResult>;
}

/**
 * Read best-effort proxy egress metadata without failing the caller.
 */
export async function fetchEgressInfo(
  fetchImpl: FetchImpl
): Promise<RegisterDiagnostics['egress'] | undefined> {
  try {
    const response = await fetchImpl('https://ipinfo.io/json');
    if (!response.ok) {
      return undefined;
    }

    const payload = (await response.json()) as Record<string, unknown>;
    return {
      ip: typeof payload.ip === 'string' ? payload.ip : undefined,
      city: typeof payload.city === 'string' ? payload.city : undefined,
      region: typeof payload.region === 'string' ? payload.region : undefined,
      country: typeof payload.country === 'string' ? payload.country : undefined,
      org: typeof payload.org === 'string' ? payload.org : undefined
    };
  } catch {
    return undefined;
  }
}

export async function runRegisterDiagnostics(
  options: RunRegisterDiagnosticsOptions = {}
): Promise<RegisterDiagnostics> {
  const fetchContext = options.fetchImpl
    ? null
    : await createFetchContext(options.proxyUrl);
  const fetchImpl = options.fetchImpl ?? fetchContext?.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const createInboxFn = options.createInboxFn ?? createInbox;
  const probeOutlookMailboxFn = options.probeOutlookMailboxFn ?? probeOutlookMailbox;
  const probeManagedEmailFn =
    options.probeManagedEmailFn ??
    (async (managedOptions: {
      provider: Extract<ManagedEmailProvider, 'moemail-api'>;
      baseUrl: string;
      apiKey: string;
      preferredDomain?: string;
      fetchImpl?: FetchImpl;
    }) =>
      probeMoeMailProvider({
        baseUrl: managedOptions.baseUrl,
        apiKey: managedOptions.apiKey,
        preferredDomain: managedOptions.preferredDomain,
        fetchImpl: managedOptions.fetchImpl
      }));

  try {
    const egress = await fetchEgressInfo(fetchImpl);
    let managedEmail: RegisterDiagnostics['managedEmail'];
    let mailbox: RegisterDiagnostics['mailbox'];

    if (options.managedEmailConfig?.provider === 'moemail-api') {
      const probeResult = await probeManagedEmailFn({
        provider: 'moemail-api',
        baseUrl: options.managedEmailConfig.baseUrl,
        apiKey: options.managedEmailConfig.apiKey,
        preferredDomain: options.managedEmailConfig.preferredDomain,
        fetchImpl
      });

      managedEmail = {
        provider: 'moemail-api',
        success: probeResult.success,
        message: probeResult.message,
        email: probeResult.email
      };
    }

    if (options.mailboxConfig?.provider === 'outlook-graph') {
      const probeResult = await probeOutlookMailboxFn({
        email: options.mailboxConfig.email,
        clientId: options.mailboxConfig.clientId,
        refreshToken: options.mailboxConfig.refreshToken
      });

      if (
        probeResult.nextRefreshToken &&
        probeResult.nextRefreshToken !== options.mailboxConfig.refreshToken
      ) {
        options.mailboxConfig.onRefreshToken?.(probeResult.nextRefreshToken);
      }

      mailbox = {
        provider: 'outlook-graph',
        success: probeResult.success,
        message: probeResult.message,
        email: options.mailboxConfig.email
      };
    }

    try {
      const inbox = await createInboxFn({
        fetchImpl
      });

      return {
        executedAt: Date.now(),
        proxyUrl: options.proxyUrl,
        egress,
        managedEmail:
          managedEmail ??
          (options.managedEmailConfig?.provider === 'tempmail.lol'
            ? {
                provider: 'tempmail.lol',
                success: true,
                message: 'Tempmail provider 可用',
                email: inbox.email
              }
            : undefined),
        mailbox,
        tempmail: {
          success: true,
          message: 'Tempmail 邮箱创建成功',
          email: inbox.email
        },
        aws: options.lastFailure
          ? {
              stage: options.lastFailure.stage,
              message: options.lastFailure.message
            }
          : undefined
      };
    } catch (error) {
      return {
        executedAt: Date.now(),
        proxyUrl: options.proxyUrl,
        egress,
        managedEmail:
          managedEmail ??
          (options.managedEmailConfig?.provider === 'tempmail.lol'
            ? {
                provider: 'tempmail.lol',
                success: false,
                message: `Tempmail provider 不可用: ${formatErrorDetails(error)}`
              }
            : undefined),
        mailbox,
        tempmail: {
          success: false,
          message: `Tempmail 邮箱创建失败: ${formatErrorDetails(error)}`
        },
        aws: options.lastFailure
          ? {
              stage: options.lastFailure.stage,
              message: options.lastFailure.message
            }
          : undefined
      };
    }
  } finally {
    await fetchContext?.close();
  }
}
