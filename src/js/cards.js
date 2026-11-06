// The filter above the flour cards: every card, or only the ones
// that suit a beginner. Without this script the filter stays hidden and every
// card is shown.
import { query, queryAll } from './util.js';

/**
 * Does a card of this level stay visible under this filter?
 *
 * @param {string | undefined} level `data-level` of the card, if it has one.
 * @param {string} filter `data-filter` of the pressed button: `all` or a level.
 * @returns {boolean}
 */
export const isShown = (level, filter) => filter === 'all' || level === filter;

/**
 * The status line ("Showing 6 of 20"): the text of the page, with the numbers
 * where it has `{shown}` and `{total}`.
 *
 * @param {string} template
 * @param {number} shown
 * @param {number} total
 * @returns {string}
 */
export const statusText = (template, shown, total) =>
  template.replace('{shown}', shown).replace('{total}', total);

/**
 * One filter: its buttons show or hide the cards of its own list (`hidden`),
 * keep `aria-pressed` right and say how many cards are shown. The group is
 * revealed last, once it works.
 */
function wireFilter(group) {
  const cards = queryAll('.card', group.closest('.cards-wrap'));
  const buttons = queryAll('[data-filter]', group);
  const status = query('.cards-status', group);
  const apply = (filter) => {
    for (const card of cards)
      card.hidden = !isShown(card.dataset.level, filter);
    for (const button of buttons)
      button.setAttribute(
        'aria-pressed',
        String(button.dataset.filter === filter),
      );
    status.textContent = statusText(
      group.dataset.status,
      cards.filter((card) => !card.hidden).length,
      cards.length,
    );
  };
  for (const button of buttons)
    button.addEventListener('click', () => apply(button.dataset.filter));
  apply('all');
  group.hidden = false;
}

/**
 * Wires every flour filter of the page (there may be none).
 *
 * @param {Document} [root]
 */
export function init(root = document) {
  for (const group of queryAll('[data-cards-filter]', root)) wireFilter(group);
}
