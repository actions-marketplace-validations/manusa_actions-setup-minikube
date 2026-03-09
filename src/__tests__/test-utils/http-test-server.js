'use strict';

const {createServer} = require('node:http');

const createHttpTestServer = () => {
  let server = null;
  let routes = {GET: {}, POST: {}, PUT: {}, DELETE: {}};
  let requests = [];

  const sendJson = (res, status, body) => {
    res.writeHead(status, {'Content-Type': 'application/json'});
    res.end(JSON.stringify(body));
  };

  const start = () =>
    new Promise((resolve, reject) => {
      server = createServer(async (req, res) => {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const method = req.method.toUpperCase();

        let body = '';
        for await (const chunk of req) {
          body += chunk;
        }

        const request = {
          method,
          url: req.url,
          pathname: url.pathname,
          headers: req.headers,
          body: body || null
        };
        requests.push(request);

        const handler = findHandler(method, url.pathname);
        if (handler) {
          try {
            const result = await handler(request);
            if (result.binary) {
              res.writeHead(result.status ?? 200, {
                'Content-Type': 'application/octet-stream',
                ...result.headers
              });
              res.end(result.binary);
            } else {
              const status = result.status ?? 200;
              const responseBody = result.body ?? result;
              sendJson(res, status, responseBody);
            }
          } catch (err) {
            sendJson(res, 500, {error: err.message});
          }
        } else {
          sendJson(res, 404, {error: `Not found: ${method} ${url.pathname}`});
        }
      });

      server.on('error', reject);
      server.listen(0, '127.0.0.1', () => {
        resolve(server.address().port);
      });
    });

  const findHandler = (method, pathname) => {
    const methodRoutes = routes[method] || {};
    if (methodRoutes[pathname]) {
      return methodRoutes[pathname];
    }
    for (const [pattern, handler] of Object.entries(methodRoutes)) {
      if (pattern.endsWith('*') && pathname.startsWith(pattern.slice(0, -1))) {
        return handler;
      }
    }
    return null;
  };

  const stop = () =>
    new Promise(resolve => {
      if (server) {
        server.close(resolve);
        server = null;
      } else {
        resolve();
      }
      routes = {GET: {}, POST: {}, PUT: {}, DELETE: {}};
      requests = [];
    });

  const addRoute = (method, path, handler) => {
    const routeHandler =
      typeof handler === 'function' ? handler : () => handler;
    routes[method.toUpperCase()][path] = routeHandler;
  };

  return {
    start,
    stop,
    get: (path, handler) => addRoute('GET', path, handler),
    clearRoutes: () => {
      routes = {GET: {}, POST: {}, PUT: {}, DELETE: {}};
    },
    clearRequests: () => {
      requests = [];
    },
    getRequests: () => [...requests],
    getLastRequest: () => requests[requests.length - 1]
  };
};

module.exports = {createHttpTestServer};
