// Small fixtures for the tests of the page templates, the blocks and the
// Markdown renderer: a language, the UI strings (every key shows its own
// name), a table of fake pictures instead of files, a renderer wired to a
// capturing reporter, and the Markdown copy of a text (`copyOnce`). Nothing
// here reads a file or the real content.
//
//   const r = renderer({ images: { 'img/a.webp': { width: 960, height: 640 } } });
//   const html = r.render('::: tip\nHello\n:::\n');
//   assert.deepEqual(codes(r.reporter), []);

import { createMarkdownCopy } from '../../scripts/lib/markdown/copy.mjs';
import { createMarkdown } from '../../scripts/lib/markdown/renderer.mjs';
import { capture } from './capture.mjs';

/** The UI keys the templates and blocks read. */
export const UI_KEYS = [
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
  'updated',
];

/** Keys whose text must hold a placeholder: the name, and the placeholder. */
const PLACEHOLDER_TEXT = { updated: 'updated {date}' };

/**
 * @param {Record<string, string | undefined>} [over] Replaces keys; undefined
 *   removes one.
 * @returns {Record<string, string>} Every key with its own name as the text
 *   (`updated` has its `{date}` too).
 */
export function ui(over = {}) {
  const all = {
    ...Object.fromEntries(
      UI_KEYS.map((key) => [key, PLACEHOLDER_TEXT[key] ?? key]),
    ),
  };
  for (const [key, value] of Object.entries(over))
    if (value === undefined) delete all[key];
    else all[key] = value;
  return all;
}

const NAMES = { pl: 'Polski', en: 'English', uk: 'Українська' };
const HTML_LANGS = { pl: 'pl-PL', en: 'en-GB', uk: 'uk-UA' };

/**
 * A published language.
 *
 * @param {string} [code]
 * @param {Record<string, any>} [over]
 * @returns {any} A `Language` of `languages.mjs`.
 */
export const lang = (code = 'en', over = {}) => ({
  code,
  folder: `content/${code}`,
  file: `content/${code}/lang.json`,
  name: NAMES[code] ?? code,
  htmlLang: HTML_LANGS[code] ?? code,
  title: `Title ${code}`,
  pageTitle: `Page title ${code}`,
  description: `Description ${code}.`,
  dir: 'ltr',
  order: 1,
  source: code === 'pl',
  status: 'published',
  ogLocale: HTML_LANGS[code]?.replace('-', '_') ?? null,
  typography: {},
  ui: {},
  ...over,
});

/**
 * A picture the resolver finds.
 *
 * @param {Record<string, any>} [over]
 */
export const picture = (href, over = {}) => ({
  ok: true,
  href,
  width: 960,
  height: 640,
  variants: [],
  alpha: false,
  ...over,
});

/**
 * An image resolver over a table, no files.
 *
 * @param {Record<string, Record<string, any> | { ok: false, code: string }>} table
 *   href -> properties of the picture (or `{ ok: false, code }`).
 * @returns {{ resolve: (href: string) => any, asked: string[] }}
 */
export function fakeImages(table = {}) {
  const asked = [];
  return {
    asked,
    resolve(href) {
      asked.push(href);
      const entry = table[href];
      if (entry?.ok === false)
        return { message: `problem with ${href}`, ...entry };
      if (entry) return picture(href, entry);
      return {
        ok: false,
        code: 'E_IMG_MISSING',
        message: `image not found: static/${href}`,
      };
    },
  };
}

/**
 * A Markdown renderer with a capturing reporter.
 *
 * @param {object} [options]
 * @param {string} [options.code] Language code.
 * @param {Record<string, any>} [options.typography]
 * @param {Record<string, any>} [options.images] See `fakeImages`.
 * @param {Record<string, string | undefined>} [options.ui] See `ui`.
 * @param {(id: string) => boolean} [options.isReserved]
 * @param {Record<string, any>} [options.blocks]
 * @param {boolean} [options.strict]
 */
export function renderer({
  code = 'en',
  typography = {},
  images = {},
  ui: uiOver = {},
  isReserved,
  blocks,
  strict = false,
} = {}) {
  const reporter = capture({ strict });
  const resolver = fakeImages(images);
  const md = createMarkdown({
    lang: lang(code, { typography }),
    ui: ui(uiOver),
    images: resolver,
    reporter,
    ...(isReserved ? { isReserved } : {}),
    ...(blocks ? { blocks } : {}),
  });
  return {
    reporter,
    toc: md.toc,
    records: md.records,
    images: resolver,
    render: (text, file = 'case.md') => md.render(text, file),
  };
}

/**
 * Renders `text` with a fresh renderer.
 *
 * @param {string} text
 * @param {Parameters<typeof renderer>[0]} [options]
 */
export function renderOnce(text, options) {
  const r = renderer(options);
  const html = r.render(text);
  return { html, reporter: r.reporter, toc: r.toc, records: r.records };
}

/** The address of the page `copyOnce` copies, and of its site. */
export const COPY_SITE = 'https://x.test';

/**
 * The Markdown copy of `text`, as the page of `https://x.test/<code>/` has it.
 *
 * @param {string} text
 * @param {object} [options]
 * @param {string} [options.code] Language code.
 * @param {Record<string, string | undefined>} [options.ui] See `ui`.
 * @param {Record<string, any>} [options.blocks]
 * @returns {string}
 */
export function copyOnce(text, { code = 'en', ui: uiOver = {}, blocks } = {}) {
  return createMarkdownCopy({
    lang: lang(code),
    ui: ui(uiOver),
    url: `${COPY_SITE}/${code}/`,
    siteUrl: COPY_SITE,
    ...(blocks ? { blocks } : {}),
  }).render(text);
}
