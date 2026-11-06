// Runs every kind of test and merges what they executed into one report of
// the code the site ships (`scripts/` and the scripts of `src/`):
//   - the unit and integration tests (node:test), and the command lines and
//     servers they start,
//   - the end-to-end tests (Playwright), including the JavaScript that ran in
//     the browser (support/fixtures.js writes it where c8 reads Node's).
// Then it fails unless lines, branches, functions and statements are all at
// COVERAGE_THRESHOLD (100), and says which files fall short and where.
//
//   mise run coverage [-- playwright arguments]
//
// The reports are in coverage/ (index.html, lcov.info; raw files in
// coverage/tmp). COVERAGE_OUT=<folder> keeps parallel runs apart.
// It needs `npm ci --prefix e2e` and the browser (`mise run e2e:install`).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { c8Report, formatGaps, ROOT, readGaps } from './report.mjs';

const e2e = path.join(ROOT, 'e2e');
const dir = path.resolve(ROOT, process.env.COVERAGE_OUT ?? 'coverage');
const raw = path.join(dir, 'tmp');
const threshold = process.env.COVERAGE_THRESHOLD ?? '100';

const fail = (message) => {
  console.error(message);
  process.exit(2);
};

const limit = Number(threshold);
if (threshold.trim() === '' || !(limit >= 0 && limit <= 100))
  fail(`COVERAGE_THRESHOLD is "${threshold}": give a number from 0 to 100`);

if (!existsSync(path.join(e2e, 'node_modules/c8')))
  fail('e2e/node_modules is missing: run `mise run e2e:install` first');

// The folder is emptied, so it must be one this script made: not the
// repository or a folder around it, and empty or with the `tmp` of a run.
const up = path.relative(dir, ROOT);
const safe = up.startsWith('..') || path.isAbsolute(up);
const names = existsSync(dir) ? readdirSync(dir) : [];
if (!safe || (names.length > 0 && !names.includes('tmp')))
  fail(
    `COVERAGE_OUT is ${dir}, which is not a coverage folder: refusing to empty it`,
  );

rmSync(dir, { recursive: true, force: true });
mkdirSync(raw, { recursive: true });

const run = (label, args, { cwd = ROOT, env = {} } = {}) => {
  console.log(`\n=== ${label}`);
  const merged = { ...process.env, COVERAGE_DIR: raw, ...env };
  for (const name of Object.keys(merged))
    if (merged[name] === undefined) delete merged[name];
  const result = spawnSync(process.execPath, args, {
    cwd,
    stdio: 'inherit',
    env: merged,
  });
  return result.status ?? 1;
};

const failures = [];

// Node writes the coverage of the test files and of every process they start
// (the command lines, the servers) into NODE_V8_COVERAGE.
if (
  run('unit tests', ['--test', 'test/**/*.test.mjs'], {
    env: { NODE_V8_COVERAGE: raw },
  })
)
  failures.push('unit tests');

// Playwright's own processes are not measured (that would be Playwright's
// coverage): the site's build is, and so is every page, through COVERAGE_DIR.
const playwright = path.join(e2e, 'node_modules/@playwright/test/cli.js');
if (
  run('end-to-end tests', [playwright, 'test', ...process.argv.slice(2)], {
    cwd: e2e,
    env: { NODE_V8_COVERAGE: undefined },
  })
)
  failures.push('end-to-end tests');

console.log('\n=== coverage report');
const status = c8Report({
  raw,
  out: dir,
  reporters: ['text', 'html', 'lcov'],
  skipFull: true,
  check: threshold,
});
if (status !== 0) {
  failures.push(`coverage below ${threshold}%`);
  const gaps = formatGaps(readGaps(path.join(dir, 'lcov.info')));
  if (gaps) console.log(`\n=== what no test executed\n\n${gaps}`);
}

const relative = path.relative(ROOT, path.join(dir, 'index.html'));
console.log(
  failures.length > 0
    ? `\nFAILED: ${failures.join('; ')}\nReport: ${relative}; for the code of a file's gaps: mise exec -- node e2e/support/measure.mjs -i <file> <test files>`
    : `\nAll tests passed with ${threshold}% coverage. Report: ${relative}`,
);
process.exit(failures.length > 0 ? 1 : 0);
