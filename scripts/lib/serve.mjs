import nodeFs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import zlib from 'node:zlib';

// What GitHub Pages sends, so the preview behaves like production.
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

// Text is sent gzipped to a client that accepts it, as GitHub Pages does, so
// that a preview (and the Lighthouse gate) sees production's byte counts.
const COMPRESSIBLE =
  /^(text\/|application\/(json|xml|manifest\+json)|image\/svg)/;

/**
 * A request handler that serves a built site read-only, the way GitHub
 * Pages does: `/dir` goes to `/dir/`, a directory serves its `index.html`,
 * an unknown address gets `404.html` with status 404. Nothing outside
 * `distDir` is reachable (the containment is checked on the real path, so
 * neither `..`, a sibling folder that merely starts with the same name nor
 * a symbolic link gets out), and a wrong-case address is a 404 as it is on
 * Pages even if the disk does not care.
 *
 * @param {object} options
 * @param {string} options.distDir Must be a folder.
 * @param {typeof nodeFs} [options.fs]
 * @returns {(req: { method?: string, url?: string, headers?: Record<string, string | undefined> }, res: any) => void}
 */
export function createHandler({ distDir, fs = nodeFs }) {
  const root = fs.realpathSync.native(distDir);
  if (!fs.statSync(root).isDirectory())
    throw Object.assign(new Error('not a folder'), { code: 'ENOTDIR' });

  /** The real path and stat of something inside the site, or null. */
  const locate = (segments) => {
    const wanted = path.join(root, ...segments);
    try {
      const real = fs.realpathSync.native(wanted);
      const relative = path.relative(root, real);
      if (relative === '..' || relative.startsWith(`..${path.sep}`))
        return null;
      if (real !== wanted && real.toLowerCase() === wanted.toLowerCase())
        return null;
      return { real, stat: fs.statSync(real) };
    } catch {
      return null;
    }
  };

  const send = (res, status, headers, body) => {
    res.writeHead(status, {
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    });
    res.end(body);
  };

  return (req, res) => {
    const plain = { 'Content-Type': 'text/plain; charset=utf-8' };
    if (req.method !== 'GET' && req.method !== 'HEAD')
      return send(
        res,
        405,
        { ...plain, Allow: 'GET, HEAD' },
        'Method not allowed',
      );
    const [rawPath, ...query] = req.url.split('?');
    const search = query.length > 0 ? `?${query.join('?')}` : '';
    let pathname;
    try {
      pathname = decodeURIComponent(rawPath);
    } catch {
      return send(res, 400, plain, 'Bad request');
    }
    if (pathname.includes('\0')) return send(res, 400, plain, 'Bad request');
    const segments = pathname
      .split(/[\\/]+/)
      .filter((part) => part && part !== '.');

    let found = locate(segments);
    if (found?.stat.isDirectory()) {
      if (segments.length > 0 && !/[\\/]$/.test(pathname))
        return send(
          res,
          302,
          {
            Location: `/${segments.map(encodeURIComponent).join('/')}/${search}`,
          },
          '',
        );
      found = locate([...segments, 'index.html']);
    }
    const ok = found?.stat.isFile() === true;
    const served = ok ? found : locate(['404.html']);
    let body;
    try {
      body = served ? fs.readFileSync(served.real) : 'Not found';
    } catch {
      return send(res, 500, plain, 'Internal error');
    }
    const type = served
      ? (TYPES[path.extname(served.real).toLowerCase()] ??
        'application/octet-stream')
      : plain['Content-Type'];
    const headers = { 'Content-Type': type };
    if (COMPRESSIBLE.test(type)) {
      headers.Vary = 'Accept-Encoding';
      if (/\bgzip\b/.test(req.headers?.['accept-encoding'] ?? '')) {
        body = zlib.gzipSync(body);
        headers['Content-Encoding'] = 'gzip';
      }
    }
    headers['Content-Length'] = Buffer.byteLength(body);
    send(
      res,
      ok ? 200 : 404,
      headers,
      req.method === 'HEAD' ? undefined : body,
    );
  };
}

/**
 * @param {string | undefined} value From the environment.
 * @param {number} fallback
 * @returns {number | null} A port from 0 (any free one) to 65535, or null.
 */
export function parsePort(value, fallback) {
  if (value === undefined || value === '') return fallback;
  const port = /^\d{1,5}$/.test(value) ? Number(value) : NaN;
  return port <= 65535 ? port : null;
}

/**
 * Starts serving. Resolves with the listening server, rejects with the
 * reason it could not start (see `describeError`).
 *
 * @param {object} options
 * @param {string} options.distDir
 * @param {string} options.host
 * @param {number} options.port
 * @param {typeof nodeFs} [options.fs]
 * @returns {Promise<import('node:http').Server>}
 */
export function listen({ distDir, host, port, fs }) {
  return new Promise((resolve, reject) => {
    let server;
    try {
      server = http.createServer(createHandler({ distDir, fs }));
    } catch (error) {
      reject(error);
      return;
    }
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve(server);
    });
  });
}

/**
 * The address to print for a server that listens on `host` and `port`.
 *
 * @param {string} host
 * @param {number} port The port actually bound (not 0).
 * @returns {string}
 */
export function describeUrl(host, port) {
  if (host === '127.0.0.1') return `http://localhost:${port}/`;
  return `http://${host.includes(':') ? `[${host}]` : host}:${port}/`;
}

/**
 * One clear line for a failure to start.
 *
 * @param {{ code: string }} error
 * @param {{ host: string, port: number }} where
 * @returns {string}
 */
export function describeError(error, { host, port }) {
  if (error.code === 'ENOENT')
    return 'dist/ does not exist: run "mise run build" first';
  if (error.code === 'ENOTDIR')
    return 'dist is not a folder: run "mise run build" first';
  if (error.code === 'EADDRINUSE')
    return `port ${port} is already in use: try PORT=${port + 1} mise run serve`;
  return `cannot listen on ${host}:${port}: ${error.code}`;
}
