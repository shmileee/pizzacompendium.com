import nodeFs from 'node:fs';
import path from 'node:path';

/**
 * The most a text file of the project may hold. The longest section is about
 * 35 KB; a file this large is a mistake or an attack, and is refused before
 * it is read.
 */
export const MAX_TEXT_BYTES = 1024 * 1024;

/** @param {unknown} value */
export const isObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * Orders directory entries by name, so that every machine sees the same order
 * (a disk lists them in whatever order it likes).
 *
 * @param {{ name: string }} a
 * @param {{ name: string }} b
 * @returns {number}
 */
export const byName = (a, b) => (a.name > b.name) - (a.name < b.name);

/**
 * Text as the rest of the generator sees it: no byte-order mark (Windows
 * editors add one), `\n` line endings, and composed letters (NFC: `ń` is one
 * character, never `n` and a combining accent), so that a content rule that
 * names a word finds it however the editor stored it.
 *
 * @param {string} text
 * @returns {string}
 */
export const normalise = (text) =>
  text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').normalize('NFC');

const UTF8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

/**
 * Does something exist at `file`? A symbolic link counts, even one that
 * points nowhere: it is found and refused, never written through.
 *
 * @param {typeof nodeFs} fs
 * @param {string} file
 * @returns {boolean}
 */
export function exists(fs, file) {
  try {
    fs.lstatSync(file);
    return true;
  } catch {
    return false;
  }
}

/**
 * The one place a file is read as text. Only a regular file of a sensible
 * size, in valid UTF-8, is read: a symbolic link (it could point at a device
 * that never ends, or at a file outside the project), a folder or a pipe is
 * not. A failure becomes a diagnostic.
 *
 * @param {object} options
 * @param {typeof nodeFs} [options.fs]
 * @param {string} options.root Repository root.
 * @param {string} options.rel Path relative to the root, with `/`.
 * @param {import('./diagnostics.mjs').Reporter} options.reporter
 * @returns {string | null} The normalised text, or null after reporting.
 */
export function readText({ fs = nodeFs, root, rel, reporter }) {
  const file = path.join(root, rel);
  const fail = (code, message) => {
    reporter.error(code, message, { file: rel });
    return null;
  };
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile())
      return fail(
        'E_NOT_REGULAR',
        'not a regular file (symbolic links, folders and devices are not allowed)',
      );
    if (stat.size > MAX_TEXT_BYTES)
      return fail('E_TOO_LARGE', `larger than ${MAX_TEXT_BYTES} bytes`);
    return normalise(UTF8.decode(fs.readFileSync(file)));
  } catch (error) {
    return error.code === 'ERR_ENCODING_INVALID_ENCODED_DATA'
      ? fail('E_ENCODING', 'not valid UTF-8')
      : fail('E_READ', `cannot read: ${error.code}`);
  }
}

/**
 * @param {Parameters<typeof readText>[0]} options
 * @returns {any} The parsed JSON (which may be `null`), or `undefined` after
 *   reporting.
 */
export function readJson(options) {
  const text = readText(options);
  if (text === null) return undefined;
  try {
    return JSON.parse(text);
  } catch (error) {
    options.reporter.error(
      'E_JSON',
      `${options.rel} is not valid JSON: ${error.message}`,
      { file: options.rel },
    );
    return undefined;
  }
}

/**
 * Directory entries, sorted by name. The folder itself must not be a symbolic
 * link (its entries are checked one by one by whoever walks them).
 *
 * @param {Omit<Parameters<typeof readText>[0], 'rel'> & { rel: string }} options
 * @returns {import('node:fs').Dirent[] | null} Null after reporting.
 */
export function readDir({ fs = nodeFs, root, rel, reporter }) {
  const dir = path.join(root, rel);
  try {
    if (fs.lstatSync(dir).isSymbolicLink()) {
      reporter.error('E_SYMLINK', 'symbolic links are not allowed', {
        file: rel,
      });
      return null;
    }
    return fs.readdirSync(dir, { withFileTypes: true }).sort(byName);
  } catch (error) {
    reporter.error('E_READ', `cannot list ${rel}: ${error.code}`, {
      file: rel,
    });
    return null;
  }
}
