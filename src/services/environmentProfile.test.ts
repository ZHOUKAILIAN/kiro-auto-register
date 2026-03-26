import test from 'node:test';
import assert from 'node:assert/strict';

interface TestEnvironmentProfile {
  id: string;
  locale: string;
  timezone: string;
  acceptLanguage: string;
  userAgent: string;
  language: string;
  languages: string[];
  platform: string;
}

interface EnvironmentProfileModule {
  resolveEnvironmentProfile: (countryCode?: string) => TestEnvironmentProfile;
  summarizeEnvironmentProfile: (
    profile: TestEnvironmentProfile,
    countryCode?: string
  ) => string;
}

async function loadEnvironmentProfileModule(): Promise<EnvironmentProfileModule | null> {
  try {
    return (await import('./environmentProfile.ts')) as EnvironmentProfileModule;
  } catch {
    return null;
  }
}

test('resolveEnvironmentProfile maps JP to japan profile and exposes readable summary', async () => {
  const profileModule = await loadEnvironmentProfileModule();

  assert.ok(profileModule, 'environmentProfile.ts should exist and export profile helpers');
  if (!profileModule) {
    return;
  }

  const profile = profileModule.resolveEnvironmentProfile('JP');

  assert.equal(profile.id, 'japan');
  assert.equal(profile.locale, 'ja-JP');
  assert.equal(profile.timezone, 'Asia/Tokyo');
  assert.equal(profile.language, 'ja-JP');
  assert.deepEqual(profile.languages, ['ja-JP', 'ja', 'en-US', 'en']);
  assert.match(
    profileModule.summarizeEnvironmentProfile(profile, 'JP'),
    /^JAPAN \/ ja-JP \/ Asia\/Tokyo \(egress=JP\)$/
  );
});

test('resolveEnvironmentProfile maps DE to germany and falls back to usa for unknown country', async () => {
  const profileModule = await loadEnvironmentProfileModule();

  assert.ok(profileModule, 'environmentProfile.ts should exist and export profile helpers');
  if (!profileModule) {
    return;
  }

  const germanyProfile = profileModule.resolveEnvironmentProfile('DE');
  const fallbackProfile = profileModule.resolveEnvironmentProfile('BR');

  assert.equal(germanyProfile.id, 'germany');
  assert.equal(germanyProfile.locale, 'de-DE');
  assert.equal(germanyProfile.timezone, 'Europe/Berlin');
  assert.equal(fallbackProfile.id, 'usa');
  assert.equal(fallbackProfile.locale, 'en-US');
});
