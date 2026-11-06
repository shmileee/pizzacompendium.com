// The coverage of some modules by some test files, in a folder of its own that
// is removed afterwards: what to run while writing a test, many times, next
// to other people doing the same. (`mise run coverage` is the gate, with every
// test; this is the loop.)
//
//   mise exec -- node e2e/support/measure.mjs -i scripts/lib/files.mjs test/files.test.mjs
//   mise exec -- node e2e/support/measure.mjs -i 'scripts/lib/markdown/**' test/markdown/*.test.mjs
//
// `-i <glob>` (repeat it) says which code is measured, relative to the
// repository; the rest are the test files, run with `node --test`. It prints
// the c8 table and then every line, branch and function of those modules that
// no test executed, with the code that is on it, and ends with status 1 when
// there is one (or a test fails). Only the browser's part is missing: browser
// code is measured by the end-to-end tests, in `mise run coverage`.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { c8Report, formatGaps, ROOT, readGaps } from './report.mjs';

const { values, positionals: tests } = parseArgs({
  allowPositionals: true,
  options: { include: { type: 'string', short: 'i', multiple: true } },
});
if (!values.include?.length || tests.length === 0) {
  console.error(
    'usage: node e2e/support/measure.mjs -i <module glob>... <test file>...',
  );
  process.exit(2);
}

const dir = mkdtempSync(path.join(os.tmpdir(), 'pc-measure-'));
const raw = path.join(dir, 'raw');
mkdirSync(raw);
try {
  const unit = spawnSync(process.execPath, ['--test', ...tests], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, NODE_V8_COVERAGE: raw },
  });
  console.log('');
  const status = c8Report({
    raw,
    out: dir,
    include: values.include,
    reporters: ['text', 'lcov'],
  });
  const gaps = formatGaps(readGaps(path.join(dir, 'lcov.info')), {
    source: true,
  });
  if (gaps) console.log(`\nwhat no test executed:\n\n${gaps}`);
  process.exitCode = unit.status === 0 && status === 0 && !gaps ? 0 : 1;
} finally {
  rmSync(dir, { recursive: true, force: true });
}
