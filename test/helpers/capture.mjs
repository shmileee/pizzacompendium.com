// Reading what a reporter collected, the way the tests assert it: by the
// stable code of a diagnostic (and its level, file, line and field), never by
// the text of its message, which is for people and free to change.
//
//   const reporter = capture();                 // the real createReporter
//   loadSite({ root, reporter });
//   assert.deepEqual(codes(reporter), ['E_SITE']);
//   assert.equal(find(reporter, 'E_SITE').field, 'siteUrl');
//   assert.deepEqual(view(reporter), [
//     { level: 'error', code: 'E_SITE', file: 'site.json', field: 'siteUrl' },
//   ]);

import { createReporter } from '../../scripts/lib/diagnostics.mjs';

/**
 * A new reporter: the real `createReporter`, nothing mocked, so `strict` turns
 * a warning into an error exactly as it does in production.
 *
 * @param {{ strict?: boolean }} [options]
 */
export const capture = (options) => createReporter(options);

/** The codes of everything reported, in order. */
export const codes = (reporter) => reporter.entries.map((entry) => entry.code);

/** The codes of the errors only (in strict mode warnings are in here too). */
export const errorCodes = (reporter) =>
  reporter.entries
    .filter((entry) => entry.level === 'error')
    .map((entry) => entry.code);

/** The codes of the warnings only. */
export const warningCodes = (reporter) =>
  reporter.entries
    .filter((entry) => entry.level === 'warning')
    .map((entry) => entry.code);

/** The first diagnostic with this code, or undefined. */
export const find = (reporter, code) =>
  reporter.entries.find((entry) => entry.code === code);

/** Every diagnostic with this code. */
export const findAll = (reporter, code) =>
  reporter.entries.filter((entry) => entry.code === code);

/**
 * Everything reported, without the messages: `{ level, code, file, line,
 * field }`, a field left out when the diagnostic has none. Compare it with
 * `assert.deepEqual` to say exactly what must be reported and where.
 */
export const view = (reporter) =>
  reporter.entries.map(({ level, code, file, line, field }) => ({
    level,
    code,
    ...(file !== undefined && { file }),
    ...(line !== undefined && { line }),
    ...(field !== undefined && { field }),
  }));
