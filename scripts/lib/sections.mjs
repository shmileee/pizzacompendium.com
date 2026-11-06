import nodeFs from 'node:fs';
import { readDir, readText } from './files.mjs';

/** Section files are `NN-name.md`: the number orders them. */
const SECTION = /^\d\d-[a-z0-9-]+\.md$/;
/** What an author means as a section, however it is spelled. */
const LOOKS_LIKE_SECTION = /^\d\d-|\.(?:md|markdown)$/i;

/**
 * The longest line a section may have. `marked` takes time in proportion to
 * the square of a line that is full of emphasis or `!` marks (20,000
 * characters take a quarter of a second, 200,000 a quarter of a minute), and
 * the longest paragraph of the guide is under a thousand characters.
 */
export const MAX_LINE_LENGTH = 10000;

/**
 * @typedef {object} Section
 * @property {string} file `01-types.md`
 * @property {string} path `content/en/01-types.md` (the file shown to people)
 * @property {string} text Normalised text.
 * @property {boolean} fallback True when `en` has no such file and this is
 *   the source language's text.
 *
 * @typedef {object} LanguageContent
 * @property {Section[]} sections One per source file, in order.
 * @property {string[]} extra Files this language has and the source lacks.
 */

/**
 * The section files of a language folder, in reading order. Anything that
 * looks like a section (it starts with two digits and a hyphen, or ends in
 * `.md` or `.markdown`, in any case) but is not a regular `NN-name.md` file
 * is an error: it would otherwise be left out of the page without a word (a
 * `README.md` would be published, `._01-x.md` is macOS junk, `01-x.md.bak` and
 * `01-x.md~` are leftovers that someone may commit). `lang.json`, `.sync.json`
 * and any other file that does not look like a section are none of our
 * business.
 *
 * @param {object} options
 * @param {typeof nodeFs} [options.fs]
 * @param {string} options.root
 * @param {string} options.folder `content/<code>`
 * @param {import('./diagnostics.mjs').Reporter} options.reporter
 * @returns {string[]} Empty when the folder cannot be read (reported).
 */
export function listSections({ fs, root, folder, reporter }) {
  const files = [];
  for (const entry of readDir({ fs, root, rel: folder, reporter }) ?? []) {
    if (!LOOKS_LIKE_SECTION.test(entry.name)) continue;
    if (entry.isFile() && SECTION.test(entry.name)) {
      files.push(entry.name);
    } else {
      reporter.error(
        'E_SECTION_NAME',
        `${entry.name} must be a regular file named NN-name.md (digits, lower-case letters and hyphens)`,
        { file: `${folder}/${entry.name}` },
      );
    }
  }
  return files;
}

/**
 * Reads the text of every language. A published translation that lacks a
 * file shows the source text instead (and a warning), so a language can go
 * live section by section; a draft stays quiet.
 *
 * @param {object} options
 * @param {typeof nodeFs} [options.fs]
 * @param {string} options.root
 * @param {import('./languages.mjs').Language[]} options.languages
 * @param {import('./diagnostics.mjs').Reporter} options.reporter
 * @returns {Map<string, LanguageContent> | null} Null when anything could
 *   not be read.
 */
export function loadSections({ fs = nodeFs, root, languages, reporter }) {
  const source = languages.find((language) => language.source);
  const names = new Map();
  for (const language of languages) {
    names.set(
      language.code,
      listSections({ fs, root, folder: language.folder, reporter }),
    );
  }
  const texts = new Map();
  let unreadable = false;
  const read = (language, file) => {
    const rel = `${language.folder}/${file}`;
    if (!texts.has(rel)) {
      let text = readText({ fs, root, rel, reporter });
      const long = text
        ?.split('\n')
        .findIndex((line) => line.length > MAX_LINE_LENGTH);
      if (long >= 0) {
        reporter.error(
          'E_LINE_TOO_LONG',
          `a line of more than ${MAX_LINE_LENGTH} characters`,
          { file: rel, line: long + 1 },
        );
        text = null;
      }
      if (text === null) unreadable = true;
      texts.set(rel, text);
    }
    return texts.get(rel);
  };

  const content = new Map();
  for (const language of languages) {
    const own = names.get(language.code);
    const sections = [];
    for (const file of names.get(source.code)) {
      const fallback = !own.includes(file);
      const from = fallback ? source : language;
      sections.push({
        file,
        path: `${from.folder}/${file}`,
        text: read(from, file),
        fallback,
      });
      if (fallback && language.status === 'published')
        reporter.warn(
          'W_FALLBACK',
          `not translated yet, showing the ${source.code} text`,
          { file: `${language.folder}/${file}` },
        );
    }
    const extra = own.filter((file) => !names.get(source.code).includes(file));
    if (language.status === 'published')
      for (const file of extra)
        reporter.warn(
          'W_EXTRA_FILE',
          `not present in the source language, ignored`,
          { file: `${language.folder}/${file}` },
        );
    content.set(language.code, { sections, extra });
  }
  return unreadable ? null : content;
}
