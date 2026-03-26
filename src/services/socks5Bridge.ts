import net, { type Server, type Socket } from 'node:net';

export interface Socks5HttpBridge {
  proxyUrl: string;
  close(): Promise<void>;
}

interface Socks5ProxyConfig {
  host: string;
  port: number;
  username: string;
  password: string;
}

function parseSocks5ProxyUrl(proxyUrl: string): Socks5ProxyConfig {
  const url = new URL(proxyUrl);
  if (url.protocol !== 'socks5:') {
    throw new Error(`不支持的 SOCKS 协议: ${url.protocol}`);
  }

  const port = Number(url.port || '1080');
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`SOCKS5 代理端口无效: ${url.port}`);
  }

  return {
    host: url.hostname,
    port,
    username: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password)
  };
}

function onceData(socket: Socket): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const onData = (chunk: Buffer): void => {
      cleanup();
      resolve(chunk);
    };
    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };
    const onClose = (): void => {
      cleanup();
      reject(new Error('socket closed'));
    };
    const cleanup = (): void => {
      socket.off('data', onData);
      socket.off('error', onError);
      socket.off('close', onClose);
      socket.off('end', onClose);
    };

    socket.on('data', onData);
    socket.on('error', onError);
    socket.on('close', onClose);
    socket.on('end', onClose);
  });
}

async function connectViaSocks5(
  proxy: Socks5ProxyConfig,
  targetHost: string,
  targetPort: number
): Promise<Socket> {
  const upstream = net.connect(proxy.port, proxy.host);
  upstream.setNoDelay(true);

  await new Promise<void>((resolve, reject) => {
    upstream.once('connect', () => resolve());
    upstream.once('error', reject);
  });

  upstream.write(Buffer.from([0x05, 0x01, 0x02]));
  const methodReply = await onceData(upstream);
  if (methodReply.length < 2 || methodReply[1] !== 0x02) {
    throw new Error(`SOCKS5 握手失败: ${methodReply.toString('hex')}`);
  }

  const username = Buffer.from(proxy.username);
  const password = Buffer.from(proxy.password);
  upstream.write(
    Buffer.concat([
      Buffer.from([0x01, username.length]),
      username,
      Buffer.from([password.length]),
      password
    ])
  );
  const authReply = await onceData(upstream);
  if (authReply.length < 2 || authReply[1] !== 0x00) {
    throw new Error(`SOCKS5 认证失败: ${authReply.toString('hex')}`);
  }

  const host = Buffer.from(targetHost);
  const port = Buffer.alloc(2);
  port.writeUInt16BE(targetPort, 0);
  upstream.write(
    Buffer.concat([
      Buffer.from([0x05, 0x01, 0x00, 0x03, host.length]),
      host,
      port
    ])
  );
  const connectReply = await onceData(upstream);
  if (connectReply.length < 2 || connectReply[1] !== 0x00) {
    throw new Error(`SOCKS5 CONNECT 失败: ${connectReply.toString('hex')}`);
  }

  return upstream;
}

function parseConnectAuthority(authority: string): { hostname: string; port: number } {
  const parsed = new URL(`http://${authority}`);
  const port = Number(parsed.port || '443');
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`CONNECT 端口无效: ${authority}`);
  }

  return {
    hostname: parsed.hostname,
    port
  };
}

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => {
      server.off('error', onError);
      reject(error);
    };
    server.on('error', onError);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', onError);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('本地 SOCKS5 bridge 未拿到有效监听端口');
  }

  return address.port;
}

export async function createSocks5HttpBridge(proxyUrl: string): Promise<Socks5HttpBridge> {
  const proxy = parseSocks5ProxyUrl(proxyUrl);
  const activeSockets = new Set<Socket>();

  const server = net.createServer((client) => {
    activeSockets.add(client);
    client.setNoDelay(true);
    let buffered = Buffer.alloc(0);

    const cleanup = (): void => {
      activeSockets.delete(client);
    };

    const onClientData = async (chunk: Buffer): Promise<void> => {
      buffered = Buffer.concat([buffered, chunk]);
      const headerEnd = buffered.indexOf('\r\n\r\n');
      if (headerEnd === -1) {
        return;
      }

      client.off('data', onClientData);
      const headerText = buffered.slice(0, headerEnd).toString('utf8');
      const [requestLine = ''] = headerText.split('\r\n');
      const [method, authority] = requestLine.split(' ');

      if (method !== 'CONNECT' || !authority) {
        client.write('HTTP/1.1 405 Method Not Allowed\r\nConnection: close\r\n\r\n');
        client.destroy();
        return;
      }

      try {
        const target = parseConnectAuthority(authority);
        const upstream = await connectViaSocks5(proxy, target.hostname, target.port);
        activeSockets.add(upstream);
        client.write('HTTP/1.1 200 Connection established\r\n\r\n');

        const extra = buffered.slice(headerEnd + 4);
        if (extra.length > 0) {
          upstream.write(extra);
        }

        client.pipe(upstream);
        upstream.pipe(client);

        const destroyBoth = (): void => {
          activeSockets.delete(client);
          activeSockets.delete(upstream);
          client.destroy();
          upstream.destroy();
        };

        client.on('error', destroyBoth);
        upstream.on('error', destroyBoth);
        client.on('close', () => {
          activeSockets.delete(client);
          upstream.destroy();
        });
        upstream.on('close', () => {
          activeSockets.delete(upstream);
          client.destroy();
        });
      } catch {
        client.write('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n');
        client.destroy();
      }
    };

    client.on('data', (chunk) => {
      void onClientData(chunk);
    });
    client.on('error', cleanup);
    client.on('close', cleanup);
  });

  const port = await listen(server);

  return {
    proxyUrl: `http://127.0.0.1:${port}`,
    close: async () => {
      for (const socket of activeSockets) {
        socket.destroy();
      }

      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
  };
}
