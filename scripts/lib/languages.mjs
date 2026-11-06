import nodeFs from 'node:fs';
import { reportProblems } from './diagnostics.mjs';
import { isObject, readDir, readJson } from './files.mjs';

// These patterns are what makes it safe to print `code`, `htmlLang`, `dir` and
// `ogLocale` into HTML attributes, URLs and an inline script without escaping.
export const LANG_CODE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
const HTML_LANG = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
const OG_LOCALE = /^[a-z]{2,3}_[A-Z]{2}$/;
/** Names the build already uses next to the language folders in `dist/`. */
export const RESERVED_CODES = new Set(['img']);

const KEYS = new Set([
  'code',
  'name',
  'htmlLang',
  'title',
  'description',
  'dir',
  'order',
  'source',
  'status',
  'ogLocale',
  'ogImageAlt',
  'typography',
  'ui',
]);

/**
 * The `ui` strings the page templates and the scripts print: the source
 * language defines every one (a missing one is a diagnostic, not a crash in
 * a template). `translationNote` is the one optional string.
 */
export const REQUIRED_UI = [
  'toc',
  'tocClose',
  'language',
  'langCode',
  'skip',
  'top',
  'expandAll',
  'collapseAll',
  'tip',
  'warning',
  'themeAuto',
  'themeLight',
  'themeDark',
  'notFound',
  'shortName',
  'copyLink',
  'linkCopied',
  'copyFailed',
  'heroStart',
  'heroFaq',
  'heroAlt',
  'beginner',
  'filterLabel',
  'filterAll',
  'filterStatus',
  'search',
  'searchLabel',
  'searchBrowse',
  'searchResults',
  'searchCount',
  'searchNone',
  'searchSection',
  'searchQuestion',
  'searchText',
  'searchClose',
  'credit',
];

/** Optional strings: a language may define one the source does not. */
const OPTIONAL_UI = ['translationNote'];

/** What a string must contain for a script to fill it in. */
const PLACEHOLDERS = { filterStatus: ['{shown}', '{total}'] };

/** The name in the web app manifest: a home screen label is this short. */
const SHORT_NAME_MAX = 12;

/**
 * @typedef {object} Language
 * @property {string} code Folder name and URL segment.
 * @property {string} folder `content/<code>`
 * @property {string} file `content/<code>/lang.json`
 * @property {string} name Native name, shown in the picker.
 * @property {string} htmlLang Value of the `lang` attribute and of hreflang.
 * @property {string} title
 * @property {string} description
 * @property {'ltr' | 'rtl'} dir
 * @property {number} order
 * @property {boolean} source
 * @property {'published' | 'draft'} status
 * @property {string | null} ogLocale `language_TERRITORY`, e.g. `en_GB`. Only
 *   a draft may have none (its tag has no territory and none was given).
 * @property {string} [ogImageAlt]
 * @property {import('./markdown/typography.mjs').Typography} typography The
 *   language's rules for no-break spaces; none by default.
 * @property {Record<string, string>} ui The strings this file defines.
 */

/**
 * Reads `content/<code>/lang.json` of every language folder.
 *
 * @param {object} options
 * @param {typeof nodeFs} [options.fs]
 * @param {string} options.root
 * @param {import('./diagnostics.mjs').Reporter} options.reporter
 * @returns {{ languages: Language[], source: Language } | null} Null when
 *   anything was reported as an error.
 */
export function loadLanguages({ fs = nodeFs, root, reporter }) {
  const entries = readDir({ fs, root, rel: 'content', reporter });
  if (entries === null) return null;
  /** @type {Language[]} */
  const languages = [];
  let failed = false;
  /** How many lang.json say `"source": true`, valid or not. */
  let declared = 0;
  for (const entry of entries) {
    if (entry.isSymbolicLink()) {
      reporter.error('E_SYMLINK', 'symbolic links are not allowed', {
        file: `content/${entry.name}`,
      });
      failed = true;
    }
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const inside = readDir({
      fs,
      root,
      rel: `content/${entry.name}`,
      reporter,
    });
    if (inside === null) {
      failed = true;
      continue;
    }
    if (!inside.some((file) => file.name === 'lang.json')) {
      reporter.warn(
        'W_NO_LANG_JSON',
        `content/${entry.name} has no lang.json, folder skipped`,
        { file: `content/${entry.name}` },
      );
      continue;
    }
    const rel = `content/${entry.name}/lang.json`;
    const data = readJson({ fs, root, rel, reporter });
    if (data === undefined) {
      failed = true;
      continue;
    }
    const { language, problems } = checkLanguage(entry.name, data);
    if (isObject(data) && data.source === true) declared += 1;
    if (!reportProblems(reporter, 'E_LANG_META', problems, rel)) failed = true;
    else languages.push(language);
  }
  const sources = languages.filter((language) => language.source);
  // A lang.json that is broken (and already reported) may be the source: no
  // second complaint that there is none.
  if (declared > 1 || (declared === 0 && !failed)) {
    reporter.error(
      'E_LANG_SOURCES',
      `exactly one language must have "source": true (found ${declared})`,
      { file: 'content' },
    );
    failed = true;
  }
  if (!uniqueNames(languages, reporter)) failed = true;
  if (sources.length === 1 && !checkUiKeys(languages, sources[0], reporter))
    failed = true;
  if (failed) return null;
  // The folders were listed in code order and a sort is stable.
  languages.sort((a, b) => a.order - b.order);
  return { languages, source: sources[0] };
}

/**
 * The strings of `language`, with the source language filling the gaps.
 *
 * @param {Language} source
 * @param {Language} language
 * @returns {Record<string, string>}
 */
export const mergedUi = (source, language) => ({
  ...source.ui,
  ...language.ui,
});

/**
 * @param {Language[]} languages
 * @returns {Language[]} The ones that are offered to readers.
 */
export const published = (languages) =>
  languages.filter((language) => language.status === 'published');

/**
 * The most likely territory of a language tag, as Open Graph wants it: `pl`
 * becomes `pl_PL`, `en` becomes `en_US` (set `ogLocale` in lang.json for
 * `en_GB`).
 *
 * @param {string} htmlLang
 * @returns {string | null} Null when the tag is not a valid language tag or
 *   has no known territory.
 */
function deriveOgLocale(htmlLang) {
  try {
    const { language, region } = new Intl.Locale(htmlLang).maximize();
    return region ? `${language}_${region}` : null;
  } catch {
    return null;
  }
}

/**
 * The pure core of reading a `lang.json`: what is wrong with it, and the
 * language it describes when nothing is.
 *
 * @param {string} code The name of the folder.
 * @param {any} data The parsed `lang.json`.
 * @returns {{ language: Language | null, problems: import('./diagnostics.mjs').Problem[] }}
 */
export function checkLanguage(code, data) {
  const problems = [];
  const bad = (field, message) => problems.push({ field, message });
  if (!isObject(data)) {
    bad('lang.json', 'lang.json must be a JSON object');
    return { language: null, problems };
  }
  if (!LANG_CODE.test(code) || RESERVED_CODES.has(code))
    bad('code', `folder name "${code}" is not a usable language code`);
  for (const key of Object.keys(data))
    if (!KEYS.has(key)) bad(key, `unknown key "${key}"`);
  if (data.code !== code)
    bad('code', `"code" must be "${code}" (got ${JSON.stringify(data.code)})`);
  for (const key of ['name', 'title', 'description'])
    if (typeof data[key] !== 'string' || !data[key].trim())
      bad(key, `"${key}" must be a non-empty string`);
  if (data.dir !== undefined && !['ltr', 'rtl'].includes(data.dir))
    bad('dir', '"dir" must be "ltr" or "rtl"');
  if (data.order !== undefined && !Number.isFinite(data.order))
    bad('order', '"order" must be a number');
  if (data.source !== undefined && data.source !== true)
    bad('source', '"source" must be true when present');
  if (
    data.status !== undefined &&
    !['published', 'draft'].includes(data.status)
  )
    bad('status', '"status" must be "published" or "draft"');
  if (data.source && data.status === 'draft')
    bad('status', 'the source language cannot be a draft');
  if (data.ogImageAlt !== undefined && typeof data.ogImageAlt !== 'string')
    bad('ogImageAlt', '"ogImageAlt" must be a string');
  problems.push(...typographyProblems(data.typography));
  problems.push(...uiProblems(data.ui, data.source === true));
  problems.push(...localeProblems(data));
  if (problems.length > 0) return { language: null, problems };
  return {
    problems,
    language: {
      code,
      folder: `content/${code}`,
      file: `content/${code}/lang.json`,
      name: data.name,
      htmlLang: data.htmlLang,
      title: data.title,
      description: data.description,
      dir: data.dir ?? 'ltr',
      order: data.order ?? 999,
      source: data.source === true,
      status: data.status ?? 'published',
      ogLocale: data.ogLocale ?? deriveOgLocale(data.htmlLang),
      ogImageAlt: data.ogImageAlt,
      typography: data.typography ?? {},
      ui: data.ui,
    },
  };
}

/**
 * The tag must be a language tag; the locale of link previews must be given
 * or derivable, unless the language is a draft (a draft is built and read,
 * but not shared, so a code such as `xx` may be scaffolded and the locale
 * added when the language is published).
 *
 * @returns {import('./diagnostics.mjs').Problem[]}
 */
function localeProblems({ htmlLang, ogLocale, status }) {
  const bad = (field, message) => [{ field, message }];
  if (typeof htmlLang !== 'string' || !HTML_LANG.test(htmlLang))
    return bad(
      'htmlLang',
      '"htmlLang" must be a language tag such as "en" or "pt-BR"',
    );
  if (ogLocale !== undefined)
    return OG_LOCALE.test(ogLocale)
      ? []
      : bad('ogLocale', '"ogLocale" must look like "en_GB"');
  return status === 'draft' || deriveOgLocale(htmlLang)
    ? []
    : bad(
        'ogLocale',
        `"ogLocale" (such as "en_GB") is required for htmlLang "${htmlLang}"`,
      );
}

/** @returns {import('./diagnostics.mjs').Problem[]} */
function uiProblems(ui, isSource) {
  if (!isObject(ui))
    return [{ field: 'ui', message: '"ui" must be an object of strings' }];
  const bad = Object.keys(ui).filter(
    (key) => typeof ui[key] !== 'string' || !ui[key].trim(),
  );
  const missing = isSource
    ? REQUIRED_UI.filter((key) => ui[key] === undefined)
    : [];
  const problems = [...bad, ...missing].map((key) => ({
    field: `ui.${key}`,
    message: `"ui.${key}" must be a non-empty string`,
  }));
  const fine = (key) => typeof ui[key] === 'string' && !bad.includes(key);
  for (const [key, names] of Object.entries(PLACEHOLDERS))
    for (const name of names)
      if (fine(key) && !ui[key].includes(name))
        problems.push({
          field: `ui.${key}`,
          message: `"ui.${key}" must contain ${name}`,
        });
  if (fine('shortName') && [...ui.shortName].length > SHORT_NAME_MAX)
    problems.push({
      field: 'ui.shortName',
      message: `"ui.shortName" is at most ${SHORT_NAME_MAX} characters`,
    });
  return problems;
}

const TYPOGRAPHY_LISTS = ['nbspAfter', 'units'];
const TYPOGRAPHY_WORD = /^[\p{L}\p{N}.°/]+$/u;

/** @returns {import('./diagnostics.mjs').Problem[]} */
function typographyProblems(typography) {
  if (typography === undefined) return [];
  if (!isObject(typography))
    return [{ field: 'typography', message: '"typography" must be an object' }];
  const problems = Object.keys(typography)
    .filter((key) => !TYPOGRAPHY_LISTS.includes(key))
    .map((key) => ({
      field: `typography.${key}`,
      message: `unknown key "typography.${key}"`,
    }));
  for (const key of TYPOGRAPHY_LISTS) {
    const list = typography[key];
    if (
      list !== undefined &&
      !(
        Array.isArray(list) &&
        list.every(
          (word) => typeof word === 'string' && TYPOGRAPHY_WORD.test(word),
        )
      )
    )
      problems.push({
        field: `typography.${key}`,
        message: `"typography.${key}" must be a list of words without spaces`,
      });
  }
  return problems;
}

/**
 * A published language defines every `ui` string of the source language (the
 * templates print them all) and nothing the source lacks (no template reads
 * it). A draft may be unfinished.
 *
 * @param {Language[]} languages
 * @param {Language} source
 * @param {import('./diagnostics.mjs').Reporter} reporter
 * @returns {boolean} False when a string is missing.
 */
function checkUiKeys(languages, source, reporter) {
  let ok = true;
  for (const language of languages) {
    if (language === source || language.status !== 'published') continue;
    for (const key of Object.keys(source.ui))
      if (!Object.hasOwn(language.ui, key)) {
        reporter.error(
          'E_LANG_UI_MISSING',
          `"ui.${key}" is missing: the source language defines it`,
          { file: language.file, field: `ui.${key}` },
        );
        ok = false;
      }
    for (const key of Object.keys(language.ui))
      if (!Object.hasOwn(source.ui, key) && !OPTIONAL_UI.includes(key))
        reporter.warn(
          'W_LANG_UI_EXTRA',
          `"ui.${key}" is not used: the source language does not define it`,
          { file: language.file, field: `ui.${key}` },
        );
  }
  return ok;
}

/**
 * hreflang, `<html lang>` and the folder in `dist/` must tell languages
 * apart, whatever the case a disk or a browser ignores (`pt-BR`, `pt-br`).
 */
function uniqueNames(languages, reporter) {
  let ok = true;
  for (const [field, name] of [
    ['htmlLang', (language) => language.htmlLang],
    ['code', (language) => language.code],
  ]) {
    const seen = new Map();
    for (const language of languages) {
      const key = name(language).toLowerCase();
      if (seen.has(key)) {
        reporter.error(
          'E_LANG_META',
          `"${field}" ${name(language)} is also used by ${seen.get(key)} (case does not tell languages apart)`,
          { file: language.file, field },
        );
        ok = false;
      }
      seen.set(key, language.code);
    }
  }
  return ok;
}
