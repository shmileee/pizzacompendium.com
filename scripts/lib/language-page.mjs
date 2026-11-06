import { isPageId } from './html/ids.mjs';
import { renderPage } from './html/page.mjs';
import { inlineScript, markScripted, themeScript } from './inline-scripts.mjs';
import { mergedUi } from './languages.mjs';
import { createMarkdown } from './markdown/renderer.mjs';

/**
 * The page of one language: its sections rendered, in order, and put into the
 * page template. A section the language lacks shows the source language's
 * text, and says so for screen readers (`lang` of the source).
 *
 * @param {object} options
 * @param {import('./languages.mjs').Language} options.lang
 * @param {import('./languages.mjs').Language} options.source
 * @param {import('./languages.mjs').Language[]} options.visible The published
 *   languages (what the picker and `hreflang` list).
 * @param {import('./sections.mjs').LanguageContent} options.content What this
 *   language has to show.
 * @param {import('./site-config.mjs').Site} options.site
 * @param {{ resolve: (href: string) => any }} options.images
 * @param {{ href: string, width: number, height: number }} options.image The
 *   preview image.
 * @param {Parameters<typeof renderPage>[0]['assets']} options.assets
 * @param {import('./diagnostics.mjs').Reporter} options.reporter
 * @returns {string} The HTML of the page.
 */
export function renderLanguagePage({
  lang,
  source,
  visible,
  content,
  site,
  images,
  image,
  assets,
  reporter,
}) {
  const ui = mergedUi(source, lang);
  const md = createMarkdown({
    lang,
    ui,
    images,
    reporter,
    isReserved: isPageId,
  });
  const body = content.sections
    .map((section) => {
      const html = md.render(section.text, section.path);
      return section.fallback
        ? `<div lang="${source.htmlLang}">${html}</div>`
        : html;
    })
    .join('\n');
  return renderPage({
    site,
    lang,
    languages: visible,
    ui,
    body,
    toc: md.toc,
    assets,
    scripts: [inlineScript(markScripted, [], ['document']), themeScript()],
    image,
    images,
    reporter,
  });
}
