// Throwaway folders for tests, and on top of them a throwaway compendium: the
// smallest site the generator accepts, which builds without a single
// diagnostic, in the system temp folder. Every call makes a new folder, so
// tests share nothing and can run in any order and in parallel; `cleanup()`
// (or `withRepo`, which always calls it) removes it.
//
//   await withRepo(async (repo) => {
//     repo.write('content/en/01-intro.md', '## Intro {#intro}\n\nHello.\n');
//     repo.editJson('content/en/lang.json', (lang) => { lang.dir = 'rtl'; });
//     const { ok, reporter } = repo.build({ strict: true });
//     assert.deepEqual(codes(reporter), []);
//   });
//
// What the default compendium holds (`createRepo()`):
//
//   site.json                       siteUrl and ogImage
//   content/rules.json              a small copy of the real rules (see below)
//   content/pl/lang.json            the source language, one section:
//   content/pl/01-intro.md          three headings: {#intro}, and {#quick-start}, {#faq} that the hero points to
//   content/en/lang.json            a published translation, one section:
//   content/en/01-intro.md          the same structure, different words
//   static/img/og.webp              the preview image, 1200 x 630
//   static/img/hero*.webp, static/*.png   what the page templates name: the
//                                   photographs of the hero, the icons of the
//                                   page head and of the manifest (see
//                                   `templateFiles`)
//   src/app.js, src/favicon.svg, src/css/00-test.css
//
// It never reads the real content/, src/ or static/ (the one exception is
// named in `uiKeys`). The rules are a small copy, not the real
// content/rules.json, on purpose: a rule added to the real file for the
// authors must not break the tests of the engine, and the engine tests need
// rules whose behaviour they know by heart. A test that is about the real
// rules reads them itself (REAL_ROOT) and passes them in as an override, and
// one that is about the real content as a whole bends a copy of it
// (`createRealRepo()`: the real content/, static/, src/ and site.json in a
// temp folder, with the same methods).

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { imageSize } from 'image-size';
import { build } from '../../scripts/lib/build.mjs';
import * as inlineScripts from '../../scripts/lib/inline-scripts.mjs';
import { checkLanguage } from '../../scripts/lib/languages.mjs';

/** The real repository, for the few tests that are about the real files. */
export const REAL_ROOT = path.resolve(import.meta.dirname, '../..');

/** The code of the source language of the default compendium. */
export const SOURCE = 'pl';

/** The section file every language of the default compendium has. */
export const SECTION = '01-intro.md';

const le32 = (value) => {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32LE(value);
  return bytes;
};

/**
 * A valid, decodable WebP of any size: 34 bytes. A lossless WebP whose pixels
 * are all one colour has no pixel data to speak of, so only the 28 bits of
 * the header that carry the size change from one image to another.
 *
 * @param {number} [width] 1 to 16384.
 * @param {number} [height] 1 to 16384.
 * @returns {Buffer}
 */
export function webp(width = 1, height = 1) {
  for (const size of [width, height])
    if (!Number.isInteger(size) || size < 1 || size > 16384)
      throw new RangeError(`a WebP side is 1 to 16384, not ${size}`);
  // The VP8L chunk of the smallest WebP there is (one transparent pixel).
  const chunk = Buffer.from('2f00000010071011118888fe0700', 'hex');
  chunk.writeUInt32LE(
    ((width - 1) | ((height - 1) << 14) | (1 << 28)) >>> 0,
    1,
  );
  const body = Buffer.concat([
    Buffer.from('WEBPVP8L'),
    le32(chunk.length),
    chunk,
  ]);
  return Buffer.concat([Buffer.from('RIFF'), le32(body.length), body]);
}

// ---------------------------------------------------------------------------
// The files of the default compendium

const NAMES = { pl: 'Polski', en: 'English' };
const ORDERS = { pl: 1, en: 2 };
const TITLES = { pl: 'Kompendium pizzy', en: 'Pizza Compendium' };
const DESCRIPTIONS = {
  pl: 'Krótki przewodnik po robieniu pizzy w domu.',
  en: 'A short guide to making pizza at home.',
};
const INTROS = {
  pl: '## Wprowadzenie {#intro}\n\nKrótki tekst o pizzy.\n\n## Szybki start {#quick-start}\n\nPierwszy krok.\n\n## FAQ {#faq}\n\nPytanie.\n',
  en: '## Introduction {#intro}\n\nA short text about pizza.\n\n## Quick start {#quick-start}\n\nThe first step.\n\n## FAQ {#faq}\n\nA question.\n',
};

/**
 * The `ui` keys every language of the default compendium defines: the ones
 * the generator requires of a source language (asked of `checkLanguage`
 * itself, so a newly required key is picked up without a change here) and
 * the ones the real source language defines (the templates read them, and the
 * one place the helpers look at the real content: the names of the keys,
 * never their text; a file that cannot be read adds none).
 *
 * @param {string} [realLang] The `lang.json` to take the names from.
 * @returns {string[]}
 */
export function uiKeys(
  realLang = path.join(REAL_ROOT, 'content', SOURCE, 'lang.json'),
) {
  const required = checkLanguage(SOURCE, {
    code: SOURCE,
    name: 'x',
    htmlLang: SOURCE,
    title: 'x',
    description: 'x',
    source: true,
    ui: {},
  })
    .problems.filter(({ field }) => field.startsWith('ui.'))
    .map(({ field }) => field.slice('ui.'.length));
  let real = [];
  try {
    real = Object.keys(JSON.parse(fs.readFileSync(realLang, 'utf8')).ui ?? {});
  } catch {
    // Being edited, or not there: the required keys are enough for a build.
  }
  return [...new Set([...required, ...real])];
}

const UI_KEYS = uiKeys();

/** A string for a ui key that the generator accepts (it checks some). */
function uiText(key, code) {
  if (key === 'shortName') return `Pizza ${code}`;
  if (key === 'filterStatus') return `{shown} / {total} (${code})`;
  return `${key} (${code})`;
}

/**
 * The `lang.json` of a language of the default compendium, as an object. A
 * field in `patch` replaces the default (`ui` is merged key by key); a field
 * set to `undefined` is left out of the file. Languages other than `pl` and
 * `en` get a name, a title and a description made from the code.
 *
 * @param {string} code
 * @param {Record<string, any>} [patch]
 * @returns {Record<string, any>} A new object every time.
 */
export function langJson(code, patch = {}) {
  const { ui, ...rest } = patch;
  return {
    code,
    name: NAMES[code] ?? `Language ${code}`,
    htmlLang: code,
    ...(ORDERS[code] && { order: ORDERS[code] }),
    ...(code === SOURCE && { source: true }),
    title: TITLES[code] ?? `Pizza Compendium (${code})`,
    description: DESCRIPTIONS[code] ?? `A short guide to pizza (${code}).`,
    ui: {
      ...Object.fromEntries(UI_KEYS.map((key) => [key, uiText(key, code)])),
      ...ui,
    },
    ...rest,
  };
}

/**
 * The text of `01-intro.md` in a language: a heading with the id `intro` and
 * a paragraph, in different words for each language (so that no translation
 * is an untranslated copy of the source).
 *
 * @param {string} code
 * @returns {string}
 */
export const introText = (code) =>
  INTROS[code] ??
  `## Intro ${code} {#intro}\n\nA short text about pizza (${code}).\n\n## Quick start ${code} {#quick-start}\n\nThe first step.\n\n## FAQ ${code} {#faq}\n\nA question.\n`;

/**
 * A small set of rules shaped like the real `content/rules.json`: two views
 * (one built on the other), error and warning rules, rules limited to a
 * language, exempt in local blocks, with `skip`, `allow` and flags.
 *
 * @returns {Record<string, any>} A new object every time.
 */
export function rulesJson() {
  return {
    views: {
      'no-ids': [{ replace: '\\{#[\\w-]+\\}', with: '' }],
      prose: ['no-ids', { replace: '\\]\\(#[\\w-]+\\)', with: '](#)' }],
    },
    rules: [
      {
        id: 'exclamation-chain',
        level: 'error',
        message: 'no chains of exclamation marks',
        patterns: ['!!'],
      },
      {
        id: 'external-link',
        level: 'error',
        message: 'no outside links',
        patterns: ['\\]\\((https?:|mailto:)', 'https?://'],
        flags: 'i',
      },
      {
        id: 'country-remark',
        level: 'error',
        message: 'shared text is country-neutral',
        patterns: ['\\b(?:Poland|Polish)\\b'],
        localExempt: true,
      },
      {
        id: 'uk-ascii-apostrophe',
        level: 'error',
        message: 'in Ukrainian the apostrophe is U+2019',
        patterns: ["(?<=[А-Яа-яІіЇїЄє])'(?=[А-Яа-яІіЇїЄє])"],
        languages: ['uk'],
      },
      {
        id: 'en-american-spelling',
        level: 'warning',
        message: 'British spelling in English',
        patterns: ['\\b(flavor|color)\\b'],
        flags: 'i',
        languages: ['en'],
      },
      {
        id: 'all-caps-word',
        level: 'warning',
        message: 'no ALL-CAPS words',
        patterns: ['(?<![\\w#-])[A-Z]{4,}(?![\\w-])'],
        view: 'prose',
        allow: ['FAQ', 'HTML'],
      },
      {
        id: 'exclamation-mark',
        level: 'warning',
        message: 'avoid exclamation marks',
        patterns: ['!(?!\\[)'],
        skip: '^!\\[',
      },
    ],
  };
}

/** The entry script: it defines every storage key the inline scripts use. */
const appScript = () =>
  `${Object.entries(inlineScripts)
    .filter(([name]) => name.endsWith('_KEY'))
    .map(([name, value]) => `export const ${name} = '${value}';`)
    .join('\n')}\n`;

/** A PNG of one transparent pixel: what the icons of `static/` are here. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * The files of `static/` that the page templates name, and that the build
 * reports missing when they are not there: the photographs of the hero and
 * the icons of the page head and of the web app manifest. The names come from
 * the templates (every `HERO_*` export of hero.mjs that is an `img/` path, and
 * `STATIC_ICONS` of head.mjs) and are, besides, the names they had when this
 * was written: the templates are free to change, and the compendium that every
 * test starts from has to keep building. A template that wants more than this
 * fails the first test of helpers.test.mjs, and this is the place to add it.
 *
 * @returns {Promise<Map<string, Buffer>>}
 */
async function templateFiles() {
  const images = new Set(['img/hero.webp', 'img/hero-mobile.webp']);
  const icons = new Set([
    'favicon-32.png',
    'apple-touch-icon.png',
    'icon-192.png',
    'icon-512.png',
    'icon-maskable-512.png',
  ]);
  const templates = '../../scripts/lib/html';
  const hero = await import(`${templates}/hero.mjs`).catch(() => ({}));
  for (const [name, value] of Object.entries(hero))
    if (name.startsWith('HERO_') && /^img\//.test(value)) images.add(value);
  const head = await import(`${templates}/head.mjs`).catch(() => ({}));
  for (const icon of head.STATIC_ICONS ?? []) icons.add(icon);
  return new Map([
    ...[...images].map((href) => [`static/${href}`, webp(1600, 840)]),
    ...[...icons].map((icon) => [`static/${icon}`, PNG]),
  ]);
}

const TEMPLATE_FILES = await templateFiles();

/** @returns {Map<string, string | Buffer | object>} A new map every time. */
function defaultFiles() {
  return new Map([
    ['site.json', { siteUrl: 'https://pizza.example', ogImage: 'img/og.webp' }],
    ['content/rules.json', rulesJson()],
    [`content/pl/lang.json`, langJson('pl')],
    [`content/pl/${SECTION}`, introText('pl')],
    [`content/en/lang.json`, langJson('en')],
    [`content/en/${SECTION}`, introText('en')],
    ['static/img/og.webp', webp(1200, 630)],
    ...TEMPLATE_FILES,
    ['src/app.js', appScript()],
    [
      'src/favicon.svg',
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1"/></svg>\n',
    ],
    [
      'src/css/00-test.css',
      // The build checks that the stylesheet spells the hero's breakpoints.
      'body {\n  margin: 0;\n}\n@media (width > 640px) {\n  body {\n    margin: 0;\n  }\n}\n@media (width >= 960px) {\n  body {\n    margin: 0;\n  }\n}\n',
    ],
  ]);
}

// ---------------------------------------------------------------------------
// Folders

/**
 * @typedef {object} Tree An empty folder in the system temp folder.
 * @property {string} root Absolute, with symbolic links resolved (on macOS
 *   `/var` is a link to `/private/var`, and paths that are compared must agree).
 * @property {(rel: string) => string} path The absolute path of `rel` (a path
 *   with `/`); it throws when `rel` leads out of the folder.
 * @property {(rel: string, data: string | Uint8Array | object) => string} write
 *   Creates the folders on the way. Text and bytes are written as they are,
 *   anything else as JSON (two spaces, a final newline). Returns the path.
 * @property {(rel: string) => string} read The file as UTF-8 text.
 * @property {(rel: string) => any} readJson
 * @property {(rel: string) => boolean} exists True for a link that points at
 *   nothing too, as for the generator.
 * @property {(rel: string) => void} remove A file or a whole folder; no error
 *   when it is not there.
 * @property {(rel?: string) => string[]} list Every file below `rel`, as
 *   sorted paths relative to it.
 * @property {(rel: string, target: string) => string} symlink A symbolic link
 *   at `rel` that points at `target` (as `fs.symlinkSync` takes it).
 * @property {(rel: string, change: (text: string) => string) => void} edit
 * @property {(rel: string, change: (data: any) => any) => void} editJson
 *   `change` mutates the parsed JSON or returns a new value.
 * @property {() => void} cleanup
 */

/**
 * Every file below `dir` (a symbolic link counts as a file and is not
 * followed), as sorted paths relative to it, with `/` on every platform.
 *
 * @param {string} dir
 * @returns {string[]}
 */
export function listFiles(dir) {
  return fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => !entry.isDirectory())
    .map((entry) =>
      path
        .relative(dir, path.join(entry.parentPath, entry.name))
        .split(path.sep)
        .join('/'),
    )
    .sort();
}

/**
 * The bytes of every file below `dir` by relative path: what two builds are
 * compared with when they must be identical.
 *
 * @param {string} dir
 * @returns {Record<string, Buffer>}
 */
export const readTree = (dir) =>
  Object.fromEntries(
    listFiles(dir).map((rel) => [rel, fs.readFileSync(path.join(dir, rel))]),
  );

/** The sha256 of every file below `dir`: a compact form of `readTree`. */
export const hashTree = (dir) =>
  Object.fromEntries(
    Object.entries(readTree(dir)).map(([rel, bytes]) => [
      rel,
      createHash('sha256').update(bytes).digest('hex'),
    ]),
  );

/**
 * A new, empty folder. Remove it with `cleanup()`.
 *
 * @returns {Tree}
 */
export function createTree() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pc-')));
  const abs = (rel) => {
    const file = path.resolve(root, rel);
    const inside = path.relative(root, file);
    if (
      inside === '..' ||
      inside.startsWith(`..${path.sep}`) ||
      path.isAbsolute(inside)
    )
      throw new RangeError(`${rel} is outside the test folder`);
    return file;
  };
  const tree = {
    root,
    path: abs,
    write(rel, data) {
      const file = abs(rel);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const bytes = typeof data === 'string' || data instanceof Uint8Array;
      fs.writeFileSync(
        file,
        bytes ? data : `${JSON.stringify(data, null, 2)}\n`,
      );
      return file;
    },
    read: (rel) => fs.readFileSync(abs(rel), 'utf8'),
    readJson: (rel) => JSON.parse(tree.read(rel)),
    exists(rel) {
      try {
        fs.lstatSync(abs(rel));
        return true;
      } catch {
        return false;
      }
    },
    remove: (rel) => fs.rmSync(abs(rel), { recursive: true, force: true }),
    list: (rel = '.') => listFiles(abs(rel)),
    symlink(rel, target) {
      const file = abs(rel);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.symlinkSync(target, file);
      return file;
    },
    edit: (rel, change) => tree.write(rel, change(tree.read(rel))),
    editJson(rel, change) {
      const data = tree.readJson(rel);
      tree.write(rel, change(data) ?? data);
    },
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
  return tree;
}

/**
 * Runs `fn` with a new empty folder and removes it afterwards, also when
 * `fn` throws or rejects.
 *
 * @template T
 * @param {(tree: Tree) => T | Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withTree(fn) {
  const tree = createTree();
  try {
    return await fn(tree);
  } finally {
    tree.cleanup();
  }
}

// ---------------------------------------------------------------------------
// Compendiums

/**
 * @typedef {Tree & {
 *   dist: string,
 *   image: (rel: string, size?: { width?: number, height?: number, variants?: number[] }) => void,
 *   addLanguage: (code: string, patch?: Record<string, any>) => void,
 *   build: (options?: object) => ReturnType<typeof build>,
 * }} Repo
 */

/**
 * A new compendium (see the top of this file for what it holds).
 *
 * `overrides` maps paths to the files that replace or add to the defaults: a
 * string or bytes are written as they are, any other value as JSON, and
 * `null` deletes a default file:
 *
 *   createRepo({
 *     'content/en/01-intro.md': 'A section with no heading.\n',
 *     'content/en/lang.json': null,        // no such file
 *     'content/de/lang.json': langJson('de', { status: 'draft' }),
 *   });
 *
 * Besides the methods of a `Tree`:
 *
 *   dist                       where `build()` writes by default
 *   image(rel, { width, height, variants })
 *                              a WebP at `static/<rel>` (default 960 x 640)
 *                              and a narrower copy `<name>-<width>w.<ext>` for
 *                              every width in `variants`, the height in step
 *   addLanguage(code, patch)   `content/<code>/lang.json` (see `langJson`)
 *                              and a copy of every section of the source
 *                              language, with a closing paragraph so that it
 *                              is a translation and no untranslated copy
 *   build(options)             the real `build()` on this folder: `strict`,
 *                              `fingerprint`, `outDir` (relative to the
 *                              folder, default `dist`), `fs`, `reporter`
 *
 * @param {Record<string, string | Uint8Array | object | null>} [overrides]
 * @returns {Repo}
 */
export function createRepo(overrides = {}) {
  const tree = createTree();
  try {
    const files = defaultFiles();
    for (const [rel, data] of Object.entries(overrides))
      if (data === null) files.delete(rel);
      else files.set(rel, data);
    for (const [rel, data] of files) tree.write(rel, data);
  } catch (error) {
    tree.cleanup();
    throw error;
  }
  return asRepo(tree);
}

/** What of the real repository `createRealRepo` copies. */
const REAL_PATHS = ['content', 'static', 'src', 'site.json'];

/**
 * A copy of the REAL content, images, scripts and settings in a temp folder
 * (`content/`, `static/`, `src/` and `site.json`; `paths` says otherwise),
 * with the same methods as `createRepo`: for the few tests that are about the
 * real files and have to bend a copy of them, to see that a rule still catches
 * what it is meant to catch, say. The real files are never touched. Whether
 * the copy is valid is up to the real files.
 *
 * @param {string[]} [paths] Files and folders of the repository to copy.
 * @returns {Repo}
 */
export function createRealRepo(paths = REAL_PATHS) {
  const tree = createTree();
  try {
    for (const rel of paths)
      fs.cpSync(path.join(REAL_ROOT, rel), tree.path(rel), { recursive: true });
  } catch (error) {
    tree.cleanup();
    throw error;
  }
  return asRepo(tree);
}

/** The methods of a compendium, on a tree. */
function asRepo(tree) {
  return Object.assign(tree, {
    dist: path.join(tree.root, 'dist'),
    image(rel, { width = 960, height = 640, variants = [] } = {}) {
      const ext = path.posix.extname(rel);
      if (!ext) throw new TypeError(`${rel} needs an extension, such as .webp`);
      tree.write(`static/${rel}`, webp(width, height));
      for (const narrow of variants)
        tree.write(
          `static/${rel.slice(0, -ext.length)}-${narrow}w${ext}`,
          webp(narrow, Math.max(1, Math.round((height * narrow) / width))),
        );
    },
    addLanguage(code, patch = {}) {
      tree.write(`content/${code}/lang.json`, langJson(code, patch));
      for (const file of tree.list(`content/${SOURCE}`))
        if (file.endsWith('.md'))
          tree.write(
            `content/${code}/${file}`,
            file === SECTION
              ? introText(code)
              : `${tree.read(`content/${SOURCE}/${file}`).trimEnd()}\n\nTranslation ${code}.\n`,
          );
    },
    build: (options = {}) => build({ root: tree.root, imageSize, ...options }),
  });
}

/**
 * Runs `fn` with a new compendium and removes it afterwards, also when `fn`
 * throws or rejects. Overrides are optional: `withRepo(fn)` or
 * `withRepo(overrides, fn)`.
 *
 * @template T
 * @param {Record<string, any> | ((repo: Repo) => T | Promise<T>)} overrides
 * @param {(repo: Repo) => T | Promise<T>} [fn]
 * @returns {Promise<T>}
 */
export async function withRepo(overrides, fn) {
  const [files, run] =
    typeof overrides === 'function' ? [{}, overrides] : [overrides, fn];
  const repo = createRepo(files);
  try {
    return await run(repo);
  } finally {
    repo.cleanup();
  }
}

/**
 * Runs `fn` with a copy of the real files (`createRealRepo`) and removes it
 * afterwards, also when `fn` throws or rejects.
 *
 * @template T
 * @param {(repo: Repo) => T | Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withRealRepo(fn) {
  const repo = createRealRepo();
  try {
    return await fn(repo);
  } finally {
    repo.cleanup();
  }
}
