import { escapeHtml } from './escape.mjs';
import { icon } from './icons.mjs';
import { renderSearch } from './search.mjs';

/**
 * The contents button of narrow screens. The sidebar is the contents list on
 * wide ones, so the stylesheet hides the button there (and without
 * JavaScript, which the list does not need). The table-of-contents module
 * of the client opens and closes the list; this is only the button.
 *
 * @param {Record<string, string>} ui
 * @returns {string}
 */
const renderMenuButton = (ui) =>
  `<button type="button" class="btn btn-quiet menu-btn" id="toc-toggle" aria-expanded="false" aria-controls="toc">${icon('menu')}<span class="menu-label">${escapeHtml(ui.toc)}</span></button>`;

/**
 * The brand: the mark of the site and its title, which the stylesheet leaves
 * out of sight on phones (the name stays for screen readers).
 *
 * @param {import('../languages.mjs').Language} lang
 * @returns {string}
 */
const renderBrand = (lang) =>
  `<a class="brand" href="#top"><img class="brand-mark" src="../favicon.svg" alt="" width="32" height="32"><span class="brand-name">${escapeHtml(lang.title)}</span></a>`;

/**
 * The theme button: auto, light, dark, auto. It holds an icon and a label for
 * each of the three; which one is shown follows `data-theme` on `<html>` (set
 * by the inline script before the first paint and by the client when the
 * button is pressed), so the markup needs no state. Each label says the mode
 * the page is in and the one the next press switches to. A screen reader does
 * not always announce a changed name on the focused button, so the client
 * also says the new label in the empty status line after the button.
 *
 * @param {Record<string, string>} ui
 * @returns {string}
 */
function renderThemeToggle(ui) {
  const modes = [
    ['auto', 'auto', ui.themeAuto],
    ['light', 'sun', ui.themeLight],
    ['dark', 'moon', ui.themeDark],
  ];
  const parts = modes.map(
    ([mode, name, label]) =>
      `${icon(name, `theme-${mode}`)}<span class="visually-hidden theme-${mode}">${escapeHtml(label)}</span>`,
  );
  return `<button type="button" class="btn btn-quiet theme-btn" id="pc-theme">${parts.join('')}</button><span class="visually-hidden" id="pc-theme-status" role="status"></span>`;
}

/**
 * The language picker: a disclosure that lists the published languages by
 * their own names. The button shows the code of the current language on
 * narrow screens and its name on wide ones; both are there for assistive
 * technology, with the word "language" in front.
 *
 * @param {import('../languages.mjs').Language} lang The page's language.
 * @param {import('../languages.mjs').Language[]} languages
 * @param {Record<string, string>} ui
 * @returns {string}
 */
function renderLanguagePicker(lang, languages, ui) {
  const items = languages.map((other) => {
    const current = other.code === lang.code;
    return `<li><a href="../${other.code}/" hreflang="${other.htmlLang}" lang="${other.htmlLang}" dir="${other.dir}" data-lang="${other.code}"${current ? ' aria-current="true"' : ''}>${escapeHtml(other.name)}${current ? icon('check') : ''}</a></li>`;
  });
  return `<details class="lang" id="lang-picker">
        <summary>${icon('globe')}<span class="visually-hidden">${escapeHtml(ui.language)}:</span> <span class="lang-code">${escapeHtml(ui.langCode)}</span> <span class="lang-name">${escapeHtml(lang.name)}</span>${icon('chevron-down', 'lang-chevron')}</summary>
        <ul>${items.join('')}</ul>
      </details>`;
}

/**
 * The sticky header: the contents button (narrow screens), the brand, and on
 * the other side the search (the slot of `renderSearch`), the theme button
 * and the language picker.
 *
 * @param {object} model
 * @param {import('../languages.mjs').Language} model.lang The page's language.
 * @param {import('../languages.mjs').Language[]} model.languages The
 *   published languages, offered in the picker.
 * @param {Record<string, string>} model.ui
 * @returns {string}
 */
export function renderHeader(model) {
  const { lang, languages, ui } = model;
  return `<header class="site-header">
  <div class="header-inner">
    ${renderMenuButton(ui)}
    ${renderBrand(lang)}
    <div class="header-actions">
      ${renderSearch(model)}${renderThemeToggle(ui)}
      ${renderLanguagePicker(lang, languages, ui)}
    </div>
  </div>
</header>`;
}
