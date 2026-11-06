// HTTP for the tests of the preview server (`scripts/lib/serve.mjs`), two ways:
//
//  - `call(handler, url)` runs a request handler (what `createHandler`
//    returns) against a fake request and response, no socket involved. The
//    handler is synchronous, so the answer is there when the call returns.
//
//      const handler = createHandler({ distDir: repo.dist });
//      const { status, headers, body } = call(handler, '/en/?x=1', { method: 'HEAD' });
//      assert.equal(status, 200);
//      assert.equal(headers['content-type'], 'text/html; charset=utf-8');
//
//  - `startServer(distDir)` starts the real server, on 127.0.0.1 and a free
//    port chosen by the system (never a fixed one: tests run in parallel), and
//    `rawRequest` talks to it with the request target exactly as given, which
//    `fetch` does not do (it tidies `/../` away before sending).
//
//      await withServer(repo.dist, async ({ url }) => {
//        const res = await rawRequest(url, '/%2e%2e/secret.txt');
//        assert.equal(res.status, 404);
//      });

import http from 'node:http';
import { listen } from '../../scripts/lib/serve.mjs';

/**
 * A fake request: all that `createHandler` reads.
 *
 * @param {string} method
 * @param {string} url The request target, as it came off the wire.
 * @returns {{ method: string, url: string }}
 */
export const fakeRequest = (method, url) => ({ method, url });

/**
 * A fake response that records what the handler does with it. `writeHead` and
 * `end` must each be called exactly once; `result()` says what was sent.
 */
export function fakeResponse() {
  const log = { heads: [], ends: [] };
  return {
    writeHead(status, headers) {
      log.heads.push({ status, headers: { ...headers } });
    },
    end(body) {
      log.ends.push(body);
    },
    log,
    /**
     * @returns {{
     *   status: number,
     *   headers: Record<string, string>,
     *   body: any,
     *   text: string,
     * }} The header names in lower case; `body` is what the handler passed to
     *   `end` (the real handler sends a Buffer, and nothing for HEAD), `text`
     *   the same as a string. Throws when the response was not started and
     *   ended once: a handler that forgets to answer would otherwise look like
     *   a test of nothing.
     */
    result() {
      if (log.heads.length !== 1 || log.ends.length !== 1)
        throw new Error(
          `expected one writeHead and one end, got ${log.heads.length} and ${log.ends.length}`,
        );
      const [{ status, headers }] = log.heads;
      return {
        status,
        headers: Object.fromEntries(
          Object.entries(headers).map(([name, value]) => [
            name.toLowerCase(),
            value,
          ]),
        ),
        body: log.ends[0],
        text: log.ends[0] === undefined ? '' : String(log.ends[0]),
      };
    },
  };
}

/**
 * Runs a request through a handler.
 *
 * @param {(req: any, res: any) => void} handler
 * @param {string} url The request target, e.g. `/en/?x=1`.
 * @param {{ method?: string }} [options] `GET` by default.
 * @returns {ReturnType<ReturnType<typeof fakeResponse>['result']>}
 */
export function call(handler, url, { method = 'GET' } = {}) {
  const res = fakeResponse();
  handler(fakeRequest(method, url), res);
  return res.result();
}

/**
 * Starts the real server on `127.0.0.1` and a free port.
 *
 * @param {string} distDir The folder to serve.
 * @param {{ host?: string, fs?: typeof import('node:fs') }} [options]
 * @returns {Promise<{
 *   server: import('node:http').Server,
 *   url: string,
 *   port: number,
 *   close: () => Promise<void>,
 * }>} `url` is `http://127.0.0.1:<port>` with no trailing slash; `close()`
 *   ends the server and every connection to it.
 */
export async function startServer(distDir, { host = '127.0.0.1', fs } = {}) {
  const server = await listen({ distDir, host, port: 0, fs });
  const { port } = server.address();
  return {
    server,
    port,
    url: `http://${host}:${port}`,
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}

/**
 * Runs `fn` with a started server and always closes it afterwards.
 *
 * @template T
 * @param {string} distDir
 * @param {(server: Awaited<ReturnType<typeof startServer>>) => T | Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withServer(distDir, fn) {
  const started = await startServer(distDir);
  try {
    return await fn(started);
  } finally {
    await started.close();
  }
}

/**
 * One request with the request target written exactly as given (percent
 * encoding, `..` segments and all), on its own connection, with no redirect
 * followed.
 *
 * @param {string} origin `url` of a started server.
 * @param {string} target The request target, e.g. `/en/?x=1`.
 * @param {{ method?: string, headers?: Record<string, string> }} [options]
 * @returns {Promise<{
 *   status: number,
 *   headers: Record<string, string | string[] | undefined>,
 *   buffer: Buffer,
 *   body: string,
 * }>} The header names are in lower case; `body` is the buffer as UTF-8.
 */
export function rawRequest(origin, target, { method = 'GET', headers } = {}) {
  const { hostname, port } = new URL(origin);
  return new Promise((resolve, reject) => {
    const request = http.request(
      { hostname, port, path: target, method, headers, agent: false },
      (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => {
          const buffer = Buffer.concat(chunks);
          resolve({
            status: response.statusCode,
            headers: response.headers,
            buffer,
            body: buffer.toString('utf8'),
          });
        });
      },
    );
    request.on('error', reject);
    request.end();
  });
}
