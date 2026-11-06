// What coverage.mjs (every test, the 100 % gate) and measure.mjs (some modules,
// some tests, while a test is being written) share: the c8 report over the V8
// coverage that Node and the browser left in one folder, and the list of
// what no test executed.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

export const ROOT = path.resolve(import.meta.dirname, '../..');
const C8 = path.join(ROOT, 'e2e/node_modules/c8/bin/c8.js');

/** What is measured: the generator and its command lines, and the scripts of the browser. */
export const INCLUDE = ['scripts/**', 'src/**/*.js'];
/** What never is, even where it matches an include. Nothing else is excluded. */
export const EXCLUDE = ['test/**', 'e2e/**', 'tools/**', 'node_modules/**'];

/**
 * Runs `c8 report` on the coverage in `raw`. Files that no test loaded are
 * in it with no coverage (`--all`), so a module nobody tests is a gap, not an
 * absence.
 *
 * @param {object} options
 * @param {string} options.raw The folder of V8 coverage files.
 * @param {string} options.out Where the reports go.
 * @param {string[]} [options.include] Globs relative to the repository.
 * @param {string[]} [options.reporters] c8 / istanbul reporters.
 * @param {boolean} [options.skipFull] Leave the files at 100 % out of the
 *   text table.
 * @param {string | null} [options.check] A percentage that lines, branches,
 *   functions and statements must each reach, or the status is not 0.
 * @returns {number} The exit status of c8.
 */
export function c8Report({
  raw,
  out,
  include = INCLUDE,
  reporters = ['text'],
  skipFull = false,
  check = null,
}) {
  const args = [
    C8,
    'report',
    ...['--temp-directory', raw, '--reports-dir', out],
    ...reporters.flatMap((reporter) => ['--reporter', reporter]),
    ...['--all', '--src', 'scripts', '--src', 'src'],
    ...include.flatMap((glob) => ['--include', glob]),
    ...EXCLUDE.flatMap((glob) => ['--exclude', glob]),
  ];
  if (skipFull) args.push('--skip-full');
  if (check !== null)
    args.push(
      '--check-coverage',
      ...['--lines', check, '--functions', check],
      ...['--branches', check, '--statements', check],
    );
  return (
    spawnSync(process.execPath, args, { cwd: ROOT, stdio: 'inherit' }).status ??
    1
  );
}

/**
 * @typedef {object} Gap What no test executed in one file.
 * @property {string} file Relative to the repository.
 * @property {number} total Lines of code.
 * @property {number[]} lines Lines never run.
 * @property {number[]} branches The lines of branches never taken.
 * @property {{ name: string, line: number }[]} functions Functions never called.
 */

/**
 * The gaps in an lcov file (which c8 writes with the `lcov` reporter).
 *
 * @param {string} lcovFile
 * @returns {Gap[]} Only the files that have a gap, in the order of the file.
 */
export function readGaps(lcovFile) {
  const gaps = [];
  for (const record of readFileSync(lcovFile, 'utf8').split('end_of_record')) {
    const file = /^SF:(.+)$/m.exec(record)?.[1];
    if (!file) continue;
    const numbers = (pattern) =>
      [...record.matchAll(pattern)].map((match) => Number(match[1]));
    const declared = new Map(
      [...record.matchAll(/^FN:(\d+),(.+)$/gm)].map(([, line, name]) => [
        name,
        Number(line),
      ]),
    );
    const gap = {
      file: path.isAbsolute(file) ? path.relative(ROOT, file) : file,
      total: Number(/^LF:(\d+)$/m.exec(record)?.[1] ?? 0),
      lines: numbers(/^DA:(\d+),0$/gm),
      branches: numbers(/^BRDA:(\d+),\d+,\d+,(?:-|0)$/gm),
      functions: [...record.matchAll(/^FNDA:0,(.+)$/gm)].map(([, name]) => ({
        name,
        line: declared.get(name),
      })),
    };
    if (gap.lines.length + gap.branches.length + gap.functions.length > 0)
      gaps.push(gap);
  }
  return gaps;
}

/** `[3, 4, 5, 9]` as `3-5, 9`. */
export function ranges(numbers) {
  const spans = [];
  for (const n of [...new Set(numbers)].sort((a, b) => a - b)) {
    const last = spans.at(-1);
    if (last && n === last[1] + 1) last[1] = n;
    else spans.push([n, n]);
  }
  return spans
    .map(([from, to]) => (from === to ? from : `${from}-${to}`))
    .join(', ');
}

/**
 * The gaps as text, one block per file.
 *
 * @param {Gap[]} gaps
 * @param {{ source?: boolean }} [options] With `source`, every gap on a line
 *   of its own with the code that is on it.
 * @returns {string}
 */
export function formatGaps(gaps, { source = false } = {}) {
  const out = [];
  for (const gap of gaps) {
    if (gap.total > 0 && gap.lines.length === gap.total) {
      out.push(
        `${gap.file}: never executed (${gap.total} lines): no test loads it`,
      );
      continue;
    }
    out.push(gap.file);
    const text = source
      ? readFileSync(path.join(ROOT, gap.file), 'utf8').split('\n')
      : [];
    const show = (line) =>
      `${String(line).padStart(5)}  ${text[line - 1]?.trim().slice(0, 100)}`;
    const kinds = [
      ['lines', 'line', gap.lines, (n) => n],
      ['branches', 'branch', gap.branches, (n) => n],
      ['functions', 'function', gap.functions, (f) => f.line],
    ];
    for (const [plural, singular, list, lineOf] of kinds) {
      if (list.length === 0) continue;
      if (!source) {
        const names =
          plural === 'functions'
            ? ` (${list.map((f) => f.name).join(', ')})`
            : '';
        out.push(`  ${plural.padEnd(10)}${ranges(list.map(lineOf))}${names}`);
        continue;
      }
      for (const item of list)
        out.push(
          `  ${singular.padEnd(9)} ${show(lineOf(item))}${plural === 'functions' ? `   (${item.name})` : ''}`,
        );
    }
  }
  return out.join('\n');
}
