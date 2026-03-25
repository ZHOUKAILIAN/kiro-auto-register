import { ProxyAgent, fetch as undiciFetch } from 'undici';

export type FetchImpl = typeof fetch;

interface StoredCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  expiresAt?: number;
}

function normalizePath(pathname: string | undefined): string {
  if (!pathname || !pathname.startsWith('/')) {
    return '/';
  }

  return pathname;
}

function splitSetCookieHeader(rawHeader: string): string[] {
  const parts: string[] = [];
  let segmentStart = 0;
  let insideExpires = false;

  for (let index = 0; index < rawHeader.length; index += 1) {
    const remainder = rawHeader.slice(index).toLowerCase();

    if (remainder.startsWith('expires=')) {
      insideExpires = true;
      index += 'expires='.length - 1;
      continue;
    }

    const char = rawHeader[index];
    if (insideExpires && char === ';') {
      insideExpires = false;
      continue;
    }

    if (!insideExpires && char === ',') {
      parts.push(rawHeader.slice(segmentStart, index).trim());
      segmentStart = index + 1;
    }
  }

  const lastPart = rawHeader.slice(segmentStart).trim();
  if (lastPart) {
    parts.push(lastPart);
  }

  return parts;
}

function getSetCookieHeaders(response: Response): string[] {
  const nativeGetSetCookie = (response.headers as Headers & {
    getSetCookie?: () => string[];
  }).getSetCookie;

  if (typeof nativeGetSetCookie === 'function') {
    const values = nativeGetSetCookie
      .call(response.headers)
      .filter(Boolean)
      .flatMap((value) => splitSetCookieHeader(value));
    if (values.length > 0) {
      return values;
    }
  }

  const combined = response.headers.get('set-cookie');
  if (!combined) {
    return [];
  }

  return splitSetCookieHeader(combined);
}

function parseCookie(
  header: string,
  sourceUrl: URL
): StoredCookie | null {
  const segments = header
    .split(';')
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length === 0) {
    return null;
  }

  const [nameValue, ...attributes] = segments;
  const separatorIndex = nameValue.indexOf('=');
  if (separatorIndex <= 0) {
    return null;
  }

  const cookie: StoredCookie = {
    name: nameValue.slice(0, separatorIndex),
    value: nameValue.slice(separatorIndex + 1),
    domain: sourceUrl.hostname,
    path: '/',
    secure: false
  };

  for (const attribute of attributes) {
    const [rawName, rawValue = ''] = attribute.split('=');
    const name = rawName.toLowerCase();

    if (name === 'domain' && rawValue) {
      cookie.domain = rawValue.replace(/^\./, '');
    }

    if (name === 'path') {
      cookie.path = normalizePath(rawValue);
    }

    if (name === 'secure') {
      cookie.secure = true;
    }

    if (name === 'max-age') {
      const seconds = Number(rawValue);
      if (Number.isFinite(seconds)) {
        cookie.expiresAt = Date.now() + seconds * 1000;
      }
    }

    if (name === 'expires') {
      const timestamp = Date.parse(rawValue);
      if (!Number.isNaN(timestamp)) {
        cookie.expiresAt = timestamp;
      }
    }
  }

  return cookie;
}

function matchesDomain(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function isExpired(cookie: StoredCookie): boolean {
  return typeof cookie.expiresAt === 'number' && cookie.expiresAt <= Date.now();
}

export class CookieJar {
  private readonly cookies: StoredCookie[] = [];

  capture(response: Response, url: URL): void {
    for (const header of getSetCookieHeaders(response)) {
      const parsed = parseCookie(header, url);
      if (!parsed) {
        continue;
      }

      this.setCookie(parsed);
    }
  }

  setCookie(cookie: StoredCookie): void {
    const existingIndex = this.cookies.findIndex((stored) => {
      return (
        stored.name === cookie.name &&
        stored.domain === cookie.domain &&
        stored.path === cookie.path
      );
    });

    if (existingIndex >= 0) {
      this.cookies.splice(existingIndex, 1);
    }

    if (isExpired(cookie)) {
      return;
    }

    this.cookies.push(cookie);
  }

  get(name: string, domain?: string): string | undefined {
    return this.cookies.find((cookie) => {
      return cookie.name === name && (!domain || cookie.domain === domain);
    })?.value;
  }

  getCookieHeader(url: URL): string | undefined {
    const values = this.cookies
      .filter((cookie) => {
        return (
          !isExpired(cookie) &&
          matchesDomain(url.hostname, cookie.domain) &&
          url.pathname.startsWith(cookie.path) &&
          (!cookie.secure || url.protocol === 'https:')
        );
      })
      .map((cookie) => `${cookie.name}=${cookie.value}`);

    return values.length > 0 ? values.join('; ') : undefined;
  }
}

type ProxyEnvironment = Record<string, string | undefined>;

function firstNonEmptyValue(values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

export function resolveProxyUrl(
  explicitProxyUrl?: string,
  environment: ProxyEnvironment = process.env
): string | undefined {
  return firstNonEmptyValue([
    explicitProxyUrl,
    environment.HTTPS_PROXY,
    environment.https_proxy,
    environment.HTTP_PROXY,
    environment.http_proxy,
    environment.ALL_PROXY,
    environment.all_proxy
  ]);
}

export interface FetchContext {
  fetchImpl: FetchImpl;
  close(): Promise<void>;
}

export function createFetchContext(proxyUrl?: string): FetchContext {
  const resolvedProxyUrl = resolveProxyUrl(proxyUrl);

  if (!resolvedProxyUrl) {
    return {
      fetchImpl: globalThis.fetch.bind(globalThis),
      close: async () => undefined
    };
  }

  const dispatcher = new ProxyAgent(resolvedProxyUrl);
  const fetchImpl: FetchImpl = ((input, init) => {
    const undiciInit = {
      ...(init as unknown as Omit<NonNullable<Parameters<typeof undiciFetch>[1]>, 'dispatcher'>),
      dispatcher
    } satisfies NonNullable<Parameters<typeof undiciFetch>[1]>;

    return undiciFetch(
      input as Parameters<typeof undiciFetch>[0],
      undiciInit
    ) as Promise<Response>;
  }) as FetchImpl;

  return {
    fetchImpl,
    close: async () => {
      await dispatcher.close();
    }
  };
}
