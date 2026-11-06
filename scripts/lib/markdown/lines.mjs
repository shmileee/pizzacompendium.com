const countNewlines = (text) => text.split('\n').length - 1;

/**
 * `marked` does not say where a token came from. Every token's `raw` is the
 * exact slice of the source it consumed, so the siblings of a list add up to
 * their parent's text and a token starts on the line after the newlines of
 * everything before it. This stamps the 1-based `line` onto every token (the
 * text of list items and quotes keeps its lines, only the markers go).
 *
 * `marked` rewrites the text of a quote before it reads it, and the `raw` of
 * what is inside no longer adds up to the source (a lazy continuation line
 * gains a newline). So no token is put after the last line of the block that
 * holds it: a line may be a little early there, never outside the text.
 *
 * @param {any[]} tokens
 * @param {number} line The line of the first token.
 * @param {number} [last] The last line the tokens may be on.
 * @returns {void}
 */
export function stampLines(tokens, line, last = Number.POSITIVE_INFINITY) {
  let at = line;
  for (const token of tokens) {
    token.line = Math.min(at, last);
    // A container's body starts below its opening line.
    const inner = token.type === 'container' ? token.line + 1 : token.line;
    const end = token.line + countNewlines(token.raw.trimEnd());
    if (token.tokens) stampLines(token.tokens, inner, end);
    if (token.items) stampLines(token.items, inner, end);
    if (token.type === 'table') {
      for (const cell of token.header) stampLines(cell.tokens, token.line, end);
      token.rows.forEach((row, index) => {
        for (const cell of row)
          stampLines(cell.tokens, token.line + 2 + index, end);
      });
    }
    at += countNewlines(token.raw);
  }
}

/**
 * The line (1-based) inside a block where some text stands, for a diagnostic
 * about the rendered output: the first line of the block that holds it, else
 * the first line of the block.
 *
 * @param {string[]} lines The lines of the document.
 * @param {{ line: number, raw: string }} block A stamped top-level token.
 * @param {string} needle The start of the text that was found.
 * @returns {number}
 */
export function lineInBlock(lines, block, needle) {
  const count = countNewlines(block.raw.trimEnd()) + 1;
  const found = lines
    .slice(block.line - 1, block.line - 1 + count)
    .findIndex((line) => line.includes(needle));
  return block.line + Math.max(found, 0);
}
