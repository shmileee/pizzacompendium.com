import { Marked, Renderer } from 'marked';
import * as builtinBlocks from '../blocks/index.mjs';
import { containerExtension } from './containers.mjs';
import { figureTag, imageTag } from './images.mjs';
import { lineInBlock, stampLines } from './lines.mjs';
import { findLeaks, splitHeadingId, stripTags } from './text.mjs';
import { createTypography, NBSP } from './typography.mjs';

const ID = /^[\w-]+$/;
const LINK = /^#[\w-]+$/;
/** What an attribute value of a block may be made of. */
const ATTRIBUTE_VALUE = /^[\w./-]+$/;
/** One comment and nothing else (the first `-->` ends it). */
const COMMENT = /^<!--(?:(?!-->)[\s\S])*-->\s*$/;

/**
 * One Markdown renderer per language page. It keeps what the page needs to
 * know about its text: the ids used so far (they must be unique), the table
 * of contents, and whether the FAQ toggle has been placed.
 *
 * A block (`::: name`) is described by an object in `blocks/`:
 *
 *   name     the word after `:::`
 *   attrs    allowed attributes, each 'required' or 'optional' (default none)
 *   title    'required', 'optional' (default) or 'none'
 *   parent   the only block it may sit directly in
 *   render   (c) => html, where `c` has the block's `attrs`, `title`,
 *            `line`, `tokens`, `parent` and `body()` (its rendered content),
 *            and the helpers `lang`, `ui`, `inline(text, line)`,
 *            `image(href, alt, line, kind)`, `figure(token, kind)`,
 *            `registerId(id, line)`, `once(key)`, `error(code, msg, line)`
 *
 * @param {object} options
 * @param {{ code: string }} options.lang The language being rendered.
 * @param {Record<string, string>} options.ui
 * @param {{ resolve: (href: string) => any }} options.images
 * @param {import('../diagnostics.mjs').Reporter} options.reporter
 * @param {(id: string) => boolean} [options.isReserved] Is this id one the
 *   page template uses itself? Content may not define it.
 * @param {Record<string, any>} [options.blocks] Defaults to `blocks/`.
 * @returns {{ render: (text: string, file: string) => string, toc: { level: number, id: string, html: string }[] }}
 */
export function createMarkdown({
  lang,
  ui,
  images,
  reporter,
  isReserved = () => false,
  blocks = builtinBlocks,
}) {
  const registry = new Map(
    Object.values(blocks).map((block) => [
      block.name,
      { attrs: {}, title: 'optional', ...block },
    ]),
  );
  const state = {
    file: '',
    toc: [],
    ids: new Map(),
    once: new Set(),
    level: 1,
    parents: [],
    /** The link definitions (`[r]: #id`) of the text being rendered. */
    links: Object.create(null),
  };
  const where = (line) => ({ file: state.file, line });
  const error = (code, message, line) =>
    reporter.error(code, message, where(line));
  const warn = (code, message, line) =>
    reporter.warn(code, message, where(line));

  const marked = new Marked({ gfm: true });
  const typography = createTypography(lang.typography);

  /**
   * Inline Markdown (titles, captions) to HTML, on the given line. It knows
   * the link definitions of the document, as a paragraph does.
   */
  function inline(text, line) {
    const lexer = new marked.Lexer(marked.defaults);
    lexer.tokens.links = state.links;
    const tokens = lexer.inlineTokens(text);
    stampLines(tokens, line);
    return marked.Parser.parseInline(tokens, marked.defaults);
  }

  function image(href, alt, line, kind = 'figure') {
    const found = images.resolve(href);
    if (!found.ok) {
      error(found.code, found.message, line);
      return '';
    }
    return imageTag(found, alt, kind);
  }

  function figure({ href, text, title, line }, kind = 'figure') {
    const caption = title ? inline(title, line) : '';
    const found = images.resolve(href);
    return figureTag(found, image(href, text, line, kind), caption);
  }

  const charsetError = (id, line) =>
    error(
      'E_ID_CHARSET',
      `id "${id}" may use letters, digits, "-" and "_" only`,
      line,
    );

  /**
   * Every id a block puts on the page goes through here: it must be made of
   * letters, digits, `-` and `_` (it is written into an attribute and into
   * links), unique, and not one the page template uses itself. (A heading
   * checks the characters first, because it has no use for an id it cannot
   * write; the rest is the same.)
   */
  function registerId(id, line) {
    const first = state.ids.get(id);
    if (!ID.test(id)) {
      charsetError(id, line);
    } else if (isReserved(id)) {
      error('E_ID_RESERVED', `id "${id}" is used by the page itself`, line);
    } else if (first) {
      error(
        'E_DUP_ID',
        `duplicate id "${id}" (first used at ${first.file}:${first.line})`,
        line,
      );
    } else {
      state.ids.set(id, { file: state.file, line });
    }
  }

  const helpers = {
    lang,
    ui,
    inline,
    image,
    figure,
    registerId,
    error,
    once(key) {
      if (state.once.has(key)) return false;
      state.once.add(key);
      return true;
    },
  };

  /**
   * Checks a block against its description; false when it is unusable. Only
   * an attribute the block declares gets through, and its value is made of
   * letters, digits and `-_./` (a block never receives text that could break
   * out of the markup it is written into).
   */
  function conforms(block, token, parent) {
    const at = token.line;
    let ok = true;
    const reject = (code, message) => {
      error(code, `"${token.name}" ${message}`, at);
      ok = false;
    };
    for (const [name, value] of Object.entries(token.attrs))
      if (!Object.hasOwn(block.attrs, name))
        reject('E_BLOCK_ATTR', `has no "${name}"`);
      else if (!ATTRIBUTE_VALUE.test(value))
        reject(
          'E_BLOCK_ATTR',
          `"${name}" may use letters, digits and - _ . / only`,
        );
    for (const [name, mode] of Object.entries(block.attrs))
      if (mode === 'required' && !Object.hasOwn(token.attrs, name))
        reject('E_BLOCK_ATTR', `needs ${name === 'id' ? '#id' : `${name}=`}`);
    // `id=x` is no attribute (an id is written `#id`), so in the place of one
    // it would silently become part of the title.
    if (token.title.startsWith('id='))
      reject('E_BLOCK_ATTR', 'an id is written #id, not id=');
    // `::: flour Caputo img=x.webp`: an attribute after the title is part of
    // the title, and would be dropped without a word.
    for (const name of Object.keys(block.attrs))
      if (
        name !== 'id' &&
        token.title.split(/\s+/).some((word) => word.startsWith(`${name}=`))
      )
        reject(
          'E_BLOCK_ATTR',
          `has "${name}=" after the title: write it first`,
        );
    if (block.title === 'required' && !token.title)
      reject('E_BLOCK_TITLE', 'needs a title');
    if (block.title === 'none' && token.title)
      reject('E_BLOCK_TITLE', 'takes no title');
    if (block.parent && block.parent !== parent)
      reject('E_BLOCK_PARENT', `must be inside "${block.parent}"`);
    return ok;
  }

  function renderContainer(token, parser) {
    if (token.stray) {
      error(
        'E_BLOCK_STRAY_CLOSE',
        'a ":::" with no block to close',
        token.line,
      );
      return '';
    }
    const block = registry.get(token.name);
    if (!block) {
      error('E_BLOCK_UNKNOWN', `unknown block "${token.name}"`, token.line);
      return '';
    }
    if (token.closeFence === null)
      error('E_BLOCK_UNCLOSED', `"${token.name}" is never closed`, token.line);
    else if (token.closeFence !== token.fence)
      warn(
        'W_BLOCK_FENCE',
        `"${token.name}" opens with ${token.fence} colons and closes with ${token.closeFence}`,
        token.line,
      );
    const parent = state.parents.at(-1);
    if (!conforms(block, token, parent)) return '';
    state.parents.push(token.name);
    const html = block.render({
      ...helpers,
      attrs: token.attrs,
      title: token.title,
      line: token.line,
      tokens: token.tokens,
      parent,
      body: () => parser.parse(token.tokens),
    });
    state.parents.pop();
    return html;
  }

  marked.use({
    extensions: [containerExtension(renderContainer)],
    renderer: {
      // `## Title {#id}`: the id is part of the heading text.
      heading({ depth, text, line }) {
        const found = splitHeadingId(text);
        if (!found) {
          error('E_HEADING_ID', `the heading "${text}" needs an {#id}`, line);
          return '';
        }
        const { label, id } = found;
        if (!ID.test(id)) {
          charsetError(id, line);
          return '';
        }
        if (!label) {
          error('E_HEADING_EMPTY', `the heading {#${id}} has no text`, line);
          return '';
        }
        registerId(id, line);
        if (depth === 1)
          warn('W_H1', `"${label}": the page title is the only h1`, line);
        else if (depth > state.level + 1)
          warn(
            'W_HEADING_SKIP',
            `"${label}" jumps from h${state.level} to h${depth}`,
            line,
          );
        state.level = depth;
        const html = inline(label, line);
        if (depth === 2 || depth === 3)
          state.toc.push({ level: depth, id, html: stripTags(html) });
        return `<h${depth} id="${id}">${html}<a class="hanchor" href="#${id}" aria-labelledby="${id}">#</a></h${depth}>\n`;
      },
      // An image alone in its paragraph is a figure, anywhere else a bare img.
      image: ({ href, text, line }) => image(href, text, line),
      paragraph(token) {
        const parts = token.tokens.filter(
          (part) => part.type !== 'text' || part.raw.trim(),
        );
        if (parts.length === 1 && parts[0].type === 'image')
          return figure(parts[0]);
        return `<p>${this.parser.parseInline(token.tokens)}</p>\n`;
      },
      // Links point at ids on the same page; nothing else is published.
      link({ href, line }) {
        if (LINK.test(href)) return false;
        error('E_LINK_TARGET', `links must point at #ids, not "${href}"`, line);
        return '';
      },
      // Comments are translator notes and never reach the page; any other
      // HTML is refused rather than passed through.
      html({ text, line }) {
        if (!COMMENT.test(text))
          error(
            'E_RAW_HTML',
            `raw HTML is not allowed: ${text.trim().split('\n')[0].slice(0, 40)}`,
            line,
          );
        return '';
      },
      // `- [ ] item` would become a form control, which no page has.
      checkbox({ line }) {
        error('E_TASK_LIST', 'task lists ("- [ ]") are not supported', line);
        return '';
      },
      // Typography (no-break spaces, unbreakable ranges) on text, never on
      // code, URLs or attributes: those are not text tokens.
      text(token) {
        const html = Renderer.prototype.text.call(this, token);
        return token.tokens ? html : typography(html);
      },
      // Tables scroll sideways on a wide screen and become one card per row
      // on a phone. Every cell carries the name of its column (`data-label`,
      // with plain spaces: a label has to wrap) and keeps its content in a
      // `span.cell`, so that label and content can stand side by side. A new
      // line between the cells keeps the text of a row readable as text.
      table({ header, rows }) {
        const text = (cell) => this.parser.parseInline(cell.tokens);
        const align = (token) => (token.align ? ` align="${token.align}"` : '');
        const labels = header.map((token) =>
          stripTags(text(token)).replaceAll(NBSP, ' ').trim(),
        );
        const head = header.map(
          (token) => `<th scope="col"${align(token)}>${text(token)}</th>`,
        );
        const body = rows.map((row) => {
          const cells = row.map(
            (token, at) =>
              `<td data-label="${labels[at]}"${align(token)}><span class="cell">${text(token)}</span></td>`,
          );
          return `<tr>${cells.join('\n')}</tr>`;
        });
        // A table that is wider than its column scrolls: the wrapper takes the
        // keyboard focus (arrow keys scroll it) and is named by its columns.
        return `<div class="table-wrap" role="region" tabindex="0" aria-label="${labels.join(', ')}"><table><thead><tr>${head.join('\n')}</tr></thead>${body.length > 0 ? `<tbody>${body.join('\n')}</tbody>` : ''}</table></div>\n`;
      },
      // The steps of a recipe are numbered by the stylesheet (counters that
      // start at 1) and drawn without list markers, which makes some browsers
      // drop the list from the accessibility tree unless it says what it is.
      list(token) {
        if (token.ordered && token.start !== 1)
          warn(
            'W_LIST_START',
            `the list starts at ${token.start}, but its steps are numbered from 1`,
            token.line,
          );
        const html = Renderer.prototype.list.call(this, token);
        return token.ordered ? html.replace('<ol', '<ol role="list"') : html;
      },
    },
  });

  return {
    /**
     * Renders one section. Syntax that survives the rendering (`:::`, `{#`,
     * `![`) is reported as `E_LEAK` at the block it came from, and a text that
     * `marked` cannot get through (nested too deeply) as `E_RENDER`: the
     * build gets a diagnostic, never an exception.
     *
     * @param {string} text Normalised Markdown.
     * @param {string} file Shown in diagnostics.
     * @returns {string} HTML
     */
    render(text, file) {
      state.file = file;
      state.parents.length = 0;
      try {
        const tokens = marked.lexer(text);
        state.links = tokens.links;
        stampLines(tokens, 1);
        const lines = text.split('\n');
        return tokens
          .map((token) => {
            const html = marked.parser([token]);
            for (const { kind, excerpt } of findLeaks(html))
              error(
                'E_LEAK',
                `"${kind}" was left in the rendered text: ${excerpt}`,
                lineInBlock(lines, token, excerpt.slice(0, 12)),
              );
            return html;
          })
          .join('');
      } catch (cause) {
        error('E_RENDER', `cannot render this text: ${cause.name}`);
        return '';
      }
    },
    /** `{ level, id, html }` of every h2 and h3 so far. */
    toc: state.toc,
  };
}
