import { reportProblems } from './diagnostics.mjs';
import { isObject, readJson } from './files.mjs';

const KEYS = new Set(['siteUrl', 'ogImage', 'themeColor', 'defaultLanguage']);
const COLOR = /^#[0-9a-fA-F]{6}$/;

/**
 * @typedef {object} Site
 * @property {string} siteUrl
 * @property {string} basePath The path of `siteUrl`, with a trailing slash.
 * @property {string} ogImage `img/<file>`, checked later by the image
 *   resolver.
 * @property {{ content: string, media?: string }[]} themeColors
 * @property {string | null} defaultLanguage The code of the language for
 *   visitors whom no language of the site suits; null: the source language.
 */

/**
 * Reads and validates `site.json`:
 *
 *   siteUrl     required, absolute https URL without a trailing slash
 *   ogImage     required, `img/<file>`: the image link previews show
 *   themeColor  optional, "#rrggbb" or { "light": "#rrggbb", "dark": "#rrggbb" }
 *   defaultLanguage  optional, the code of a published language: where the
 *               root page sends a visitor whose browser asks for no language
 *               of the site, and the language of the root and 404 pages
 *               (`pickDefaultLanguage`); the source language when absent
 *
 * @param {Omit<Parameters<typeof readJson>[0], 'rel'>} options
 * @returns {Site | null} Null after reporting.
 */
export function loadSite(options) {
  const data = readJson({ ...options, rel: 'site.json' });
  if (data === undefined) return null;
  const { site, problems } = checkSite(data);
  return reportProblems(options.reporter, 'E_SITE', problems, 'site.json')
    ? site
    : null;
}

/**
 * The pure core of `loadSite`: what is wrong with a `site.json`, and the
 * settings it describes when nothing is.
 *
 * @param {any} data The parsed `site.json`.
 * @returns {{ site: Site | null, problems: import('./diagnostics.mjs').Problem[] }}
 */
export function checkSite(data) {
  const problems = [];
  const bad = (field, message) => problems.push({ field, message });
  if (!isObject(data)) {
    bad('site.json', 'site.json must be a JSON object');
    return { site: null, problems };
  }
  for (const key of Object.keys(data))
    if (!KEYS.has(key)) bad(key, `unknown key "${key}"`);
  if (typeof data.ogImage !== 'string')
    bad('ogImage', '"ogImage" is required: an image such as "img/photo.webp"');
  const url = checkUrl(data.siteUrl, bad);
  const themeColors = checkColors(data.themeColor, bad);
  const { defaultLanguage = null } = data;
  if (defaultLanguage !== null && typeof defaultLanguage !== 'string')
    bad(
      'defaultLanguage',
      '"defaultLanguage" must be a language code, e.g. "en"',
    );
  if (problems.length > 0) return { site: null, problems };
  return {
    problems,
    site: {
      siteUrl: data.siteUrl,
      basePath: url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`,
      ogImage: data.ogImage,
      themeColors,
      defaultLanguage,
    },
  };
}

/**
 * The language for visitors whom no language of the site suits:
 * `defaultLanguage` of `site.json`, else the source language. It has to be
 * published, or it is an `E_SITE` error (field `defaultLanguage`) and the
 * source language stands in, so that the build goes on to report the rest
 * (an error keeps its output from being written).
 *
 * @param {object} options
 * @param {Site} options.site
 * @param {import('./languages.mjs').Language} options.source
 * @param {import('./languages.mjs').Language[]} options.languages Published.
 * @param {import('./diagnostics.mjs').Reporter} options.reporter
 * @returns {import('./languages.mjs').Language}
 */
export function pickDefaultLanguage({ site, source, languages, reporter }) {
  const code = site.defaultLanguage ?? source.code;
  const lang = languages.find((language) => language.code === code);
  if (lang) return lang;
  reporter.error(
    'E_SITE',
    `"defaultLanguage" must be a published language: "${code}" is none`,
    { file: 'site.json', field: 'defaultLanguage' },
  );
  return source;
}

/** @returns {URL | null} */
function checkUrl(value, bad) {
  if (typeof value !== 'string') {
    bad('siteUrl', '"siteUrl" is required, e.g. "https://example.com"');
    return null;
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    bad('siteUrl', `"siteUrl" is not an absolute URL: ${value}`);
    return null;
  }
  const canonical = url.href.replace(/\/$/, '');
  if (url.protocol !== 'https:' || url.search || url.hash)
    bad('siteUrl', '"siteUrl" must be an https URL without query or fragment');
  else if (url.username || url.password)
    bad('siteUrl', '"siteUrl" must not carry a user name or password');
  else if (/[&<>"]/.test(value))
    bad('siteUrl', '"siteUrl" must not contain & < > or "');
  else if (value !== canonical)
    bad('siteUrl', `"siteUrl" must be written as ${canonical}`);
  return url;
}

/** @returns {{ content: string, media?: string }[]} */
function checkColors(value, bad) {
  if (value === undefined) return [];
  if (typeof value === 'string' && COLOR.test(value))
    return [{ content: value }];
  if (isObject(value) && COLOR.test(value.light) && COLOR.test(value.dark))
    return [
      { content: value.light, media: '(prefers-color-scheme: light)' },
      { content: value.dark, media: '(prefers-color-scheme: dark)' },
    ];
  bad(
    'themeColor',
    '"themeColor" must be "#rrggbb" or { "light": ..., "dark": ... }',
  );
  return [];
}
