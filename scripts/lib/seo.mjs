import { MANIFEST_ICONS } from './html/head.mjs';

/**
 * `sitemap.xml`: one entry per published language page, each listing all
 * language alternates. There is no `lastmod`: a build date that changes on
 * every deploy tells crawlers nothing, and it would make the output differ
 * between two builds of the same text.
 *
 * @param {{ siteUrl: string }} site
 * @param {import('./languages.mjs').Language[]} languages Published ones.
 * @returns {string}
 */
export function renderSitemap(site, languages) {
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
        `  <url>\n    <loc>${site.siteUrl}/${lang.code}/</loc>\n${alternates}\n  </url>`,
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
 * name and description in that language, the language's page as the start
 * page, the whole site as the scope (so that the language picker stays inside
 * the app), the home screen icons. Every address is relative to the manifest,
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
    start_url: './',
    scope: '../',
    display: 'standalone',
    ...(colour && { background_color: colour, theme_color: colour }),
    icons: MANIFEST_ICONS.map((icon) => ({ ...icon, src: `../${icon.src}` })),
  };
  return `${JSON.stringify(manifest, null, 2)}\n`;
}
