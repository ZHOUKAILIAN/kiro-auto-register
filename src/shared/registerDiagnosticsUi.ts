import type { RegisterDiagnostics } from './contracts.ts';

export function normalizeOptionalProxyUrl(value?: string): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

export function getTempmailAvailabilityLabel(
  diagnostics?: RegisterDiagnostics
): '待检测' | '可用' | '不可用' {
  if (!diagnostics) {
    return '待检测';
  }

  return diagnostics.tempmail.success ? '可用' : '不可用';
}
