import { parseFenceLine, parseInfo } from './markdown/container-syntax.mjs';
import { classifyLines } from './markdown/fences.mjs';

// Dependency-free: the content linter runs without `marked`.

/**
 * @typedef {object} Scan
 * @property {string[]} lines The lines as written: what the pattern rules
 *   read (a comment is not published, but it is public, and fenced code is
 *   refused, so nothing is left out).
 * @property {string[]} structure The same with fenced code and HTML comments
 *   blanked out: what the blocks, ids and counts are read from, because a
 *   comment renders as nothing and code renders as it is.
 * @property {number[]} codeStarts 0-based lines that open fenced code (the
 *   first of two blocks that touch only).
 * @property {boolean[]} inLocal Is the line inside a `::: local` block?
 * @property {{ start: number, end: number, info: string }[]} locals The local
 *   blocks: 0-based first and last line, and what follows `local` on the
 *   opening line.
 */

/**
 * Reads the shape of a section without rendering it: which lines are code or
 * comments and which are inside a `::: local` block (a note for one country
 * that the other languages do not have, so it takes no part in the
 * comparison).
 *
 * @param {string} text Normalised Markdown.
 * @returns {Scan}
 */
export function scan(text) {
  const lines = text.split('\n');
  const kinds = classifyLines(lines);
  const structure = lines.map((line, index) =>
    kinds[index] === 'text' ? line : '',
  );
  const codeStarts = kinds.flatMap((kind, index) =>
    kind === 'code' && kinds[index - 1] !== 'code' ? [index] : [],
  );
  const inLocal = structure.map(() => false);
  const locals = [];
  const open = [];
  structure.forEach((line, index) => {
    const fence = parseFenceLine(line);
    if (fence?.kind === 'open') {
      open.push({ name: fence.name, start: index, info: fence.info });
    } else if (fence?.kind === 'close' && open.length > 0) {
      const block = open.pop();
      if (block.name === 'local') {
        for (let at = block.start; at <= index; at++) inLocal[at] = true;
        locals.push({ start: block.start, end: index, info: block.info });
      }
    }
  });
  return { lines, structure, codeStarts, inLocal, locals };
}

// What a line starts with before its text: quote markers, list markers and
// the spaces around them. `- `, `1. `, `  > `, `- 1. `.
const PREFIX = /^(?:[ \t]*(?:>|(?:[-*+]|\d{1,9}[.)])(?=[ \t]|$)))*[ \t]*/;
const LIST_MARKER = /(?:[-*+]|\d{1,9}[.)])(?=[ \t]|$)/g;
const HEADING = /^#{1,6}(?:[ \t]|$)/;
const CODE_FENCE = /^(?:`{3,}|~{3,})/;
const SETEXT = /^ {0,3}(?:=+|-+)[ \t]*$/;
const CLOSING_HASHES = /^ {0,3}#{1,6}[ \t].*[ \t]#+[ \t]*$/;
const SPACED_RULE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const TABLE_DELIMITER =
  /^\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;
const LINK_DEFINITION = /^\[[^\]]*\]:/;

/**
 * The Markdown that `marked` reads and the outline above does not: a line
 * of structure (a heading, a block fence, a table row, a list item) that
 * the outline would not count, or count as something else. Every such form
 * is refused, so that for every text that passes, the outline is exact:
 * structure drift cannot hide in it, and every id and link is seen.
 *
 *   code-block                  fenced code anywhere (top-level code is in
 *                               `codeStarts`), an indented code fence
 *   setext-heading              a line of `===` or `---` under text
 *   closing-hashes              `## Title {#id} ##`
 *   blockquote                  `> text`, in a list too
 *   nested-structure            a heading, `:::` or a table that does not
 *                               start at the beginning of its line
 *   plus-bullet, paren-list     `+ item`, `1) item`
 *   stacked-list-marker         `- 1. item`: two list items on one line
 *   spaced-rule                 `- - -`, `* * *` (it would count as an item)
 *   table-without-leading-pipe  a table row that does not start with `|`,
 *                               or a line that runs on from a table
 *   link-definition             `[r]: #id`, which reference links point at
 *
 * @param {Scan} scanned
 * @returns {{ index: number, form: string }[]} 0-based lines.
 */
export function unsupportedForms({ structure }) {
  const found = [];
  let table = false;
  structure.forEach((line, index) => {
    const form = formOf(line, structure[index - 1] ?? '', table);
    if (line.trim() === '') table = false;
    else if (!form && isDelimiterRow(line)) table = true;
    if (form) found.push({ index, form });
  });
  return found;
}

/** A table's delimiter row (`|---|:-:|`), wherever it is written. */
const isDelimiterRow = (rest) =>
  rest.includes('|') && rest.includes('-') && TABLE_DELIMITER.test(rest);

/**
 * @param {string} line
 * @param {string} previous The line before it.
 * @param {boolean} table Is the line inside a table (below its delimiter)?
 * @returns {string | null} The form, or null for a line that is fine.
 */
function formOf(line, previous, table) {
  if (line.trim() === '') return null;
  if (table) return line.startsWith('|') ? null : 'table-without-leading-pipe';
  if (SETEXT.test(line) && previous.trim() !== '') return 'setext-heading';
  if (CLOSING_HASHES.test(line)) return 'closing-hashes';
  if (SPACED_RULE.test(line))
    return /\s/.test(line.trim()) ? 'spaced-rule' : null;
  const prefix = PREFIX.exec(line)[0];
  const rest = line.slice(prefix.length);
  const markers = prefix.match(LIST_MARKER) ?? [];
  if (CODE_FENCE.test(rest) && prefix) return 'code-block';
  if (prefix.includes('>')) return 'blockquote';
  if (LINK_DEFINITION.test(rest)) return 'link-definition';
  if (markers.length > 1) return 'stacked-list-marker';
  if (markers.some((marker) => marker === '+')) return 'plus-bullet';
  if (markers.some((marker) => marker.endsWith(')'))) return 'paren-list';
  if (prefix && (HEADING.test(rest) || rest.startsWith(':::')))
    return 'nested-structure';
  if (isDelimiterRow(rest)) {
    if (prefix) return 'nested-structure';
    if (!line.startsWith('|') || !previous.startsWith('|'))
      return 'table-without-leading-pipe';
  }
  return null;
}

/**
 * The text without its `::: local` blocks (and the blank line after each):
 * what a translation has to follow, since a local note belongs to one
 * language only.
 *
 * @param {string} text Normalised Markdown.
 * @returns {string}
 */
export function withoutLocalBlocks(text) {
  const { locals } = scan(text);
  const lines = text.split('\n');
  const dropped = new Set();
  for (const { start, end } of locals) {
    for (let index = start; index <= end; index++) dropped.add(index);
    if (lines[end + 1] === '') dropped.add(end + 1);
  }
  return lines.filter((_, index) => !dropped.has(index)).join('\n');
}

/**
 * What every language must have in common for one section.
 *
 * @typedef {object} Outline
 * @property {number} fences Lines that open or close a block.
 * @property {string[]} blocks What opens each block, in order: its name and
 *   its attributes (`flour img=x.webp level=beginner`), never its title, and
 *   not its `#id`, which `ids` compares.
 * @property {string[]} ids Heading and FAQ ids, in order.
 * @property {string[]} headings `level:id` of every heading, in order.
 * @property {number} images
 * @property {number} links
 * @property {number} tableRows
 * @property {number} listItems
 */

/**
 * `flour img=x.webp level=beginner`: a block's name and its attributes in
 * alphabetical order, so that the order they are written in does not matter.
 *
 * @param {string} name
 * @param {Record<string, string>} attrs As `parseInfo` reads them.
 * @returns {string}
 */
const blockSignature = (name, attrs) =>
  [
    name,
    ...Object.keys(attrs)
      .filter((key) => key !== 'id')
      .sort()
      .map((key) => `${key}=${attrs[key]}`),
  ].join(' ');

/**
 * @param {Scan} scanned
 * @returns {Outline}
 */
export function outline({ structure, inLocal }) {
  const out = {
    fences: 0,
    blocks: [],
    ids: [],
    headings: [],
    images: 0,
    links: 0,
    tableRows: 0,
    listItems: 0,
  };
  structure.forEach((line, index) => {
    if (inLocal[index]) return;
    const fence = parseFenceLine(line);
    if (fence) out.fences++;
    if (fence?.kind === 'open') {
      const { attrs } = parseInfo(fence.info);
      out.blocks.push(blockSignature(fence.name, attrs));
      if (fence.name === 'q' && attrs.id) out.ids.push(attrs.id);
    }
    const heading = /^ {0,3}(#{1,6})\s+.*\{#([\w-]+)\}\s*$/.exec(line);
    if (heading) {
      out.ids.push(heading[2]);
      out.headings.push(`${heading[1].length}:${heading[2]}`);
    }
    out.images += (line.match(/!\[/g) || []).length;
    out.links +=
      (line.match(/\]\(/g) || []).length -
      (line.match(/!\[[^\]]*\]\(/g) || []).length;
    if (/^\|/.test(line)) out.tableRows++;
    if (/^\s*([-*]|\d+\.)\s+\S/.test(line)) out.listItems++;
  });
  return out;
}

const COUNTED = [
  ['fences', 'parity-fences', 'block fences'],
  ['images', 'parity-images', 'images'],
  ['links', 'parity-links', 'links'],
  ['tableRows', 'parity-table-rows', 'table rows'],
  ['listItems', 'parity-list-items', 'list items'],
];

/**
 * Where a translation's section differs in structure from the source's.
 *
 * @param {Outline} source
 * @param {Outline} other
 * @returns {{ rule: string, message: string }[]}
 */
export function compareOutlines(source, other) {
  const problems = [];
  for (const [key, rule, label] of COUNTED)
    if (source[key] !== other[key])
      problems.push({
        rule,
        message: `${label} differ: source ${source[key]}, here ${other[key]}`,
      });
  // A block that carries an attribute in one language (`level=beginner`) must
  // carry it in the others, on the same card: the first difference is named.
  const count = Math.max(source.blocks.length, other.blocks.length);
  const at = Array.from({ length: count }, (_, index) => index).find(
    (index) => source.blocks[index] !== other.blocks[index],
  );
  if (at !== undefined)
    problems.push({
      rule: 'parity-attributes',
      message: `block ${at + 1} differs: source "${source.blocks[at] ?? 'none'}", here "${other.blocks[at] ?? 'none'}"`,
    });
  if (source.ids.join() !== other.ids.join())
    problems.push({
      rule: 'parity-ids',
      message: `ids or their order differ: source [${source.ids.join(' ')}], here [${other.ids.join(' ')}]`,
    });
  if (source.headings.join() !== other.headings.join())
    problems.push({
      rule: 'parity-headings',
      message: 'heading levels or ids differ from the source',
    });
  return problems;
}
