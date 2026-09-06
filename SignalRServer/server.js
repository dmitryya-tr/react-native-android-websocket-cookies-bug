const {randomUUID} = require('node:crypto');
const http = require('node:http');
const {URL} = require('node:url');
const {WebSocketServer} = require('ws');

const HOST = process.env.HOST ?? '0.0.0.0';
const PORT = Number(process.env.PORT ?? 3000);
const BASE_PATH = normalizePath(process.env.BASE_PATH ?? '/my/path');
const HUB_PATH = `${BASE_PATH}/hub`;
const STATUS_PATH = `${BASE_PATH}/status`;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);
const ROOT_COOKIE_HEADER =
  'rootCookie=root-cookie-value; Path=/; HttpOnly; SameSite=Lax';
const SCOPED_COOKIE_WITHOUT_PATH_HEADER =
  'scopedCookie=scoped-cookie-value; HttpOnly; SameSite=Lax';
const RECORD_SEPARATOR = '\u001e';
const NEGOTIATE_ENTRY_TTL_MS = 60_000;
const connections = new Map();

const server = http.createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
  const isStatusRoute =
    request.method === 'GET' && (url.pathname === BASE_PATH || url.pathname === STATUS_PATH);
  const isNegotiateRoute =
    request.method === 'POST' && url.pathname === `${HUB_PATH}/negotiate`;
  const isKnownRoute =
    url.pathname === BASE_PATH ||
    url.pathname === STATUS_PATH ||
    url.pathname === `${HUB_PATH}/negotiate`;

  if (request.method === 'OPTIONS' && isKnownRoute) {
    if (request.headers.origin && !isOriginAllowed(request.headers.origin)) {
      response.statusCode = 403;
      response.end();
      return;
    }

    writeJson(request, response, 204, null);
    return;
  }

  if (isStatusRoute) {
    writeJson(request, response, 200, {
      message:
        `Prime cookies here before starting SignalR. The scoped cookie intentionally omits Path so it inherits the ${BASE_PATH} scope.`,
      urls: buildServerUrls(request),
      basePath: BASE_PATH,
      hubPath: HUB_PATH,
      request: buildRequestReport(request),
    });
    return;
  }

  if (isNegotiateRoute) {
    const connectionToken = randomUUID();
    const report = buildRequestReport(request);

    const cleanupTimer = setTimeout(() => {
      connections.delete(connectionToken);
    }, NEGOTIATE_ENTRY_TTL_MS);

    connections.set(connectionToken, {report, cleanupTimer});

    writeJson(request, response, 200, {
      connectionId: connectionToken,
      connectionToken,
      negotiateVersion: 1,
      urls: buildServerUrls(request),
      availableTransports: [
        {
          transport: 'WebSockets',
          transferFormats: ['Text'],
        },
      ],
      request: report,
    });
    return;
  }

  writeJson(request, response, 404, {
    message: 'Not found',
    urls: buildServerUrls(request),
    basePath: BASE_PATH,
    hubPath: HUB_PATH,
  });
});

const websocketServer = new WebSocketServer({noServer: true});

server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
  const connectionToken = url.searchParams.get('id');

  if (url.pathname !== HUB_PATH) {
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    socket.destroy();
    return;
  }

  if (!isOriginAllowed(request.headers.origin)) {
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    socket.destroy();
    return;
  }

  if (!connectionToken || !connections.has(connectionToken)) {
    socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
    socket.destroy();
    return;
  }

  websocketServer.handleUpgrade(request, socket, head, websocket => {
    websocketServer.emit('connection', websocket, request, url);
  });
});

websocketServer.on('connection', (websocket, request, url) => {
  const connectionToken = url.searchParams.get('id');
  const negotiateEntry = connectionToken ? connections.get(connectionToken) : null;
  const negotiateReport = negotiateEntry?.report ?? null;

  if (negotiateEntry && connectionToken) {
    clearTimeout(negotiateEntry.cleanupTimer);
    connections.delete(connectionToken);
  }

  const websocketReport = {
    transport: 'WebSockets',
    urls: buildServerUrls(request),
    websocketPath: url.pathname,
    websocketQuery: url.search,
    websocketRequest: buildRequestReport(request),
    negotiateRequest: negotiateReport,
  };

  websocket.on('message', messageBuffer => {
    let messages;

    try {
      messages = messageBuffer
        .toString()
        .split(RECORD_SEPARATOR)
        .filter(Boolean)
        .map(payload => JSON.parse(payload));
    } catch {
      websocket.close(1007, 'Invalid JSON payload');
      return;
    }

    for (const message of messages) {
      if (message.protocol === 'json') {
        websocket.send(`{}${RECORD_SEPARATOR}`);
        websocket.send(
          `${JSON.stringify({
            type: 1,
            target: 'ConnectionReportUpdated',
            arguments: [websocketReport],
          })}${RECORD_SEPARATOR}`,
        );
        continue;
      }

      if (message.type === 1 && message.target === 'GetConnectionReport') {
        websocket.send(
          `${JSON.stringify({
            type: 3,
            invocationId: message.invocationId,
            result: websocketReport,
          })}${RECORD_SEPARATOR}`,
        );
      }
    }
  });
});

server.listen(PORT, HOST, () => {
  console.log(`HTTP base URL: ${buildAbsoluteHttpUrl(HOST, PORT, BASE_PATH)}`);
  console.log(`HTTP status URL: ${buildAbsoluteHttpUrl(HOST, PORT, STATUS_PATH)}`);
  console.log(
    `SignalR negotiate URL: ${buildAbsoluteHttpUrl(HOST, PORT, `${HUB_PATH}/negotiate`)}`,
  );
  console.log(`SignalR WebSocket URL: ${buildAbsoluteWsUrl(HOST, PORT, HUB_PATH)}`);
});

function normalizePath(pathname) {
  if (!pathname || pathname === '/') {
    return '/';
  }

  const trimmedPath = pathname.replace(/\/+$/, '');
  return trimmedPath.startsWith('/') ? trimmedPath : `/${trimmedPath}`;
}

function buildRequestReport(request) {
  return {
    method: request.method ?? 'GET',
    path: request.url ?? '/',
    cookieHeader: request.headers.cookie ?? null,
    cookies: parseCookies(request.headers.cookie),
  };
}

function buildServerUrls(request) {
  const hostHeader = request?.headers?.host ?? `localhost:${PORT}`;
  const normalizedHostHeader = hostHeader.startsWith('0.0.0.0:')
    ? hostHeader.replace('0.0.0.0', 'localhost')
    : hostHeader;

  return {
    baseHttpUrl: new URL(BASE_PATH, `http://${normalizedHostHeader}`).toString(),
    statusHttpUrl: new URL(STATUS_PATH, `http://${normalizedHostHeader}`).toString(),
    negotiateHttpUrl: new URL(
      `${HUB_PATH}/negotiate`,
      `http://${normalizedHostHeader}`,
    ).toString(),
    hubWebSocketUrl: new URL(HUB_PATH, `ws://${normalizedHostHeader}`).toString(),
  };
}

function parseCookies(cookieHeader) {
  if (!cookieHeader) {
    return {};
  }

  return cookieHeader.split(/;\s*/).reduce((cookies, cookieEntry) => {
    const [name, ...valueParts] = cookieEntry.split('=');

    if (name) {
      cookies[name] = valueParts.join('=');
    }

    return cookies;
  }, {});
}

function writeJson(request, response, statusCode, payload) {
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;

  response.statusCode = statusCode;
  applyCorsHeaders(request, response);
  response.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (request.method !== 'OPTIONS') {
    response.setHeader('Set-Cookie', buildSetCookieHeader(pathname));
  }

  response.end(payload === null ? '' : JSON.stringify(payload, null, 2));
}

function buildSetCookieHeader(pathname) {
  const cookies = [ROOT_COOKIE_HEADER];

  if (pathname === BASE_PATH || pathname === STATUS_PATH) {
    cookies.push(SCOPED_COOKIE_WITHOUT_PATH_HEADER);
  }

  return cookies;
}

function applyCorsHeaders(request, response) {
  const origin = request.headers.origin;

  if (!origin || !isOriginAllowed(origin)) {
    return;
  }

  response.setHeader('Access-Control-Allow-Origin', origin);
  response.setHeader('Access-Control-Allow-Credentials', 'true');
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  response.setHeader('Vary', 'Origin');
}

function isOriginAllowed(origin) {
  if (!origin) {
    return ALLOWED_ORIGINS.length === 0;
  }

  return ALLOWED_ORIGINS.includes(origin);
}

function buildAbsoluteHttpUrl(host, port, pathname) {
  return new URL(pathname, buildBaseOrigin('http', host, port)).toString();
}

function buildAbsoluteWsUrl(host, port, pathname) {
  return new URL(pathname, buildBaseOrigin('ws', host, port)).toString();
}

function buildBaseOrigin(protocol, host, port) {
  const normalizedHost = host === '0.0.0.0' ? 'localhost' : host;
  const hostname = normalizedHost.includes(':') && !normalizedHost.startsWith('[')
    ? `[${normalizedHost}]`
    : normalizedHost;

  return `${protocol}://${hostname}:${port}`;
}
