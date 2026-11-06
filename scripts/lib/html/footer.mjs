import { escapeHtml } from './escape.mjs';
import { icon } from './icons.mjs';

/**
 * The footer: the mark and the credit of the text, the languages (the header
 * picker is the other way to switch), and the way back to the top for a reader
 * without JavaScript or without the floating button of the client.
 *
 * @param {object} model
 * @param {import('../languages.mjs').Language} model.lang The page's language.
 * @param {import('../languages.mjs').Language[]} model.languages
 * @param {Record<string, string>} model.ui
 * @returns {string}
 */
export function renderFooter({ lang, languages, ui }) {
  const links = languages.map((other) => {
    const current = other.code === lang.code;
    return `<li><a href="../${other.code}/" hreflang="${other.htmlLang}" lang="${other.htmlLang}" dir="${other.dir}" data-lang="${other.code}"${current ? ' aria-current="true"' : ''}>${escapeHtml(other.name)}</a></li>`;
  });
  return `<footer class="site-footer">
  <div class="footer-inner">
    <img class="footer-mark" src="../favicon.svg" alt="" width="40" height="40">
    <p class="footer-credit">${escapeHtml(ui.credit)}</p>
    <a class="btn footer-top" href="#top">${icon('arrow-up')}${escapeHtml(ui.top)}</a>
    <nav class="footer-langs" aria-label="${escapeHtml(ui.language)}"><ul>${links.join('')}</ul></nav>
  </div>
</footer>`;
}
