import { formatDate } from './html/footer.mjs';
import { isPageId } from './html/ids.mjs';
import { renderPage } from './html/page.mjs';
import { inlineScript, markScripted, themeScript } from './inline-scripts.mjs';
import { mergedUi } from './languages.mjs';
import { createMarkdownCopy, markdownDocument } from './markdown/copy.mjs';
import { createMarkdown } from './markdown/renderer.mjs';
import { jsonLd, structuredData } from './structured-data.mjs';

/**
 * The page of one language: its sections rendered, in order, and put into the
 * page template. A section the language lacks shows the source language's
 * text, and says so for screen readers (`lang` of the source).
 *
 * Next to the page come its Markdown copy (the same sections as plain
 * Markdown, for programs that read the guide; a draft has none, as it is not
 * offered to search engines either) and its table of contents.
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
 * @param {import('./history.mjs').TextDates} [options.dates] When the text of
 *   this language first appeared and last changed, when known.
 * @param {import('./diagnostics.mjs').Reporter} options.reporter
 * @returns {{
 *   html: string,
 *   markdown: string | null,
 *   toc: { level: number, id: string, html: string }[],
 * }} The page, its Markdown copy (null for a draft) and the h2 and h3 of
 *   its table of contents.
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
  dates,
  reporter,
}) {
  const ui = mergedUi(source, lang);
  const url = `${site.siteUrl}/${lang.code}/`;
  const md = createMarkdown({
    lang,
    ui,
    images,
    reporter,
    isReserved: isPageId,
  });
  const copy = createMarkdownCopy({ lang, ui, url, siteUrl: site.siteUrl });
  const body = content.sections
    .map((section) => {
      const html = md.render(section.text, section.path);
      return section.fallback
        ? `<div lang="${source.htmlLang}">${html}</div>`
        : html;
    })
    .join('\n');
  const markdown =
    lang.status === 'draft'
      ? null
      : markdownDocument({
          title: lang.pageTitle,
          description: lang.description,
          url,
          updated:
            dates &&
            ui.updated.replace(
              '{date}',
              () => formatDate(dates.modified, lang).text,
            ),
          note: ui.translationNote,
          sections: content.sections.map((section) =>
            copy.render(section.text),
          ),
          credit: ui.credit,
        });
  const html = renderPage({
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
    structuredData: jsonLd(
      structuredData({
        site,
        lang,
        source,
        image,
        ui,
        records: md.records,
        dates,
      }),
    ),
    markdownCopy: markdown !== null,
    dates,
    reporter,
  });
  return { html, markdown, toc: md.toc };
}
