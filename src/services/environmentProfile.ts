export type EnvironmentProfileId = 'usa' | 'japan' | 'germany';

export interface EnvironmentProfile {
  id: EnvironmentProfileId;
  locale: string;
  timezone: string;
  acceptLanguage: string;
  userAgent: string;
  language: string;
  languages: string[];
  platform: string;
}

const MAC_CHROME_134_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36';
const WINDOWS_CHROME_134_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36';

const ENVIRONMENT_PROFILES: Record<EnvironmentProfileId, EnvironmentProfile> = {
  usa: {
    id: 'usa',
    locale: 'en-US',
    timezone: 'America/Los_Angeles',
    acceptLanguage: 'en-US,en;q=0.9',
    userAgent: MAC_CHROME_134_USER_AGENT,
    language: 'en-US',
    languages: ['en-US', 'en'],
    platform: 'MacIntel'
  },
  japan: {
    id: 'japan',
    locale: 'ja-JP',
    timezone: 'Asia/Tokyo',
    acceptLanguage: 'ja-JP,ja;q=0.9,en-US;q=0.7,en;q=0.6',
    userAgent: WINDOWS_CHROME_134_USER_AGENT,
    language: 'ja-JP',
    languages: ['ja-JP', 'ja', 'en-US', 'en'],
    platform: 'Win32'
  },
  germany: {
    id: 'germany',
    locale: 'de-DE',
    timezone: 'Europe/Berlin',
    acceptLanguage: 'de-DE,de;q=0.9,en-US;q=0.7,en;q=0.6',
    userAgent: WINDOWS_CHROME_134_USER_AGENT,
    language: 'de-DE',
    languages: ['de-DE', 'de', 'en-US', 'en'],
    platform: 'Win32'
  }
};

const COUNTRY_TO_PROFILE_ID: Record<string, EnvironmentProfileId> = {
  JP: 'japan',
  DE: 'germany',
  AT: 'germany',
  CH: 'germany',
  US: 'usa',
  CA: 'usa',
  GB: 'usa',
  AU: 'usa',
  NZ: 'usa',
  IE: 'usa'
};

function normalizeCountryCode(countryCode?: string): string | undefined {
  const normalized = countryCode?.trim().toUpperCase();
  return normalized || undefined;
}

/**
 * Resolve a stable environment profile from the proxy egress country code.
 */
export function resolveEnvironmentProfile(countryCode?: string): EnvironmentProfile {
  const normalizedCountryCode = normalizeCountryCode(countryCode);
  const profileId = normalizedCountryCode
    ? (COUNTRY_TO_PROFILE_ID[normalizedCountryCode] ?? 'usa')
    : 'usa';

  return ENVIRONMENT_PROFILES[profileId];
}

/**
 * Build a compact, user-facing summary for progress logs and diagnostics.
 */
export function summarizeEnvironmentProfile(
  profile: EnvironmentProfile,
  countryCode?: string
): string {
  const normalizedCountryCode = normalizeCountryCode(countryCode) ?? 'UNKNOWN';
  return `${profile.id.toUpperCase()} / ${profile.locale} / ${profile.timezone} (egress=${normalizedCountryCode})`;
}
