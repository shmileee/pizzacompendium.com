import { assetUrl, fontsFor } from '../assets.mjs';
import { escapeHtml } from './escape.mjs';
import { renderFooter } from './footer.mjs';
import {
  alternates,
  COLOR_SCHEME,
  iconLinks,
  manifestLink,
  NOINDEX,
  renderHead,
  socialImage,
  themeColor,
} from './head.mjs';
import { renderHeader } from './header.mjs';
import { renderHero } from './hero.mjs';
import { icon, sprite } from './icons.mjs';
import { renderToc } from './toc.mjs';

/**
 * One language page.
 *
 * @param {object} model
 * @param {{ siteUrl: string, themeColors: any[] }} model.site
 * @param {import('../languages.mjs').Language} model.lang
 * @param {import('../languages.mjs').Language[]} model.languages Published.
 * @param {Record<string, string>} model.ui
 * @param {string} model.body The rendered sections.
 * @param {{ level: number, id: string, html: string }[]} model.toc
 * @param {{ css: any, js: any, modules: any[] }} model.assets
 * @param {string[]} model.scripts Text of the inline scripts of the head.
 * @param {{ href: string, width: number, height: number }} model.image
 * @param {{ resolve: (href: string) => any }} model.images The picture files
 *   (the hero reads them).
 * @param {import('../diagnostics.mjs').Reporter} model.reporter
 * @returns {string}
 */
export function renderPage(model) {
  const { site, lang, languages, ui, body, assets, scripts, image } = model;
  const url = `${site.siteUrl}/${lang.code}/`;
  const title = escapeHtml(lang.title);
  const description = escapeHtml(lang.description);
  // The title and the headings are set in the heading face: preload the font
  // of every script they use (a Ukrainian page has Latin names in its headings).
  const headingText = [lang.title, ...model.toc.map((entry) => entry.html)]
    .join(' ')
    .replace(/&[#\w]+;/g, '');
  const head = renderHead({
    scripts,
    lines: [
      // A draft is built but not offered to search engines.
      lang.status === 'draft' && NOINDEX,
      `<title>${title}</title>`,
      `<meta name="description" content="${description}">`,
      `<link rel="canonical" href="${url}">`,
      alternates(site, languages),
      `<meta property="og:title" content="${title}">`,
      `<meta property="og:description" content="${description}">`,
      '<meta property="og:type" content="article">',
      `<meta property="og:url" content="${url}">`,
      `<meta property="og:site_name" content="${title}">`,
      lang.ogLocale && `<meta property="og:locale" content="${lang.ogLocale}">`,
      ...languages
        .filter((other) => other.code !== lang.code)
        .map(
          (other) =>
            `<meta property="og:locale:alternate" content="${other.ogLocale}">`,
        ),
      ...socialImage(site, image, lang.ogImageAlt ?? lang.title),
      COLOR_SCHEME,
      ...themeColor(site),
      ...iconLinks('../'),
      manifestLink(),
      ...fontsFor(headingText).map(
        (file) =>
          `<link rel="preload" href="../${file}" as="font" type="font/woff2" crossorigin>`,
      ),
      ...assets.modules.map(
        (module) =>
          `<link rel="modulepreload" href="${assetUrl('../', module)}">`,
      ),
      `<link rel="stylesheet" href="${assetUrl('../', assets.css)}">`,
    ],
  });
  const note = ui.translationNote
    ? `<p class="translation-note">${escapeHtml(ui.translationNote)}</p>`
    : '';
  // The hero is a band as wide as the page at the top of `<main>`; it holds the
  // title of the page, the one `<h1>`.
  const hero = renderHero(model);
  return `<!doctype html>
<html lang="${lang.htmlLang}" dir="${lang.dir}">
${head}
<body id="top">
${sprite()}
<a class="skip" href="#content">${escapeHtml(ui.skip)}</a>
${renderHeader(model)}
<div class="layout">
  ${renderToc(model)}
  <div class="toc-backdrop" id="pc-backdrop" aria-hidden="true"></div>
  <main id="content" tabindex="-1">
    <div class="hero-slot">${hero}</div>
    <div class="article">
      ${note}
      ${body}
    </div>
    <a class="btn btn-icon to-top" id="pc-top" href="#top" aria-label="${escapeHtml(ui.top)}">${icon('arrow-up')}</a>
  </main>
</div>
${renderFooter(model)}
<div class="progress" id="pc-progress" aria-hidden="true"></div>
<script type="module" src="${assetUrl('../', assets.js)}"></script>
</body>
</html>
`;
}
