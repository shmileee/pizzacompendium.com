import { escapeHtml } from './escape.mjs';
import { icon } from './icons.mjs';

/**
 * A date of the text as the language writes it (`6 November 2026`), in UTC
 * so that it does not depend on the machine. The locale is the language's
 * `ogLocale` when it has one (`en_GB` writes dates the British way, `en`
 * alone the American way), its `htmlLang` otherwise; a locale the platform's
 * `Intl` cannot read gets the ISO date instead.
 *
 * @param {string} iso
 * @param {{ htmlLang: string, ogLocale: string | null }} lang
 * @returns {{ day: string, text: string }} The ISO day and the shown date.
 */
export function formatDate(iso, { htmlLang, ogLocale }) {
  const date = new Date(iso);
  const day = date.toISOString().slice(0, 10);
  try {
    const format = new Intl.DateTimeFormat(
      ogLocale?.replace('_', '-') ?? htmlLang,
      {
        dateStyle: 'long',
        timeZone: 'UTC',
      },
    );
    return { day, text: format.format(date) };
  } catch {
    return { day, text: day };
  }
}

/** The "updated" line with the date in a `<time>`. */
const updated = (ui, iso, lang) => {
  const { day, text } = formatDate(iso, lang);
  return escapeHtml(ui.updated).replace(
    '{date}',
    () => `<time datetime="${day}">${escapeHtml(text)}</time>`,
  );
};

/**
 * The footer: the mark and the credit of the text, the date it last changed
 * (when the history of the repository tells it), the languages (the header
 * picker is the other way to switch), and the way back to the top for a reader
 * without JavaScript or without the floating button of the client.
 *
 * @param {object} model
 * @param {import('../languages.mjs').Language} model.lang The page's language.
 * @param {import('../languages.mjs').Language[]} model.languages
 * @param {Record<string, string>} model.ui
 * @param {import('../history.mjs').TextDates} [model.dates]
 * @returns {string}
 */
export function renderFooter({ lang, languages, ui, dates }) {
  const links = languages.map((other) => {
    const current = other.code === lang.code;
    return `<li><a href="../${other.code}/" hreflang="${other.htmlLang}" lang="${other.htmlLang}" dir="${other.dir}" data-lang="${other.code}"${current ? ' aria-current="true"' : ''}>${escapeHtml(other.name)}</a></li>`;
  });
  return `<footer class="site-footer">
  <div class="footer-inner">
    <img class="footer-mark" src="../favicon.svg" alt="" width="40" height="40">
    <p class="footer-credit">${escapeHtml(ui.credit)}</p>
${dates ? `    <p class="footer-updated">${updated(ui, dates.modified, lang)}</p>\n` : ''}    <a class="btn footer-top" href="#top">${icon('arrow-up')}${escapeHtml(ui.top)}</a>
    <nav class="footer-langs" aria-label="${escapeHtml(ui.language)}"><ul>${links.join('')}</ul></nav>
  </div>
</footer>`;
}
