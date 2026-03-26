import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveManagedProxyTarget } from './httpClient.ts';

test('resolveManagedProxyTarget keeps plain http proxies unchanged', async () => {
  const resolved = await resolveManagedProxyTarget('http://127.0.0.1:7890');

  assert.equal(resolved?.sourceUrl, 'http://127.0.0.1:7890');
  assert.equal(resolved?.runtimeProxyUrl, 'http://127.0.0.1:7890');
  await resolved?.close();
});

test('resolveManagedProxyTarget routes socks5 proxies through a local bridge', async () => {
  const bridgeCalls: string[] = [];

  const resolved = await resolveManagedProxyTarget('socks5://proxy-user:proxy-pass@152.70.135.144:45019', {
    createSocksBridge: async (proxyUrl) => {
      bridgeCalls.push(proxyUrl);
      return {
        proxyUrl: 'http://127.0.0.1:19090',
        close: async () => undefined
      };
    }
  });

  assert.deepEqual(bridgeCalls, ['socks5://proxy-user:proxy-pass@152.70.135.144:45019']);
  assert.equal(resolved?.sourceUrl, 'socks5://proxy-user:proxy-pass@152.70.135.144:45019');
  assert.equal(resolved?.runtimeProxyUrl, 'http://127.0.0.1:19090');
  await resolved?.close();
});

test('resolveManagedProxyTarget resolves ipfoxy specs before building a bridge', async () => {
  const ipFoxyCalls: Array<{ apiId: string; apiToken: string }> = [];
  const bridgeCalls: string[] = [];

  const resolved = await resolveManagedProxyTarget('ipfoxy://i5v0e62:c6e82f0f680c38072ffd27b976c62144', {
    listIpFoxyProxies: async ({ apiId, apiToken }) => {
      ipFoxyCalls.push({ apiId, apiToken });
      return [
        {
          id: 'j184bbf',
          host: '152.70.135.144',
          port: 45019,
          type: 'socks5',
          user: 'proxy-user',
          password: 'proxy-pass',
          countryCode: 'US',
          publicIp: '2603:c020:f:d700:0:ee51:6036:704d'
        }
      ];
    },
    createSocksBridge: async (proxyUrl) => {
      bridgeCalls.push(proxyUrl);
      return {
        proxyUrl: 'http://127.0.0.1:19191',
        close: async () => undefined
      };
    }
  });

  assert.deepEqual(ipFoxyCalls, [
    {
      apiId: 'i5v0e62',
      apiToken: 'c6e82f0f680c38072ffd27b976c62144'
    }
  ]);
  assert.deepEqual(bridgeCalls, ['socks5://proxy-user:proxy-pass@152.70.135.144:45019']);
  assert.equal(resolved?.sourceUrl, 'ipfoxy://i5v0e62:c6e82f0f680c38072ffd27b976c62144');
  assert.equal(resolved?.runtimeProxyUrl, 'http://127.0.0.1:19191');
  await resolved?.close();
});
