import { MANIFEST_ICONS, MARKDOWN_FILE } from './html/head.mjs';
import { plainText } from './markdown/text.mjs';

/**
 * `sitemap.xml`: one entry per published language page, each listing all
 * language alternates. `lastmod` is the date the language's text last
 * changed, from the history of the repository, and left out when that is
 * unknown: never the date of the build, which changes on every deploy, tells
 * crawlers nothing and would make two builds of the same text differ.
 *
 * @param {{ siteUrl: string }} site
 * @param {import('./languages.mjs').Language[]} languages Published ones.
 * @param {Map<string, import('./history.mjs').TextDates>} [dates]
 * @returns {string}
 */
const lastmod = (dates) =>
  dates ? `    <lastmod>${dates.modified}</lastmod>\n` : '';

export function renderSitemap(site, languages, dates = new Map()) {
  const alternates = [
    ...languages.map(
      (lang) =>
        `    <xhtml:link rel="alternate" hreflang="${lang.htmlLang}" href="${site.siteUrl}/${lang.code}/"/>`,
    ),
    `    <xhtml:link rel="alternate" hreflang="x-default" href="${site.siteUrl}/"/>`,
  ].join('\n');
  const urls = languages
    .map(
      (lang) =>
        `  <url>\n    <loc>${site.siteUrl}/${lang.code}/</loc>\n${lastmod(dates.get(lang.code))}${alternates}\n  </url>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}\n</urlset>\n`;
}

/**
 * @param {{ siteUrl: string }} site
 * @returns {string}
 */
export const renderRobots = (site) =>
  `User-agent: *\nAllow: /\n\nSitemap: ${site.siteUrl}/sitemap.xml\n`;

/**
 * The web app manifest of one language (`<code>/manifest.webmanifest`): the
 * name and description in that language, the root page as the start page (it
 * sends the reader to the language they chose: a fixed language page would
 * ignore the picker on every launch), the whole site as the scope (so that the
 * language picker stays inside the app), the home screen icons. Every address
 * is relative to the manifest,
 * so the site works under a sub-path. The colours are the paper of the light
 * theme, the first `themeColor` of `site.json`; a site without one has none.
 *
 * @param {{ themeColors: { content: string }[] }} site
 * @param {import('./languages.mjs').Language} lang
 * @returns {string} The JSON text.
 */
export function renderManifest(site, lang) {
  const colour = site.themeColors[0]?.content;
  const manifest = {
    name: lang.title,
    short_name: lang.ui.shortName,
    description: lang.description,
    lang: lang.htmlLang,
    dir: lang.dir,
    start_url: '../',
    scope: '../',
    display: 'standalone',
    ...(colour && { background_color: colour, theme_color: colour }),
    icons: MANIFEST_ICONS.map((icon) => ({ ...icon, src: `../${icon.src}` })),
  };
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

/** Link text in Markdown: brackets would end it early. */
const linkText = (text) => text.replace(/[[\]\\]/g, '\\$&');

/**
 * `/llms.txt` (https://llmstxt.org): a map of the guide for language models
 * and the agents that read it on someone's behalf. The name and summary of
 * the guide (the source language's), then one list per published language:
 * the Markdown copy of its page, the whole guide in one file, and every
 * section and subsection with its address on the page, so that a program can
 * fetch just the part it needs and cite it precisely.
 *
 * @param {object} model
 * @param {{ siteUrl: string }} model.site
 * @param {import('./languages.mjs').Language} model.source
 * @param {import('./languages.mjs').Language[]} model.languages Published.
 * @param {Map<string, { level: number, id: string, html: string }[]>} model.tocs
 *   The h2 and h3 of each language's page.
 * @returns {string}
 */
export function renderLlmsTxt({ site, source, languages, tocs }) {
  const lists = languages.map((lang) => {
    const url = `${site.siteUrl}/${lang.code}/`;
    const entries = tocs
      .get(lang.code)
      .map(
        ({ level, id, html }) =>
          `${level === 3 ? '  ' : ''}- [${linkText(plainText(html))}](${url}#${id})`,
      );
    return [
      `## ${lang.name}`,
      '',
      `- [${linkText(lang.pageTitle)}](${url}${MARKDOWN_FILE}): ${lang.description}`,
      ...entries,
    ].join('\n');
  });
  return `${[`# ${source.title}`, `> ${source.description}`, ...lists].join('\n\n')}\n`;
}
