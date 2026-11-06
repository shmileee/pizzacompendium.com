// The site under test: the real one, built once per run and served on a free
// port. Playwright runs the default export before any test (globalSetup) and
// the function it returns afterwards; the address and the folder reach the
// workers through the environment, where `siteInfo()` reads them.
//
// The build is the command line of the repository (`scripts/build.mjs`) with
// `--no-fingerprint`, which copies the scripts of `src/` into the site byte for
// byte: that is what lets support/fixtures.js attribute the coverage of a
// script that ran in the browser to its file in `src/`. It runs in a clean
// environment, and in a process of its own so that its coverage is collected
// when COVERAGE_DIR is set. The server is the repository's own
// (`scripts/lib/serve.mjs`), in this process, on 127.0.0.1 and a port the
// system picks, so runs side by side never meet.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { listen } from '../../scripts/lib/serve.mjs';

export const ROOT = path.resolve(import.meta.dirname, '../..');

const URL_VAR = 'PIZZA_E2E_URL';
const DIST_VAR = 'PIZZA_E2E_DIST';

/** What the build gets: no machine settings, the coverage folder if any. */
const buildEnv = () => ({
  PATH: process.env.PATH,
  TZ: 'UTC',
  LC_ALL: 'C',
  ...(process.env.COVERAGE_DIR && {
    NODE_V8_COVERAGE: process.env.COVERAGE_DIR,
  }),
});

export default async function globalSetup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-e2e-'));
  const dist = path.join(dir, 'dist');
  const built = spawnSync(
    process.execPath,
    [
      path.join(ROOT, 'scripts/build.mjs'),
      '--no-fingerprint',
      '--quiet',
      '--format',
      'text',
      '--out',
      dist,
    ],
    { cwd: ROOT, env: buildEnv(), encoding: 'utf8' },
  );
  if (built.status !== 0) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw new Error(
      `the site did not build (exit ${built.status}):\n${built.stderr}${built.error ?? ''}`,
    );
  }
  const server = await listen({ distDir: dist, host: '127.0.0.1', port: 0 });
  // The tests do not keep the process alive; the teardown below stops it.
  server.unref();
  process.env[URL_VAR] = `http://127.0.0.1:${server.address().port}`;
  process.env[DIST_VAR] = dist;
  return async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  };
}

/**
 * Where the site is, for a test or a fixture.
 *
 * @returns {{ url: string, dist: string, languages: string[] }} `url` has no
 *   trailing slash, `dist` is the built folder, `languages` are the codes of
 *   the published languages (the pages of the sitemap), in its order.
 */
export function siteInfo() {
  const url = process.env[URL_VAR];
  const dist = process.env[DIST_VAR];
  if (!url || !dist)
    throw new Error(
      'the site is not running: start the tests with Playwright (mise run e2e), which builds and serves it in globalSetup (support/site.js)',
    );
  const sitemap = fs.readFileSync(path.join(dist, 'sitemap.xml'), 'utf8');
  const languages = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
    ([, loc]) => new URL(loc).pathname.split('/').filter(Boolean).at(-1),
  );
  return { url, dist, languages };
}
