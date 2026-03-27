import type {
  RegisterDiagnostics,
  RegistrationProbeSummary
} from './contracts.ts';

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

export function getRegistrationProbeAvailabilityLabel(
  diagnostics?: RegisterDiagnostics
): '待检测' | '可用' | 'TES 拦截' | '网络失败' | '失败' {
  if (!diagnostics?.registrationProbe) {
    return '待检测';
  }

  switch (diagnostics.registrationProbe.classification) {
    case 'reachable':
      return '可用';
    case 'tes-blocked':
      return 'TES 拦截';
    case 'network-error':
      return '网络失败';
    default:
      return '失败';
  }
}

export function getRegistrationProbeMessage(
  diagnostics?: RegisterDiagnostics
): string {
  if (!diagnostics) {
    return '点击“运行诊断”检查代理是否能真正推进到注册阶段';
  }

  if (!diagnostics.registrationProbe) {
    return '当前诊断未进入注册探测，通常是因为邮箱或前置链路尚未准备好';
  }

  return diagnostics.registrationProbe.message;
}

export function getRegistrationEvidenceSummary(
  probe?: RegistrationProbeSummary
): string {
  if (!probe?.evidence) {
    return '暂无更多结构化证据';
  }

  const parts = [
    typeof probe.evidence.httpStatus === 'number'
      ? `HTTP ${probe.evidence.httpStatus}`
      : undefined,
    probe.evidence.requestUrl,
    probe.evidence.cookieNames?.length
      ? `cookies: ${probe.evidence.cookieNames.join(', ')}`
      : undefined
  ].filter((value): value is string => Boolean(value));

  return parts.join(' · ') || '暂无更多结构化证据';
}

export function getRegistrationComparisonSummary(
  diagnostics?: RegisterDiagnostics
): string[] {
  return (
    diagnostics?.registrationComparisons?.map((comparison) => {
      if (!comparison.result) {
        return `${comparison.label}: ${comparison.skippedReason || '未执行'}`;
      }

      const status = getRegistrationProbeAvailabilityLabel({
        executedAt: diagnostics.executedAt,
        tempmail: diagnostics.tempmail,
        registrationProbe: comparison.result
      });
      return `${comparison.label}: ${status} (${comparison.result.stage})`;
    }) ?? []
  );
}
