import { createFetchContext, type FetchImpl } from './httpClient.ts';
import { formatErrorDetails } from './errorDetails.ts';
import { fetchEgressInfo } from './egressInfo.ts';
import { probeRegistrationPath } from './kiroApiRegister.ts';
import { probeMoeMailProvider } from './moemail.ts';
import {
  probeOutlookMailbox,
  type OutlookMailboxProbeResult
} from './outlookMailbox.ts';
import { createInbox, type TempmailInbox } from './tempmail.ts';
import type {
  RegistrationComparison,
  MailboxProvider,
  ManagedEmailProvider,
  RegisterDiagnostics,
  RegistrationEmailMode,
  RegistrationFailureSummary,
  RegistrationProbeSummary
} from '../shared/contracts.ts';

interface RunRegisterDiagnosticsOptions {
  proxyUrl?: string;
  lastFailure?: RegistrationFailureSummary;
  fetchImpl?: FetchImpl;
  createInboxFn?: (options: { fetchImpl?: FetchImpl }) => Promise<TempmailInbox>;
  registrationEmailMode?: RegistrationEmailMode;
  customEmailAddress?: string;
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
  probeRegistrationFn?: (options: {
    fetchImpl: FetchImpl;
    email: string;
    country?: string;
    onProgress?: (message: string) => void;
  }) => Promise<RegistrationProbeSummary>;
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
  const probeRegistrationFn = options.probeRegistrationFn ?? probeRegistrationPath;
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
    let tempmail: RegisterDiagnostics['tempmail'];
    let tempmailInboxEmail: string | undefined;
    let registrationProbe: RegistrationProbeSummary | undefined;
    const registrationComparisons: RegistrationComparison[] = [];

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

      tempmailInboxEmail = inbox.email;
      tempmail = {
        success: true,
        message: 'Tempmail 邮箱创建成功',
        email: inbox.email
      };
    } catch (error) {
      tempmail = {
        success: false,
        message: `Tempmail 邮箱创建失败: ${formatErrorDetails(error)}`
      };
    }

    const customEmailAddress = options.customEmailAddress?.trim();
    const candidates: Array<{
      label: string;
      email: string;
      source: RegistrationEmailMode;
    }> = [];

    if (tempmailInboxEmail) {
      candidates.push({
        label: 'Tempmail',
        email: tempmailInboxEmail,
        source: 'tempmail'
      });
    }

    if (
      customEmailAddress &&
      !candidates.some((candidate) => candidate.email === customEmailAddress)
    ) {
      candidates.push({
        label: '自定义邮箱',
        email: customEmailAddress,
        source: 'custom'
      });
    }

    for (const candidate of candidates) {
      try {
        const result = await probeRegistrationFn({
          fetchImpl,
          email: candidate.email,
          country: egress?.country
        });
        registrationComparisons.push({
          label: candidate.label,
          email: candidate.email,
          source: candidate.source,
          result
        });
      } catch (error) {
        registrationComparisons.push({
          label: candidate.label,
          email: candidate.email,
          source: candidate.source,
          result: {
            success: false,
            stage: 'probe',
            message: `注册探测失败: ${formatErrorDetails(error)}`,
            email: candidate.email,
            classification: 'failed'
          }
        });
      }
    }

    const preferredSource = options.registrationEmailMode === 'custom' ? 'custom' : 'tempmail';
    registrationProbe =
      registrationComparisons.find(
        (comparison) => comparison.source === preferredSource && comparison.result
      )?.result ??
      registrationComparisons.find((comparison) => comparison.result)?.result;

    return {
      executedAt: Date.now(),
      proxyUrl: options.proxyUrl,
      egress,
      managedEmail:
        managedEmail ??
        (options.managedEmailConfig?.provider === 'tempmail.lol'
          ? {
              provider: 'tempmail.lol',
              success: tempmail.success,
              message: tempmail.success
                ? 'Tempmail provider 可用'
                : `Tempmail provider 不可用: ${tempmail.message}`,
              email: tempmailInboxEmail
            }
          : undefined),
      mailbox,
      tempmail,
      registrationProbe,
      registrationComparisons: registrationComparisons.length > 0 ? registrationComparisons : undefined,
      aws: options.lastFailure
        ? {
            stage: options.lastFailure.stage,
            message: options.lastFailure.message
          }
        : undefined
    };
  } finally {
    await fetchContext?.close();
  }
}
