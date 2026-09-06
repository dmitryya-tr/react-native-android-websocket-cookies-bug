const {randomUUID} = require('node:crypto');
const http = require('node:http');
const {URL} = require('node:url');
const {WebSocketServer} = require('ws');

const HOST = process.env.HOST ?? '0.0.0.0';
const PORT = Number(process.env.PORT ?? 3000);
const BASE_PATH = normalizePath(process.env.BASE_PATH ?? '/my/path');
const HUB_PATH = `${BASE_PATH}/hub`;
const STATUS_PATH = `${BASE_PATH}/status`;
const RECORD_SEPARATOR = '\u001e';
const connections = new Map();

const server = http.createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);

  if (request.method === 'OPTIONS') {
    writeJson(request, response, 204, null);
    return;
  }

  if (request.method === 'GET' && (url.pathname === BASE_PATH || url.pathname === STATUS_PATH)) {
    writeJson(request, response, 200, {
      message:
        `Prime cookies here before starting SignalR. The scoped cookie intentionally omits Path so it inherits the ${BASE_PATH} scope.`,
      basePath: BASE_PATH,
      hubPath: HUB_PATH,
      request: buildRequestReport(request),
    });
    return;
  }

  if (request.method === 'POST' && url.pathname === `${HUB_PATH}/negotiate`) {
    const connectionToken = randomUUID();
    const report = buildRequestReport(request);

    connections.set(connectionToken, report);

    writeJson(request, response, 200, {
      connectionId: connectionToken,
      connectionToken,
      negotiateVersion: 1,
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
    basePath: BASE_PATH,
    hubPath: HUB_PATH,
  });
});

const websocketServer = new WebSocketServer({noServer: true});

server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);

  if (url.pathname !== HUB_PATH) {
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    socket.destroy();
    return;
  }

  websocketServer.handleUpgrade(request, socket, head, websocket => {
    websocketServer.emit('connection', websocket, request, url);
  });
});

websocketServer.on('connection', (websocket, request, url) => {
  const connectionToken = url.searchParams.get('id');
  const negotiateReport = connectionToken ? connections.get(connectionToken) : null;
  const websocketReport = {
    transport: 'WebSockets',
    websocketPath: url.pathname,
    websocketQuery: url.search,
    websocketRequest: buildRequestReport(request),
    negotiateRequest: negotiateReport,
  };

  websocket.on('message', messageBuffer => {
    const messages = messageBuffer
      .toString()
      .split(RECORD_SEPARATOR)
      .filter(Boolean)
      .map(payload => JSON.parse(payload));

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
  console.log(`SignalR cookie repro server listening on http://${HOST}:${PORT}${BASE_PATH}`);
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
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Set-Cookie', buildSetCookieHeader(pathname));
  response.end(payload === null ? '' : JSON.stringify(payload, null, 2));
}

function buildSetCookieHeader(pathname) {
  const cookies = ['rootCookie=root-cookie-value; Path=/; HttpOnly; SameSite=Lax'];

  if (pathname === BASE_PATH || pathname === STATUS_PATH) {
    cookies.push('scopedCookie=scoped-cookie-value; HttpOnly; SameSite=Lax');
  }

  return cookies;
}
