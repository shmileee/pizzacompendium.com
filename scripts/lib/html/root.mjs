import { assetUrl } from '../assets.mjs';
import { themeScript } from '../inline-scripts.mjs';
import { escapeHtml } from './escape.mjs';
import {
  alternates,
  COLOR_SCHEME,
  iconLinks,
  renderHead,
  socialImage,
  themeColor,
} from './head.mjs';
import { sprite } from './icons.mjs';
import { renderLanguageList } from './language-list.mjs';

/**
 * The page at `/`: the mark, the title, one sentence and a language list for
 * visitors without JavaScript, and the inline script that sends everyone else
 * to their language. It is in the default language (`pickDefaultLanguage`),
 * where a visitor without JavaScript is sent too, and wears the theme the
 * reader chose (the installed app starts here).
 *
 * @param {object} model
 * @param {{ siteUrl: string, themeColors: any[] }} model.site
 * @param {import('../languages.mjs').Language} model.lang The default
 *   language.
 * @param {import('../languages.mjs').Language[]} model.languages Published.
 * @param {{ css: any }} model.assets
 * @param {string} model.script Text of the redirect script.
 * @param {{ href: string, width: number, height: number }} model.image
 * @returns {string}
 */
export function renderRoot({ site, lang, languages, assets, script, image }) {
  const title = escapeHtml(lang.title);
  const description = escapeHtml(lang.description);
  const head = renderHead({
    scripts: [themeScript(), script],
    // The scripts come last, after the no-script fallback.
    lines: [
      `<title>${title}</title>`,
      `<meta name="description" content="${description}">`,
      `<link rel="canonical" href="${site.siteUrl}/">`,
      alternates(site, languages),
      `<meta property="og:title" content="${title}">`,
      `<meta property="og:description" content="${description}">`,
      `<meta property="og:url" content="${site.siteUrl}/">`,
      `<meta property="og:site_name" content="${title}">`,
      ...socialImage(site, image, lang.ogImageAlt ?? lang.title),
      COLOR_SCHEME,
      ...themeColor(site),
      ...iconLinks(''),
      `<link rel="stylesheet" href="${assetUrl('', assets.css)}">`,
      `<noscript><meta http-equiv="refresh" content="0; url=${lang.code}/"></noscript>`,
    ],
  });
  return `<!doctype html>
<html lang="${lang.htmlLang}" dir="${lang.dir}">
${head}
<body class="root">
${sprite()}
<main class="root-main">
  <img class="root-mark" src="favicon.svg" alt="" width="96" height="96">
  <h1>${title}</h1>
  <p class="root-lead">${description}</p>
  ${renderLanguageList(languages, { prefix: '' })}
</main>
</body>
</html>
`;
}
