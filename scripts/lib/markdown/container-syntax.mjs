// The `:::` syntax, written once. The renderer (which has `marked`) and the
// content linter (which has not) both read a fence line through this file, so
// they cannot disagree about what is a block. Dependency-free on purpose.

const COLONS = /^:{3,}/;
const NAME = /^[^\s:]\S*/;
const ATTRIBUTE = /^(#[\w-]+|(?!id=)[\w-]+=\S+)(?:\s+|$)/;

const isBlank = (char) => char === ' ' || char === '\t';

/** Strips trailing spaces and tabs (a loop: no regex can go quadratic). */
function trimBlanks(text) {
  let end = text.length;
  while (end > 0 && isBlank(text[end - 1])) end--;
  let start = 0;
  while (start < end && isBlank(text[start])) start++;
  return text.slice(start, end);
}

/**
 * Reads one line of a document as a block fence.
 *
 *   `::: name #id key=value Title`   opens a block (at least three colons)
 *   `:::`                            closes the innermost open block
 *
 * @param {string} line
 * @returns {{ kind: 'close', colons: number }
 *   | { kind: 'open', colons: number, name: string, info: string }
 *   | null} Null for a line that is no fence at all. `info` is what follows
 *   the name, for `parseInfo`.
 */
export function parseFenceLine(line) {
  const colons = COLONS.exec(line)?.[0].length;
  if (!colons) return null;
  const rest = trimBlanks(line.slice(colons));
  if (rest === '') return { kind: 'close', colons };
  const name = NAME.exec(rest)?.[0];
  const info = name === undefined ? '' : rest.slice(name.length);
  if (name === undefined || (info !== '' && !isBlank(info[0]))) return null;
  return { kind: 'open', colons, name, info: trimBlanks(info) };
}

/**
 * `#faq-id img=x.webp The title` becomes `{ attrs, title }`: the attributes
 * come first, the title is the rest. `id=...` is not an attribute, the id is
 * always written `#id`, so that there is one way to spell it.
 *
 * @param {string} info
 * @returns {{ attrs: Record<string, string>, title: string }}
 */
export function parseInfo(info) {
  const attrs = {};
  let title = info;
  for (
    let match = ATTRIBUTE.exec(title);
    match;
    match = ATTRIBUTE.exec(title)
  ) {
    const token = match[1];
    if (token.startsWith('#')) {
      attrs.id = token.slice(1);
    } else {
      const at = token.indexOf('=');
      attrs[token.slice(0, at)] = token.slice(at + 1);
    }
    title = title.slice(match[0].length);
  }
  return { attrs, title: title.trim() };
}
