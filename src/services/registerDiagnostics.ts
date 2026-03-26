import { createFetchContext, type FetchImpl } from './httpClient.ts';
import { formatErrorDetails } from './errorDetails.ts';
import { createInbox, type TempmailInbox } from './tempmail.ts';
import type { RegisterDiagnostics, RegistrationFailureSummary } from '../shared/contracts.ts';

interface RunRegisterDiagnosticsOptions {
  proxyUrl?: string;
  lastFailure?: RegistrationFailureSummary;
  fetchImpl?: FetchImpl;
  createInboxFn?: (options: { fetchImpl?: FetchImpl }) => Promise<TempmailInbox>;
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

  try {
    const egress = await fetchEgressInfo(fetchImpl);

    try {
      const inbox = await createInboxFn({
        fetchImpl
      });

      return {
        executedAt: Date.now(),
        proxyUrl: options.proxyUrl,
        egress,
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
