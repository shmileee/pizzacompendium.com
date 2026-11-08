import { plainText, splitHeadingId } from '../markdown/text.mjs';

/** An ISO 8601 duration of days, hours and minutes: `PT24H`, `P2DT3H`. */
const DURATION = /^P(?=\d|T\d)(?:\d+D)?(?:T(?=\d)(?:\d+H)?(?:\d+M)?)?$/;

/** A cell that is nothing but bold text: the total of a table, not a row. */
const isTotal = (cell) =>
  cell.tokens.length === 1 && cell.tokens[0].type === 'strong';

/**
 * A recipe. The text it wraps is shown exactly as it would be without the
 * block (no markup of its own); the block reads it as data for the `Recipe`
 * of the page's structured data, so the data cannot say anything the page
 * does not:
 *
 *   name          the first heading in the block (and its id, the address
 *                 of the recipe)
 *   description   the first paragraph
 *   ingredients   the rows of the first table, "amount ingredient" from its
 *                 first two columns; a row whose first cell is all bold (a
 *                 total) is no ingredient
 *   steps         the items of the first numbered list
 *   time=PT24H    the total time, an ISO 8601 duration (optional)
 *
 *   ::: recipe time=PT24H
 *   ### Basic recipe {#recipe}
 *   ...
 *   :::
 */
export default {
  name: 'recipe',
  attrs: { time: 'optional' },
  title: 'none',
  render({ attrs, line, tokens, inline, body, error, record }) {
    const html = body();
    const text = (markdown, at) => plainText(inline(markdown, at));
    const heading = tokens.find((token) => token.type === 'heading');
    const named = heading && splitHeadingId(heading.text);
    const paragraph = tokens.find((token) => token.type === 'paragraph');
    const table = tokens.find((token) => token.type === 'table');
    const list = tokens.find((token) => token.type === 'list' && token.ordered);
    if (!named || !table || table.header.length < 2 || !list) {
      error(
        'E_BLOCK_CONTENT',
        'a recipe holds a heading, a table of ingredients (ingredient, amount) and a numbered list of steps',
        line,
      );
      return html;
    }
    if (attrs.time !== undefined && !DURATION.test(attrs.time)) {
      error(
        'E_BLOCK_ATTR',
        `"time" is an ISO 8601 duration such as PT24H, not "${attrs.time}"`,
        line,
      );
      return html;
    }
    record({
      type: 'recipe',
      id: named.id,
      name: text(named.label, line),
      description: paragraph ? text(paragraph.text, line) : '',
      ingredients: table.rows
        .filter(([first]) => !isTotal(first))
        .map(([ingredient, amount]) =>
          `${text(amount.text, line)} ${text(ingredient.text, line)}`.trim(),
        ),
      steps: list.items.map((item) => text(item.text, line)),
      time: attrs.time ?? null,
    });
    return html;
  },
  markdown: ({ body }) => body,
};
