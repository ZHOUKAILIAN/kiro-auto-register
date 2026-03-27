import type { RegisterDiagnostics } from '../shared/contracts.ts';
import type { FetchImpl } from './httpClient.ts';

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
