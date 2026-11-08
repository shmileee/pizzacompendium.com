import { escapeHtml } from '../html/escape.mjs';
import { BEGINNER } from './flour.mjs';

/**
 * The filter above a list of cards that are marked: "All" and "For
 * beginners". The buttons and the count are for scripts (`src/js/cards.js`
 * shows the group and makes it work); without one the list is simply whole.
 * The status text has `{shown}` and `{total}` where the numbers go.
 *
 * @param {Record<string, string>} ui
 * @returns {string}
 */
const filter = (ui) =>
  `<div class="cards-filter" role="group" aria-label="${escapeHtml(ui.filterLabel)}" data-cards-filter data-status="${escapeHtml(ui.filterStatus)}" hidden><button type="button" class="btn" data-filter="all" aria-pressed="true">${escapeHtml(ui.filterAll)}</button><button type="button" class="btn" data-filter="${BEGINNER}" aria-pressed="false">${escapeHtml(ui.beginner)}</button><p class="cards-status" role="status"></p></div>`;

/**
 * A grid of product cards (`::: flour` blocks, nothing else). When some of
 * the cards carry a level the grid brings the filter for it.
 */
export default {
  name: 'flours',
  title: 'none',
  render({ tokens, ui, error, body }) {
    const cards = tokens.filter((token) => token.type !== 'space');
    for (const token of cards)
      if (token.type !== 'container' || token.name !== 'flour')
        error(
          'E_BLOCK_CONTENT',
          'a flours block holds flour cards and nothing else',
          token.line,
        );
    const marked = cards.some((card) => card.attrs?.level === BEGINNER);
    return `<div class="cards-wrap">${marked ? filter(ui) : ''}<ul class="cards" role="list">${body()}</ul></div>\n`;
  },
  markdown: ({ body }) => body,
};
