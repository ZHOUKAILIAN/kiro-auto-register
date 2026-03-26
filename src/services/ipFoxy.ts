import type { FetchImpl } from './httpClient.ts';

export interface IpFoxyCredentials {
  apiId: string;
  apiToken: string;
}

export interface IpFoxyProxyRecord {
  id: string;
  host: string;
  port: number;
  type: 'http' | 'https' | 'socks5';
  user: string;
  password: string;
  countryCode?: string;
  publicIp?: string;
}

interface IpFoxyProxyListPayload {
  code?: number;
  msg?: string;
  data?: {
    list?: Array<Record<string, unknown>>;
  };
}

const IP_FOXY_API_URL = 'https://apis.ipfoxy.com/ip/open-api/proxy-list?page=1&page_size=50';
const IP_FOXY_PREFIX = 'ipfoxy://';

function readRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`IPFoxy 返回缺少 ${fieldName}`);
  }

  return value.trim();
}

export function parseIpFoxyProxySpec(proxyUrl: string): IpFoxyCredentials {
  if (!proxyUrl.startsWith(IP_FOXY_PREFIX)) {
    throw new Error('IPFoxy 代理格式无效，必须以 ipfoxy:// 开头');
  }

  const credentialPart = proxyUrl.slice(IP_FOXY_PREFIX.length).split('@', 1)[0]?.trim() ?? '';
  const separatorIndex = credentialPart.indexOf(':');

  if (separatorIndex <= 0 || separatorIndex >= credentialPart.length - 1) {
    throw new Error('IPFoxy 代理格式无效，需使用 ipfoxy://<userId>:<proxyKey>');
  }

  const apiId = credentialPart.slice(0, separatorIndex).trim();
  const apiToken = credentialPart.slice(separatorIndex + 1).trim();

  if (!apiId || !apiToken) {
    throw new Error('IPFoxy 代理格式无效，userId 或 proxyKey 为空');
  }

  return {
    apiId,
    apiToken
  };
}

function normalizeIpFoxyProxyRecord(record: Record<string, unknown>): IpFoxyProxyRecord {
  const rawType = readRequiredString(record.type, 'type').toLowerCase();
  if (rawType !== 'http' && rawType !== 'https' && rawType !== 'socks5') {
    throw new Error(`IPFoxy 返回了不支持的代理类型: ${rawType}`);
  }

  const portText = readRequiredString(record.port, 'port');
  const port = Number(portText);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`IPFoxy 返回了无效端口: ${portText}`);
  }

  return {
    id: readRequiredString(record.id, 'id'),
    host: readRequiredString(record.host, 'host'),
    port,
    type: rawType,
    user: readRequiredString(record.user, 'user'),
    password: readRequiredString(record.password, 'password'),
    countryCode: typeof record.country_code === 'string' ? record.country_code : undefined,
    publicIp: typeof record.public_ip === 'string' ? record.public_ip : undefined
  };
}

export async function listIpFoxyProxies(options: {
  apiId: string;
  apiToken: string;
  fetchImpl?: FetchImpl;
}): Promise<IpFoxyProxyRecord[]> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const response = await fetchImpl(IP_FOXY_API_URL, {
    headers: {
      'api-id': options.apiId,
      'api-token': options.apiToken,
      'accept': 'application/json'
    }
  });
  const text = await response.text();

  let payload: IpFoxyProxyListPayload | null = null;
  try {
    payload = text ? (JSON.parse(text) as IpFoxyProxyListPayload) : null;
  } catch {
    throw new Error(`IPFoxy 返回了无法解析的响应: ${text}`);
  }

  if (!response.ok) {
    throw new Error(`IPFoxy 同步失败: HTTP ${response.status}${payload?.msg ? ` ${payload.msg}` : ''}`);
  }

  if (payload?.code !== 0) {
    throw new Error(`IPFoxy 同步失败: ${payload?.msg || '未知错误'}`);
  }

  const list = payload.data?.list ?? [];
  return list.map((item) => normalizeIpFoxyProxyRecord(item));
}

export function buildIpFoxyProxyUrl(proxy: IpFoxyProxyRecord): string {
  const user = encodeURIComponent(proxy.user);
  const password = encodeURIComponent(proxy.password);
  return `${proxy.type}://${user}:${password}@${proxy.host}:${proxy.port}`;
}
