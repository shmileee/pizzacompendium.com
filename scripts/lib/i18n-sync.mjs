import { createHash } from 'node:crypto';
import nodeFs from 'node:fs';
import path from 'node:path';
import { exists, isObject, readJson } from './files.mjs';
import { withoutLocalBlocks } from './parity.mjs';
import { loadProject } from './project.mjs';

// Dependency-free, like the content linter.

/** `content/<code>/.sync.json`: section file -> hash of the source text. */
const SYNC_FILE = '.sync.json';

/**
 * What a translation is checked against: the source text without its
 * `::: local` blocks, which are notes for the source's own country and never
 * have a counterpart in another language. Spaces at the end of a line and
 * blank lines at the end of the file do not count: the commit hook trims
 * them, and that is no reason to ask for a translation to be confirmed again.
 *
 * @param {string} text Normalised source text.
 * @returns {string} Hex sha256.
 */
export const hashText = (text) =>
  createHash('sha256')
    .update(
      withoutLocalBlocks(text)
        .split('\n')
        .map((line) => line.trimEnd())
        .join('\n')
        .trimEnd(),
      'utf8',
    )
    .digest('hex');

/**
 * What a translator has confirmed: for each file, the hash of the source
 * text it was last brought in line with (`mise run i18n:sync`). A file with
 * no entry has never been confirmed and is never reported as stale.
 *
 * @param {object} options
 * @param {typeof nodeFs} [options.fs]
 * @param {string} options.root
 * @param {import('./languages.mjs').Language} options.language
 * @param {import('./diagnostics.mjs').Reporter} options.reporter
 * @returns {Map<string, string>}
 */
export function loadSync({ fs = nodeFs, root, language, reporter }) {
  const rel = `${language.folder}/${SYNC_FILE}`;
  if (!exists(fs, path.join(root, rel))) return new Map();
  const data = readJson({ fs, root, rel, reporter });
  if (data === undefined) return new Map();
  const valid =
    isObject(data) &&
    Object.values(data).every((hash) => /^[0-9a-f]{64}$/.test(hash));
  if (!valid) {
    reporter.error('E_SYNC', `${rel} must map file names to sha256 hashes`, {
      file: rel,
    });
    return new Map();
  }
  return new Map(Object.entries(data));
}

/**
 * @typedef {'ok' | 'stale' | 'untranslated' | 'missing' | 'extra'} State
 *
 *   ok            translated, and the source has not changed since it was
 *                 last confirmed (or it was never confirmed)
 *   stale         the source changed after the last confirmation
 *   untranslated  byte for byte the source text (or, if the source has
 *                 local blocks, the source text without them)
 *   missing       there is no file (the page shows the source text)
 *   extra         the source has no such file
 */

/**
 * The state of every section of a translation.
 *
 * @param {object} options
 * @param {import('./languages.mjs').Language} options.language
 * @param {import('./languages.mjs').Language} options.source
 * @param {Map<string, import('./sections.mjs').LanguageContent>} options.content
 * @param {Map<string, string>} options.sync
 * @returns {{ file: string, state: State }[]}
 */
export function sectionStates({ language, source, content, sync }) {
  const own = content.get(language.code);
  const rows = content.get(source.code).sections.map((original) => {
    const mine = own.sections.find((section) => section.file === original.file);
    const recorded = sync.get(original.file);
    /** @type {State} */
    let state = 'ok';
    if (mine.fallback) state = 'missing';
    else if (
      mine.text === original.text ||
      mine.text === withoutLocalBlocks(original.text)
    )
      state = 'untranslated';
    else if (recorded && recorded !== hashText(original.text)) state = 'stale';
    return { file: original.file, state };
  });
  return [...rows, ...own.extra.map((file) => ({ file, state: 'extra' }))];
}

/**
 * The warnings the build gives for published translations (a draft is
 * allowed to be unfinished). Missing and extra files are reported when the
 * content is loaded.
 *
 * @param {object} options
 * @param {typeof nodeFs} [options.fs]
 * @param {string} options.root
 * @param {import('./languages.mjs').Language[]} options.languages
 * @param {Map<string, import('./sections.mjs').LanguageContent>} options.content
 * @param {import('./diagnostics.mjs').Reporter} options.reporter
 * @returns {void}
 */
export function warnAboutTranslations({
  fs,
  root,
  languages,
  content,
  reporter,
}) {
  const source = languages.find((language) => language.source);
  for (const language of languages) {
    if (language.source || language.status !== 'published') continue;
    const sync = loadSync({ fs, root, language, reporter });
    for (const { file, state } of sectionStates({
      language,
      source,
      content,
      sync,
    })) {
      const where = { file: `${language.folder}/${file}` };
      if (state === 'untranslated')
        reporter.warn(
          'W_UNTRANSLATED_COPY',
          `identical to the ${source.code} file: not translated yet?`,
          where,
        );
      else if (state === 'stale')
        reporter.warn(
          'W_STALE',
          `the ${source.code} text changed since this file was last confirmed; update it, then run: mise run i18n:sync ${language.code} ${file}`,
          where,
        );
    }
  }
}

/**
 * Records that the given files are in line with the current source text.
 * Files that are missing or untranslated cannot be confirmed and are
 * skipped. Entries for files the source no longer has are dropped.
 *
 * @param {object} options
 * @param {typeof nodeFs} [options.fs]
 * @param {string} options.root
 * @param {import('./languages.mjs').Language} options.language
 * @param {import('./languages.mjs').Language} options.source
 * @param {Map<string, import('./sections.mjs').LanguageContent>} options.content
 * @param {string[]} options.files Section file names; empty means all.
 * @param {import('./diagnostics.mjs').Reporter} options.reporter
 * @returns {{ recorded: string[], skipped: { file: string, state: State }[] } | null}
 *   Null after reporting.
 */
export function recordSync({
  fs = nodeFs,
  root,
  language,
  source,
  content,
  files,
  reporter,
}) {
  const sync = loadSync({ fs, root, language, reporter });
  const states = sectionStates({ language, source, content, sync }).filter(
    (row) => row.state !== 'extra',
  );
  const unknown = files.filter(
    (file) => !states.some((row) => row.file === file),
  );
  for (const file of unknown)
    reporter.error(
      'E_SYNC_FILE',
      `${file} is not a section of the source language`,
      {
        file: language.folder,
      },
    );
  if (unknown.length > 0 || reporter.hasErrors()) return null;

  const chosen = states.filter(
    (row) => files.length === 0 || files.includes(row.file),
  );
  const recorded = chosen.filter(
    (row) => row.state === 'ok' || row.state === 'stale',
  );
  const hashes = new Map(states.map((row) => [row.file, sync.get(row.file)]));
  for (const { file } of recorded)
    hashes.set(
      file,
      hashText(
        content.get(source.code).sections.find((s) => s.file === file).text,
      ),
    );
  try {
    fs.writeFileSync(
      path.join(root, language.folder, SYNC_FILE),
      // A file with no hash (never confirmed) is left out by JSON.stringify.
      `${JSON.stringify(Object.fromEntries(hashes), null, 2)}\n`,
    );
  } catch (error) {
    reporter.error('E_WRITE', `cannot write ${SYNC_FILE}: ${error.code}`, {
      file: `${language.folder}/${SYNC_FILE}`,
    });
    return null;
  }
  return {
    recorded: recorded.map((row) => row.file),
    skipped: chosen.filter((row) => !recorded.includes(row)),
  };
}

/**
 * The table `i18n status` prints: one block per translation.
 *
 * @param {{ language: import('./languages.mjs').Language, rows: { file: string, state: State }[] }[]} tables
 * @returns {string[]}
 */
export function formatStatus(tables) {
  const lines = [];
  for (const { language, rows } of tables) {
    const counts = {};
    for (const { state } of rows) counts[state] = (counts[state] ?? 0) + 1;
    const summary = Object.entries(counts)
      .map(([state, count]) => `${count} ${state}`)
      .join(', ');
    lines.push(`${language.code} (${language.status}): ${summary}`);
    const width = Math.max(...rows.map((row) => row.file.length));
    for (const { file, state } of rows)
      lines.push(`  ${file.padEnd(width)}  ${state}`);
  }
  return lines;
}

/**
 * `mise run i18n:status`.
 *
 * @param {object} options
 * @param {typeof nodeFs} [options.fs]
 * @param {string} options.root
 * @param {import('./diagnostics.mjs').Reporter} options.reporter
 * @returns {string[] | null} The lines to print, or null after reporting.
 */
export function status({ fs, root, reporter }) {
  const project = loadProject({ fs, root, reporter });
  if (!project) return null;
  const { languages, source, content } = project;
  return formatStatus(
    languages
      .filter((language) => !language.source)
      .map((language) => ({
        language,
        rows: sectionStates({
          language,
          source,
          content,
          sync: loadSync({ fs, root, language, reporter }),
        }),
      })),
  );
}

/**
 * `mise run i18n:sync <code> [files...]`.
 *
 * @param {object} options
 * @param {typeof nodeFs} [options.fs]
 * @param {string} options.root
 * @param {import('./diagnostics.mjs').Reporter} options.reporter
 * @param {string} options.code
 * @param {string[]} options.files
 * @returns {string[] | null} The lines to print, or null after reporting.
 */
export function sync({ fs, root, reporter, code, files }) {
  const project = loadProject({ fs, root, reporter });
  if (!project) return null;
  const { languages, source, content } = project;
  const language = languages.find((candidate) => candidate.code === code);
  if (!language || language.source) {
    reporter.error('E_SYNC_LANG', `${code} is not a translation`, {
      file: 'content',
    });
    return null;
  }
  const done = recordSync({
    fs,
    root,
    language,
    source,
    content,
    files,
    reporter,
  });
  if (!done) return null;
  return [
    `${code}: confirmed ${done.recorded.length} file(s) against the current ${source.code} text`,
    ...done.skipped.map(
      (row) => `  skipped ${row.file}: ${row.state} (nothing to confirm)`,
    ),
  ];
}
