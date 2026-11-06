/**
 * The text of rendered inline HTML: tags dropped, entities left as they are
 * (the HTML is already escaped, so nothing may be escaped a second time).
 *
 * @param {string} html
 * @returns {string}
 */
export const stripTags = (html) => html.replace(/<[^>]+>/g, '');

/**
 * Splits `Title {#the-id}` into the title and the id. The id is whatever
 * stands between the last `{#` and the closing `}` that ends the text; it
 * may be empty or wrong, which is for the caller to judge. (Looked for with
 * `lastIndexOf`, not with one regular expression: a long run of spaces or
 * braces cannot make that quadratic.)
 *
 * @param {string} text The text of a heading.
 * @returns {{ label: string, id: string } | null} Null when the text does not
 *   end in `{#...}`.
 */
export function splitHeadingId(text) {
  const body = text.trimEnd();
  const at = body.lastIndexOf('{#');
  if (!body.endsWith('}') || at < 0) return null;
  const id = body.slice(at + 2, -1);
  if (id.includes('}')) return null;
  return { label: body.slice(0, at).trimEnd(), id };
}

const LEAKS = [
  [':::', /(?:^|\n)\s*(:{3,}[^\n]*)/],
  ['{#', /(\{#[^\n]*)/],
  ['![', /(!\[[^\n]*)/],
];

/**
 * Authoring syntax that survived rendering: a leftover `:::` fence, a
 * `{#id}` or an image that was never turned into a figure. Code samples are
 * allowed to contain them.
 *
 * @param {string} html
 * @returns {{ kind: string, excerpt: string }[]} What leaked, one entry per
 *   kind, with the start of the leaked text.
 */
export function findLeaks(html) {
  const text = stripTags(html.replace(/<(pre|code)\b[\s\S]*?<\/\1>/g, ''));
  return LEAKS.flatMap(([kind, pattern]) => {
    const found = pattern.exec(text);
    return found ? [{ kind, excerpt: found[1].slice(0, 40) }] : [];
  });
}
