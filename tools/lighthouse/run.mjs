#!/usr/bin/env node
// Lighthouse (mobile) against the built site: mise run lighthouse [-- --out <dir>]
//
// Serves dist/ with the repository's own server on a free port, audits every
// page of the sitemap with the Lighthouse pinned in this folder's lockfile and
// fails when a category scores below its minimum (see MINIMUM). A page that
// falls short is measured once more, because hosted runners are noisy: the
// retry is printed and annotated, never silent, and a real regression fails
// both times. The JSON and HTML reports of every attempt go to --out, to
// $LIGHTHOUSE_OUT, or to <tmp>/pizzacompendium-lighthouse.
//
//   CHROME_PATH  the Chrome or Chromium to use (default: whatever Lighthouse
//                finds; hosted Ubuntu runners have Google Chrome)
//   CI           adds --no-sandbox and --disable-dev-shm-usage, the flags
//                Chrome usually needs on CI runners and in containers
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { describeError, listen } from '../../scripts/lib/serve.mjs';

/** The lowest score (0-100) each category may have, on every page. */
const MINIMUM = {
  performance: 90,
  accessibility: 100,
  'best-practices': 95,
  seo: 95,
};
/** A page that falls short is measured once more. */
const ATTEMPTS = 2;
/**
 * A run that takes longer is killed and counts as a failed attempt. A normal
 * one takes 10 to 15 seconds.
 */
const RUN_TIMEOUT_MS = 90_000;
/**
 * No page is started after this much time has gone by (the rest fail as "not
 * measured"). With the two limits above a hanging Chrome costs at most 8
 * minutes plus 2 x 90 seconds, however many languages there are, so the report
 * is written before the 15 minutes of the CI job are up.
 */
const BUDGET_MS = 8 * 60_000;

const root = path.resolve(import.meta.dirname, '../..');
const cli = path.join(
  import.meta.dirname,
  'node_modules/lighthouse/cli/index.js',
);
const annotate = process.env.GITHUB_ACTIONS === 'true';

const { values } = parseArgs({ options: { out: { type: 'string' } } });
const outDir = path.resolve(
  values.out ??
    process.env.LIGHTHOUSE_OUT ??
    path.join(os.tmpdir(), 'pizzacompendium-lighthouse'),
);

/** Says what is wrong (as an annotation too, on GitHub) and stops with 1. */
function fail(message) {
  console.error(`lighthouse: ${message}`);
  if (annotate) console.log(`::error title=lighthouse::${message}`);
  process.exit(1);
}

// chrome-launcher silently falls back to another Chrome when CHROME_PATH does
// not exist, which would measure something other than what was asked for.
if (process.env.CHROME_PATH && !fs.existsSync(process.env.CHROME_PATH))
  fail(`CHROME_PATH does not exist: ${process.env.CHROME_PATH}`);

/** The paths of the pages the site lists in its sitemap, e.g. `/en/`. */
function pagesOf(distDir) {
  const file = path.join(distDir, 'sitemap.xml');
  if (!fs.existsSync(file))
    fail('dist/sitemap.xml does not exist: run "mise run build" first');
  const xml = fs.readFileSync(file, 'utf8');
  const paths = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
    (match) => new URL(match[1]).pathname,
  );
  if (paths.length === 0) fail('dist/sitemap.xml lists no page');
  return paths;
}

/** Runs the Lighthouse command line once; resolves with its exit status. */
function runLighthouse(url, reportBase) {
  const flags = ['--headless=new'];
  if (process.env.CI) flags.push('--no-sandbox', '--disable-dev-shm-usage');
  const args = [
    cli,
    url,
    '--quiet',
    '--output=json',
    '--output=html',
    `--output-path=${reportBase}`,
    `--only-categories=${Object.keys(MINIMUM).join(',')}`,
    `--chrome-flags=${flags.join(' ')}`,
  ];
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      stdio: ['ignore', 'inherit', 'inherit'],
      timeout: RUN_TIMEOUT_MS,
    });
    child.on('error', () => resolve(1));
    child.on('close', (code) => resolve(code ?? 1));
  });
}

/** The audits that cost a category points, as `id: title` lines. */
function failingAudits(lhr, category) {
  return lhr.categories[category].auditRefs
    .filter(({ id, weight }) => weight > 0 && lhr.audits[id].score < 1)
    .map(({ id }) => `${id}: ${lhr.audits[id].title}`);
}

/** One measurement: its scores and shortfalls, or why there are none. */
async function measure(url, reportBase) {
  const status = await runLighthouse(url, reportBase);
  const file = `${reportBase}.report.json`;
  if (status !== 0 || !fs.existsSync(file))
    return { failure: `lighthouse exited with status ${status}`, misses: [] };
  const lhr = JSON.parse(fs.readFileSync(file, 'utf8'));
  const scores = {};
  const misses = [];
  for (const [category, minimum] of Object.entries(MINIMUM)) {
    const score = Math.round((lhr.categories[category].score ?? 0) * 100);
    scores[category] = score;
    if (score < minimum) misses.push({ category, score, minimum });
  }
  return { lhr, scores, misses };
}

const passed = (attempt) => !attempt.failure && attempt.misses.length === 0;

/** What fell short, in one line. */
const shortfall = (attempt) =>
  attempt.failure ??
  attempt.misses
    .map(({ category, score, minimum }) => `${category} ${score} < ${minimum}`)
    .join(', ');

/** Measures a page until it passes or the attempts are used up. */
async function audit(origin, pagePath) {
  const slug = pagePath.replaceAll('/', '') || 'root';
  const attempts = [];
  for (let n = 1; n <= ATTEMPTS; n++) {
    const attempt = await measure(
      `${origin}${pagePath}`,
      path.join(outDir, `${slug}-${n}`),
    );
    attempts.push(attempt);
    const scores = Object.entries(attempt.scores ?? {})
      .map(([category, score]) => `${category} ${score}`)
      .join('  ');
    console.log(
      `${pagePath}  attempt ${n}  ${scores}  ${passed(attempt) ? 'ok' : 'FAIL'}`,
    );
    for (const warning of attempt.lhr?.runWarnings ?? [])
      console.log(`    warning: ${warning}`);
    if (passed(attempt)) break;
    for (const { category } of attempt.misses)
      for (const line of failingAudits(attempt.lhr, category))
        console.log(`    ${category}: ${line}`);
    console.log(`    ${shortfall(attempt)}`);
    if (n < ATTEMPTS) {
      console.log(`    measuring ${pagePath} once more`);
      if (annotate)
        console.log(
          `::warning title=lighthouse retry::${pagePath} attempt ${n}: ${shortfall(attempt)}`,
        );
    }
  }
  const ok = passed(attempts.at(-1));
  if (!ok && annotate)
    console.log(
      `::error title=lighthouse::${pagePath}: ${shortfall(attempts.at(-1))}`,
    );
  return { pagePath, attempts, ok };
}

/** A table for the job summary of a GitHub Actions run. */
function summaryTable(version, results) {
  const categories = Object.keys(MINIMUM);
  const lines = [
    `### Lighthouse ${version}, mobile`,
    '',
    `| page | ${categories.join(' | ')} | attempts | result |`,
    `| --- | ${categories.map(() => '---:').join(' | ')} | ---: | --- |`,
  ];
  for (const { pagePath, attempts, ok } of results) {
    const { scores = {} } = attempts.at(-1);
    const cells = categories.map((category) => scores[category] ?? '-');
    lines.push(
      `| ${pagePath} | ${cells.join(' | ')} | ${attempts.length} | ${ok ? 'passed' : 'failed'} |`,
    );
  }
  const minimums = categories.map((category) => MINIMUM[category]);
  lines.push(`| minimum | ${minimums.join(' | ')} | | |`, '');
  return lines.join('\n');
}

/** A page that was not started, because the time budget was used up. */
function notMeasured(pagePath) {
  const failure = 'not measured: out of time';
  console.log(`${pagePath}  ${failure}`);
  if (annotate)
    console.log(`::error title=lighthouse::${pagePath}: ${failure}`);
  return { pagePath, attempts: [{ failure, misses: [] }], ok: false };
}

const distDir = path.join(root, 'dist');
let server;
try {
  server = await listen({ distDir, host: '127.0.0.1', port: 0 });
} catch (error) {
  fail(describeError(error, { host: '127.0.0.1', port: 0 }));
}

try {
  fs.mkdirSync(outDir, { recursive: true });
  const origin = `http://127.0.0.1:${server.address().port}`;
  console.log(`Auditing ${origin} (dist/ served by scripts/lib/serve.mjs)`);
  console.log(`Reports: ${outDir}`);
  const started = Date.now();
  const results = [];
  for (const pagePath of pagesOf(distDir))
    results.push(
      Date.now() - started > BUDGET_MS
        ? notMeasured(pagePath)
        : await audit(origin, pagePath),
    );

  const measured = results
    .flatMap(({ attempts }) => attempts)
    .find((a) => a.lhr);
  const chrome =
    measured?.lhr.environment.hostUserAgent.match(/Chrome\/[\d.]+/);
  const version = measured
    ? `${measured.lhr.lighthouseVersion}, ${chrome?.[0] ?? 'unknown Chrome'}`
    : '(no report)';
  const table = summaryTable(version, results);
  fs.writeFileSync(path.join(outDir, 'summary.md'), table);
  if (process.env.GITHUB_STEP_SUMMARY)
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${table}\n`);

  const failed = results.filter((result) => !result.ok);
  console.log(
    failed.length === 0
      ? `\nLighthouse ${version}: every page meets the minimum scores.`
      : `\nLighthouse ${version}: ${failed.map((r) => r.pagePath).join(' ')} below the minimum.`,
  );
  process.exitCode = failed.length === 0 ? 0 : 1;
} finally {
  server.closeAllConnections();
  server.close();
}
