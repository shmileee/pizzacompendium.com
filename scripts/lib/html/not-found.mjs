import { assetUrl } from '../assets.mjs';
import { themeScript } from '../inline-scripts.mjs';
import { escapeHtml } from './escape.mjs';
import {
  COLOR_SCHEME,
  iconLinks,
  NOINDEX,
  renderHead,
  themeColor,
} from './head.mjs';
import { sprite } from './icons.mjs';
import { renderLanguageList } from './language-list.mjs';

/**
 * `404.html`. GitHub Pages serves it for every unknown address, at any
 * depth, so its links and assets are root-absolute. The server cannot tell
 * which language the reader wants, so each language is a link that says, in
 * its own words, that the page was not found and where the guide is. The
 * page follows the theme the reader chose on the guide (the one inline
 * script) but loads nothing else. Its own language is the default one
 * (`pickDefaultLanguage`).
 *
 * @param {object} model
 * @param {{ basePath: string, themeColors: any[] }} model.site
 * @param {import('../languages.mjs').Language} model.lang The default
 *   language.
 * @param {import('../languages.mjs').Language[]} model.languages Published.
 * @param {{ css: any }} model.assets
 * @returns {string}
 */
export function renderNotFound({ site, lang, languages, assets }) {
  const head = renderHead({
    scripts: [themeScript()],
    lines: [
      NOINDEX,
      `<title>404 – ${escapeHtml(lang.title)}</title>`,
      COLOR_SCHEME,
      ...themeColor(site),
      ...iconLinks(site.basePath),
      `<link rel="stylesheet" href="${assetUrl(site.basePath, assets.css)}">`,
    ],
  });
  const list = renderLanguageList(languages, {
    prefix: site.basePath,
    detail: (language) => language.ui.notFound,
  });
  return `<!doctype html>
<html lang="${lang.htmlLang}" dir="${lang.dir}">
${head}
<body class="root">
${sprite()}
<main class="root-main">
  <img class="root-mark" src="${site.basePath}favicon.svg" alt="" width="96" height="96">
  <h1 class="root-code">404</h1>
  ${list}
</main>
</body>
</html>
`;
}
