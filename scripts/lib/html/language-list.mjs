import { escapeHtml } from './escape.mjs';
import { icon } from './icons.mjs';

/**
 * The language chooser of the root page and of the 404 page: one large link
 * per language, each written in its own language (`lang` and `dir` say so).
 *
 * @param {import('../languages.mjs').Language[]} languages The published
 *   ones.
 * @param {object} options
 * @param {string} options.prefix The way to the language folders: nothing
 *   from the root page, the site's path from the 404 page (which GitHub Pages
 *   serves for an address of any depth).
 * @param {(lang: import('../languages.mjs').Language) => string} [options.detail]
 *   A second line for each link, in that link's language.
 * @returns {string}
 */
export function renderLanguageList(languages, { prefix, detail }) {
  const items = languages.map((lang) => {
    const second = detail
      ? `<span class="root-lang-detail">${escapeHtml(detail(lang))}</span>`
      : '';
    return `<li><a href="${prefix}${lang.code}/" hreflang="${lang.htmlLang}" lang="${lang.htmlLang}" dir="${lang.dir}"><span class="root-lang-text"><span class="root-lang-name">${escapeHtml(lang.name)}</span>${second}</span>${icon('arrow-right')}</a></li>`;
  });
  return `<ul class="root-langs">${items.join('')}</ul>`;
}
