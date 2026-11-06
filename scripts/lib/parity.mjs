import { parseFenceLine, parseInfo } from './markdown/container-syntax.mjs';
import { classifyLines } from './markdown/fences.mjs';

// Dependency-free: the content linter runs without `marked`.

/**
 * @typedef {object} Scan
 * @property {string[]} lines The lines with fenced code blanked out: what the
 *   pattern rules read (a comment is not published, but it is public).
 * @property {string[]} structure The same with HTML comments blanked out as
 *   well: what the blocks, ids and counts are read from, because a comment
 *   renders as nothing.
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
  const raw = text.split('\n');
  const kinds = classifyLines(raw);
  const lines = raw.map((line, index) => (kinds[index] === 'code' ? '' : line));
  const structure = raw.map((line, index) =>
    kinds[index] === 'text' ? line : '',
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
  return { lines, structure, inLocal, locals };
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
