import test from 'node:test';
import assert from 'node:assert/strict';

import { CookieJar, resolveProxyUrl } from './httpClient.ts';

test('CookieJar captures cookies and returns matching header for target URL', () => {
  const jar = new CookieJar();

  const response = new Response(null, {
    headers: {
      'set-cookie': [
        'session=abc123; Path=/platform; Secure; HttpOnly',
        'pref=dark; Domain=.example.com; Path=/'
      ].join(', ')
    }
  });

  jar.capture(response, new URL('https://us-east-1.signin.aws/platform/login'));
  jar.capture(
    new Response(null, {
      headers: {
        'set-cookie': 'pref=dark; Domain=.example.com; Path=/'
      }
    }),
    new URL('https://example.com/')
  );

  assert.equal(
    jar.getCookieHeader(new URL('https://us-east-1.signin.aws/platform/d-123')),
    'session=abc123'
  );
  assert.equal(jar.getCookieHeader(new URL('https://sub.example.com/path')), 'pref=dark');
  assert.equal(jar.getCookieHeader(new URL('https://other.example.net/')), undefined);
});

test('resolveProxyUrl prefers explicit value and falls back to environment variables', () => {
  assert.equal(
    resolveProxyUrl('http://127.0.0.1:7890', {
      HTTPS_PROXY: 'http://env-https:9000',
      HTTP_PROXY: 'http://env-http:8000'
    }),
    'http://127.0.0.1:7890'
  );

  assert.equal(
    resolveProxyUrl(undefined, {
      HTTPS_PROXY: 'http://env-https:9000',
      HTTP_PROXY: 'http://env-http:8000'
    }),
    'http://env-https:9000'
  );

  assert.equal(
    resolveProxyUrl(undefined, {
      HTTPS_PROXY: '   ',
      HTTP_PROXY: 'http://env-http:8000'
    }),
    'http://env-http:8000'
  );

  assert.equal(resolveProxyUrl(undefined, {}), undefined);
});
