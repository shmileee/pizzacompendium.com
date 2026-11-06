// The `test` every spec imports (`import { expect, test } from
// '../support/fixtures.js'`): Playwright's own, plus
//
//   baseURL   the address of the running site (support/site.js), so that
//             `page.goto('/en/')` works
//   site      `{ url, dist, languages }` of that site (worker scope)
//   problems  (automatic) every console error or warning, uncaught page error
//             and securitypolicyviolation event of the test, in an array that
//             is empty when all is well. The test fails at its end when it is
//             not; `problems.allow(/regex/)` first when a test provokes one
//             on purpose
//   coverage  (automatic) when COVERAGE_DIR is set, the JavaScript coverage of
//             the site's own scripts, written where c8 reads Node's
//
// Both automatic fixtures watch the `context` of the test. A context a test
// makes itself (`browser.newContext()`) is not watched: pass it to
// `watchProblems` and `collectCoverage`.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { test as base, expect } from '@playwright/test';
import { ROOT, siteInfo } from './site.js';

export { expect };

// ---------------------------------------------------------------------------
// Problems

/**
 * Records what is wrong with the pages of a context in `problems`.
 *
 * The securitypolicyviolation events come through a binding, because the
 * console message that goes with a violation says little and a test of a
 * policy wants the directive and the address.
 *
 * @param {import('@playwright/test').BrowserContext} context
 * @param {string[]} problems
 */
export async function watchProblems(context, problems) {
  await context.exposeBinding('__pcViolation', (_source, detail) => {
    problems.push(`securitypolicyviolation: ${detail}`);
  });
  await context.addInitScript(() => {
    window.addEventListener(
      'securitypolicyviolation',
      (event) =>
        window.__pcViolation(`${event.violatedDirective} ${event.blockedURI}`),
      true,
    );
  });
  const watch = (page) => {
    page.on('pageerror', (error) =>
      problems.push(`pageerror: ${error.message}`),
    );
    page.on('console', (message) => {
      if (['error', 'warning'].includes(message.type()))
        problems.push(`console ${message.type()}: ${message.text()}`);
    });
  };
  context.on('page', watch);
  for (const page of context.pages()) watch(page);
}

// ---------------------------------------------------------------------------
// Coverage

/** The text of a file of src/, read once. */
const sources = new Map();
const sourceText = (file) => {
  if (!sources.has(file)) sources.set(file, readFileSync(file, 'utf8'));
  return sources.get(file);
};

/**
 * The V8 coverage of the scripts of the site, with the address of each
 * rewritten to the file of `src/` it is a copy of (`/assets/js/faq.js` is
 * `src/js/faq.js`), which is where c8 finds the source to put the counts on.
 * What is not a script of the site (the inline scripts of a page) is dropped.
 */
function siteCoverage(entries, origin) {
  const result = [];
  for (const { url, scriptId, source, functions } of entries) {
    const { pathname } = new URL(url);
    if (!url.startsWith(`${origin}/assets/`) || !pathname.endsWith('.js'))
      continue;
    const file = path.join(
      ROOT,
      'src',
      decodeURIComponent(pathname.slice('/assets/'.length)),
    );
    if (!existsSync(file))
      throw new Error(`${url} has no file in src/ (${file})`);
    // The counts are offsets into the text the browser ran: it has to be the
    // text of the file, or they land on the wrong lines.
    if (source !== undefined && source !== sourceText(file))
      throw new Error(
        `${url} is not a copy of ${path.relative(ROOT, file)}: was the site built with --no-fingerprint?`,
      );
    result.push({ scriptId, url: pathToFileURL(file).href, functions });
  }
  return result;
}

let written = 0;

/**
 * Starts collecting the JavaScript coverage of every page of a context, when
 * COVERAGE_DIR is set (a plain `mise run e2e` collects nothing).
 *
 * @param {import('@playwright/test').BrowserContext} context
 * @param {string} origin The address of the site, without a trailing slash.
 * @returns {() => Promise<void>} Stops collecting and writes the coverage of
 *   the pages that are still open, as V8 process coverage files named
 *   `coverage-client-<pid>-<n>.json`.
 */
export function collectCoverage(context, origin) {
  const dir = process.env.COVERAGE_DIR;
  if (!dir) return async () => {};
  const pages = new Set();
  const start = (page) => {
    if (pages.has(page)) return;
    pages.add(page);
    // The page keeps its coverage when it navigates, so that a test that
    // visits several addresses reports all of them.
    page.coverage.startJSCoverage({ resetOnNavigation: false }).catch(() => {});
  };
  context.on('page', start);
  for (const page of context.pages()) start(page);
  return async () => {
    for (const page of pages) {
      if (page.isClosed()) continue;
      let entries;
      try {
        entries = await page.coverage.stopJSCoverage();
      } catch {
        // The page went away while it was being asked.
        continue;
      }
      const result = siteCoverage(entries, origin);
      if (result.length === 0) continue;
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        path.join(dir, `coverage-client-${process.pid}-${written++}.json`),
        JSON.stringify({ result }),
      );
    }
  };
}

// ---------------------------------------------------------------------------

export const test = base.extend({
  baseURL: [
    async ({}, use) => {
      await use(siteInfo().url);
    },
    { option: true },
  ],

  site: [
    async ({}, use) => {
      await use(siteInfo());
    },
    { scope: 'worker' },
  ],

  problems: [
    async ({ context }, use) => {
      const problems = [];
      const allowed = [];
      // Not enumerable, so that `expect(problems).toEqual([])` works.
      Object.defineProperty(problems, 'allow', {
        value: (pattern) => allowed.push(pattern),
      });
      await watchProblems(context, problems);
      await use(problems);
      const unexpected = problems.filter(
        (problem) => !allowed.some((pattern) => pattern.test(problem)),
      );
      expect(
        unexpected,
        'console errors, page errors or security policy violations',
      ).toEqual([]);
    },
    { auto: true },
  ],

  coverage: [
    async ({ context, site }, use) => {
      const flush = collectCoverage(context, site.url);
      await use(undefined);
      await flush();
    },
    { auto: true },
  ],
});
