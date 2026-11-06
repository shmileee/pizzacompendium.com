/**
 * Diagnostics are data, not prose: `{ level, code, message, file?, line?,
 * field? }`. Codes are stable (`E_*` errors, `W_*` warnings) and are what
 * tests assert; messages are for people. A code that covers a whole family of
 * mistakes (a bad `lang.json`, a bad `rules.json`) also names the `field`, so
 * the cause can be told apart without reading the message. In strict mode a
 * warning is recorded as an error but keeps its `W_` code, so the cause stays
 * visible.
 *
 * @typedef {object} Diagnostic
 * @property {'error' | 'warning'} level
 * @property {string} code
 * @property {string} message
 * @property {string} [file] Path relative to the repository root.
 * @property {number} [line] 1-based.
 * @property {string} [field] The key or setting the problem is about.
 *
 * @typedef {{ file?: string, line?: number, field?: string }} Where
 *
 * @typedef {{ field: string, message: string }} Problem What a pure check of
 *   a configuration file found wrong.
 *
 * @typedef {ReturnType<typeof createReporter>} Reporter
 */

/**
 * @param {{ strict?: boolean }} [options]
 * @returns {{
 *   entries: Diagnostic[],
 *   error: (code: string, message: string, where?: Where) => void,
 *   warn: (code: string, message: string, where?: Where) => void,
 *   hasErrors: () => boolean,
 * }}
 */
export function createReporter({ strict = false } = {}) {
  /** @type {Diagnostic[]} */
  const entries = [];
  /**
   * @param {'error' | 'warning'} level
   * @param {string} code
   * @param {string} message
   * @param {Where} [where]
   */
  const add = (level, code, message, where) =>
    entries.push({ level, code, message, ...where });
  return {
    entries,
    error: (code, message, where) => add('error', code, message, where),
    warn: (code, message, where) =>
      add(strict ? 'error' : 'warning', code, message, where),
    hasErrors: () => entries.some((entry) => entry.level === 'error'),
  };
}

/**
 * Reports what a pure check found, one error per problem.
 *
 * @param {Reporter} reporter
 * @param {string} code
 * @param {Problem[]} problems
 * @param {string} file
 * @returns {boolean} True when there was nothing to report.
 */
export function reportProblems(reporter, code, problems, file) {
  for (const { field, message } of problems)
    reporter.error(code, message, { file, field });
  return problems.length === 0;
}

/**
 * @param {Diagnostic[]} entries
 * @returns {{ errors: number, warnings: number }}
 */
export function summarize(entries) {
  const errors = entries.filter((entry) => entry.level === 'error').length;
  return { errors, warnings: entries.length - errors };
}

/**
 * Text taken from a file may hold anything. Control and invisible formatting
 * characters (a terminal escape, a right-to-left override) are shown as
 * `\uXXXX`, so a diagnostic cannot clear the screen, retitle the window or
 * start a line of its own.
 *
 * @param {string} text
 * @returns {string}
 */
export const visible = (text) =>
  text.replace(
    /[\p{Cc}\p{Cf}]/gu,
    (char) => `\\u${char.codePointAt(0).toString(16).padStart(4, '0')}`,
  );

const place = ({ file, line }) =>
  file ? `${visible(file)}${line ? `:${line}` : ''}: ` : '';

/**
 * One human-readable line per diagnostic.
 *
 * @param {Diagnostic[]} entries
 * @returns {string[]}
 */
export function formatText(entries) {
  return entries.map(
    (entry) =>
      `${entry.level === 'error' ? 'error:   ' : 'warning: '}${place(entry)}${visible(entry.message)} [${entry.code}]`,
  );
}

// Line breaks never get here: `visible` has turned them into \uXXXX.
const escapeData = (text) => text.replace(/%/g, '%25');
const escapeProperty = (text) =>
  escapeData(text).replace(/:/g, '%3A').replace(/,/g, '%2C');

/**
 * GitHub Actions workflow commands (`::error file=...,line=...::message`),
 * which the runner turns into annotations on the changed file.
 *
 * @param {Diagnostic[]} entries
 * @returns {string[]}
 */
export function formatGithub(entries) {
  return entries.map((entry) => {
    const properties = [
      entry.file && `file=${escapeProperty(visible(entry.file))}`,
      entry.line && `line=${entry.line}`,
      `title=${escapeProperty(entry.code)}`,
    ].filter(Boolean);
    return `::${entry.level} ${properties.join(',')}::${escapeData(visible(entry.message))}`;
  });
}

/**
 * @param {Diagnostic[]} entries
 * @returns {string[]}
 */
export function formatJson(entries) {
  return [JSON.stringify(entries, null, 2)];
}

export const FORMATS = {
  text: formatText,
  github: formatGithub,
  json: formatJson,
};
