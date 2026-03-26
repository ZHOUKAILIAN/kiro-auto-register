import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildIpFoxyProxyUrl,
  listIpFoxyProxies,
  parseIpFoxyProxySpec
} from './ipFoxy.ts';

test('parseIpFoxyProxySpec reads api id and token from ipfoxy proxy specs', () => {
  assert.deepEqual(parseIpFoxyProxySpec('ipfoxy://i5v0e62:c6e82f0f680c38072ffd27b976c62144'), {
    apiId: 'i5v0e62',
    apiToken: 'c6e82f0f680c38072ffd27b976c62144'
  });
});

test('listIpFoxyProxies normalizes upstream proxy records', async () => {
  const proxies = await listIpFoxyProxies({
    apiId: 'i5v0e62',
    apiToken: 'token-1',
    fetchImpl: async (input, init) => {
      assert.equal(String(input), 'https://apis.ipfoxy.com/ip/open-api/proxy-list?page=1&page_size=50');
      assert.equal(new Headers(init?.headers).get('api-id'), 'i5v0e62');
      assert.equal(new Headers(init?.headers).get('api-token'), 'token-1');

      return Response.json({
        code: 0,
        msg: 'Success',
        data: {
          list: [
            {
              id: 'j184bbf',
              host: '152.70.135.144',
              port: '45019',
              type: 'socks5',
              user: 'proxy-user',
              password: 'proxy-pass',
              country_code: 'US',
              public_ip: '2603:c020:f:d700:0:ee51:6036:704d'
            }
          ]
        }
      });
    }
  });

  assert.deepEqual(proxies, [
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
  ]);
});

test('buildIpFoxyProxyUrl converts normalized proxy records to runtime proxy urls', () => {
  const proxyUrl = buildIpFoxyProxyUrl({
    id: 'j184bbf',
    host: '152.70.135.144',
    port: 45019,
    type: 'socks5',
    user: 'proxy-user',
    password: 'proxy-pass',
    countryCode: 'US',
    publicIp: '2603:c020:f:d700:0:ee51:6036:704d'
  });

  assert.equal(proxyUrl, 'socks5://proxy-user:proxy-pass@152.70.135.144:45019');
});
