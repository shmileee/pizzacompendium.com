import { escapeHtml } from '../html/escape.mjs';
import { icon } from '../html/icons.mjs';

/** The one level a card can be marked with: `level=beginner`. */
export const BEGINNER = 'beginner';

/**
 * The longest a bullet may be and still be a fact. The facts of the guide
 * (`strength W330`, `Tipo 1 (stone-ground)`) are at most 30 characters in any
 * language; the shortest sentence among the notes is 59.
 */
const FACT_MAX = 32;

/** A fact is short and holds a number: a strength, a protein share, a type. */
const isFact = (text) => text.length <= FACT_MAX && /\p{Nd}/u.test(text);

/**
 * How many bullets at the start of a card are facts, which the stylesheet
 * draws as chips above the notes. Style by shape, not by words: the same rule
 * works in every language. The bullets keep their order, so the first one
 * that is not a fact ends the run.
 *
 * @param {string[]} texts The text of each bullet, in order.
 * @returns {number}
 */
export function factCount(texts) {
  const first = texts.findIndex((text) => !isFact(text));
  return first < 0 ? texts.length : first;
}

/**
 * The bullets of a card. A card holds one list of single lines (or nothing)
 * and no other text; anything else is reported, never dropped without a word.
 *
 * @param {any[]} tokens The tokens of the block.
 * @param {number} line
 * @param {(code: string, message: string, line: number) => void} error
 * @returns {any[]} The list items; none when the body is not usable.
 */
function bullets(tokens, line, error) {
  const content = tokens.filter((token) => token.type !== 'space');
  if (content.length === 0) return [];
  const [list] = content;
  const usable =
    content.length === 1 &&
    list.type === 'list' &&
    !list.ordered &&
    list.items.every(
      (item) =>
        !item.task &&
        item.tokens.length === 1 &&
        item.tokens[0].type === 'text',
    );
  if (!usable)
    error(
      'E_BLOCK_CONTENT',
      'a flour card holds one bullet list of single lines and nothing else',
      line,
    );
  return usable ? list.items : [];
}

/**
 * One product card: a title, an optional `img=<file>` (a packshot on a plate),
 * an optional `level=beginner` (a badge, and what the filter above the cards
 * looks at) and a bullet list. The first bullets that are facts become chips
 * (`factCount`), the others stay lines.
 */
export default {
  name: 'flour',
  attrs: { img: 'optional', level: 'optional' },
  title: 'required',
  parent: 'flours',
  render({ attrs, title, line, tokens, ui, inline, image, error }) {
    if (attrs.level !== undefined && attrs.level !== BEGINNER)
      error(
        'E_BLOCK_ATTR',
        `"level" may only be "${BEGINNER}", not "${attrs.level}"`,
        line,
      );
    const marked = attrs.level === BEGINNER;
    const img = attrs.img ? image(`img/${attrs.img}`, '', line, 'card') : '';
    const items = bullets(tokens, line, error);
    const facts = factCount(items.map((item) => item.text));
    const list =
      items.length > 0
        ? `<ul class="card-list" role="list">${items
            .map(
              (item, at) =>
                `<li${at < facts ? ' class="card-fact"' : ''}>${inline(item.text, item.line)}</li>`,
            )
            .join('')}</ul>`
        : '';
    const badge = marked
      ? `<p class="card-badge"><span class="badge badge-good">${icon('sprout')}${escapeHtml(ui.beginner)}</span></p>`
      : '';
    return `<li class="card"${marked ? ` data-level="${BEGINNER}"` : ''}>${img ? `<div class="card-img">${img}</div>` : ''}<div class="card-body"><p class="card-title">${inline(title, line).replaceAll(' / ', ' / ')}</p>${badge}${list}</div></li>\n`;
  },
};
