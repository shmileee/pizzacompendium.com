import { uiText } from './escape.mjs';
import { icon } from './icons.mjs';

/**
 * The strings `src/js/search.js` needs while it fills the list, one data
 * attribute of the dialog each: the attribute and the `ui` key it carries.
 */
const SCRIPT_STRINGS = [
  ['count', 'searchCount'],
  ['browse', 'searchBrowse'],
  ['none', 'searchNone'],
  ['section', 'searchSection'],
  ['question', 'searchQuestion'],
  ['text', 'searchText'],
];

/**
 * The search of the page, as `renderHeader` prints it in front of the other
 * header buttons: the button that opens it and the modal `<dialog>` it opens
 * (a modal dialog is drawn on top of the page wherever it stands in the
 * markup). Both work with JavaScript only: the stylesheet shows the button
 * once the page is marked scripted, and a closed dialog is not drawn.
 * `src/js/search.js` builds an index of the page the first time the dialog is
 * opened and fills `#pc-search-results`; everything else is here, in the
 * language of the page. The text of the button's keyboard hint (`data-search-kbd`)
 * depends on the visitor's system and is written by the script.
 *
 * The text ends with a line break and the indentation of the next button, so
 * that the page's source stays readable.
 *
 * @param {object} model The same model as `renderHeader`.
 * @param {Record<string, string>} model.ui
 * @returns {string}
 */
export function renderSearch({ ui }) {
  const text = uiText(ui);
  const strings = SCRIPT_STRINGS.map(
    ([name, key]) => ` data-${name}="${text(key)}"`,
  ).join('');
  return `<button type="button" class="btn btn-quiet search-btn" data-search-open aria-haspopup="dialog" aria-keyshortcuts="Control+K Meta+K">${icon('search')}<span class="search-btn-label">${text('search')}</span><kbd class="search-kbd" aria-hidden="true" data-search-kbd></kbd></button>
      <dialog class="search" id="pc-search" aria-labelledby="pc-search-label"${strings}>
        <div class="search-bar">
          <div class="search-field">
            ${icon('search')}
            <label class="visually-hidden" id="pc-search-label" for="pc-search-input">${text('searchLabel')}</label>
            <input class="search-input" id="pc-search-input" type="text" inputmode="search" role="combobox" aria-expanded="true" aria-controls="pc-search-results" aria-autocomplete="list" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="go" maxlength="100" placeholder="${text('searchLabel')}" autofocus>
          </div>
          <button type="button" class="btn btn-quiet btn-icon search-close" data-search-close aria-label="${text('searchClose')}">${icon('close')}</button>
        </div>
        <p class="search-caption" data-search-caption aria-hidden="true"></p>
        <ul class="search-results" id="pc-search-results" role="listbox" tabindex="-1" aria-label="${text('searchResults')}" hidden></ul>
        <p class="visually-hidden" id="pc-search-status" role="status"></p>
      </dialog>
      `;
}
