import { Marked } from 'marked';
import * as builtinBlocks from '../blocks/index.mjs';
import { containerExtension } from './containers.mjs';
import { splitHeadingId } from './text.mjs';

/** A translator's note: never published. */
const COMMENT = /<!--[\s\S]*?-->/g;

/**
 * The text without its translator's notes. One pass is not enough: taking a
 * note out can join what was around it into a new one (`<!<!-- a -->-- b -->`
 * leaves `<!-- b -->`), so notes are taken out until none is left. An opening
 * `<!--` that nothing closes is text on the page (the renderer escapes it),
 * and is written as text here too, so that no reader of the copy takes the
 * rest of the section for a comment.
 *
 * @param {string} text
 * @returns {string}
 */
export function dropNotes(text) {
  let out = text;
  for (let before = ''; out !== before; ) {
    before = out;
    out = out.replace(COMMENT, '');
  }
  return out.replaceAll('<!--', '&lt;!--');
}

/**
 * The Markdown copy of a language page (`<code>/index.md`): the same text as
 * the page, for programs that read the guide rather than show it (language
 * models, search tools, agents). It is plain Markdown that any reader
 * understands: every `:::` block becomes what it means (a question becomes a
 * heading with its answer under it, a note a quotation, a card its name and
 * bullets, a `local` note appears only in its own language), headings lose
 * their `{#id}`, translator notes are dropped, and every link and picture
 * gets its full address, so that a passage quoted on its own still leads
 * back to the right place on the page.
 *
 * The text is read with the lexer of the page renderer, so the two cannot
 * disagree about where a block or a code sample starts. Mistakes in the text
 * are the page renderer's to report: this copy only has to get through them
 * without throwing (an unknown block is left out).
 *
 * @param {object} options
 * @param {{ code: string }} options.lang
 * @param {Record<string, string>} options.ui
 * @param {string} options.url The address of the language page, ending in `/`.
 * @param {string} options.siteUrl The address of the site, without a `/`.
 * @param {Record<string, any>} [options.blocks] Defaults to `blocks/`.
 * @returns {{ render: (text: string) => string }}
 */
export function createMarkdownCopy({
  lang,
  ui,
  url,
  siteUrl,
  blocks = builtinBlocks,
}) {
  const registry = new Map(
    Object.values(blocks).map((block) => [block.name, block]),
  );
  const marked = new Marked({ gfm: true });
  marked.use({ extensions: [containerExtension(() => '')] });
  /**
   * Full addresses for `#id` links and `img/` pictures, inline (`](#id)`) or
   * defined once (`[ref]: #id`); notes dropped.
   */
  const absolute = (text) =>
    dropNotes(text)
      .replace(/\](\(|:[ \t]*)#/g, `]$1${url}#`)
      .replace(/\](\(|:[ \t]*)img\//g, `]$1${siteUrl}/img/`);
  /** The level of the last heading: a question goes one below it. */
  let depth = 1;

  function lower(tokens) {
    return tokens
      .map((token) => {
        if (token.type === 'container') {
          const block = registry.get(token.name);
          return block
            ? block.markdown({
                attrs: token.attrs,
                title: absolute(token.title),
                body: lower(token.tokens),
                lang,
                ui,
                depth,
              })
            : '';
        }
        if (token.type === 'heading') {
          depth = token.depth;
          const label = splitHeadingId(token.text)?.label ?? token.text;
          return `${'#'.repeat(token.depth)} ${absolute(label)}`;
        }
        if (token.type === 'space' || token.type === 'html') return '';
        if (token.type === 'code') return token.raw.trim();
        return absolute(token.raw).trim();
      })
      .filter(Boolean)
      .join('\n\n');
  }

  return {
    /**
     * @param {string} text One section, normalised Markdown.
     * @returns {string} Its Markdown copy, without a final new line; empty
     *   when the text cannot be read at all (the page renderer reports it).
     */
    render(text) {
      depth = 1;
      try {
        return lower(marked.lexer(text));
      } catch {
        return '';
      }
    },
  };
}

/**
 * The whole Markdown copy: the title, the description, the address of the
 * page and the date of the text, the sections, and the credit at the end.
 *
 * @param {object} parts
 * @param {string} parts.title
 * @param {string} parts.description
 * @param {string} parts.url
 * @param {string} [parts.updated] The "updated" line, date filled in.
 * @param {string} [parts.note] The translation note of the language.
 * @param {string[]} parts.sections Markdown of each section.
 * @param {string} parts.credit
 * @returns {string}
 */
export const markdownDocument = ({
  title,
  description,
  url,
  updated,
  note,
  sections,
  credit,
}) =>
  `${[
    `# ${title}`,
    `> ${description}`,
    [`<${url}>`, updated].filter(Boolean).join('\\\n'),
    note && `*${note}*`,
    ...sections,
    '---',
    credit,
  ]
    .filter(Boolean)
    .join('\n\n')}\n`;
