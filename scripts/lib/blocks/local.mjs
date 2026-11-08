import { calloutHtml, calloutMarkdown } from './callout.mjs';

/** What a local note may hold: running text and lists. */
const PLAIN = new Set(['paragraph', 'list', 'space', 'html', 'text']);

/**
 * Is there nothing in these tokens, however deep, that gives the page a
 * heading, an id, a table of contents entry or a block of its own?
 */
const isPlain = (tokens) =>
  tokens.every(
    (token) =>
      PLAIN.has(token.type) &&
      (!token.items || token.items.every((item) => isPlain(item.tokens))),
  );

/**
 * A note for one country or language: `::: local lang=pl Title`. It is
 * rendered only on the page of that language and ignored everywhere else
 * (the page of a language that lacks the section shows the source's text,
 * notes and all). The content rules check that `lang` equals the folder,
 * that there is a title and (for the plain case, before anything is
 * rendered) that it holds no headings or FAQ items; this block checks the
 * rest, wherever Markdown puts a heading or a block: a quote, a list, an
 * indented line, and that a note is in the file of its own language even
 * where the content rules cannot see it.
 */
export default {
  name: 'local',
  attrs: { lang: 'required' },
  title: 'optional',
  render({ attrs, title, line, lang, textLang, tokens, inline, body, error }) {
    if (!isPlain(tokens))
      error(
        'E_BLOCK_CONTENT',
        'a local note holds plain paragraphs and lists only: no headings, FAQ items, blocks, tables, quotes or code',
        line,
      );
    if (attrs.lang !== textLang) {
      error(
        'E_BLOCK_ATTR',
        `a lang=${attrs.lang} note in a ${textLang} file: it goes into the file of its own language`,
        line,
        'lang',
      );
      return '';
    }
    if (textLang !== lang.code) return '';
    return calloutHtml({
      kind: 'local',
      title: title ? inline(title, line) : '',
      body: body(),
    });
  },
  markdown: ({ attrs, title, lang, body }) =>
    attrs.lang === lang.code ? calloutMarkdown(title, body) : '',
};
