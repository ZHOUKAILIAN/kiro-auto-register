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
