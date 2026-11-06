import { escapeHtml } from '../html/escape.mjs';
import { icon } from '../html/icons.mjs';

/**
 * The markup of a boxed note: an icon, a title and the body. It is a
 * `role="note"` div, not an `<aside>`: an aside is a landmark, and twenty
 * unnamed landmarks on a page drown the real ones.
 *
 * @param {object} parts
 * @param {string} parts.kind `tip`, `warning`, `note` or `local`: the class
 *   `callout-<kind>` and the icon of that name.
 * @param {string} parts.title Rendered inline HTML; empty for no title.
 * @param {string} parts.body Rendered HTML.
 * @returns {string}
 */
export const calloutHtml = ({ kind, title, body }) =>
  `<div class="callout callout-${kind}" role="note">${icon(kind)}<div class="callout-main">${title ? `<p class="callout-title">${title}</p>` : ''}<div class="callout-body">${body}</div></div></div>\n`;

/**
 * A block that renders as a callout.
 *
 * @param {string} name `tip`, `warning`, `note`.
 * @param {(ui: Record<string, string>) => string} defaultTitle The title
 *   shown when the author gives none.
 * @returns {object} A block description, see `markdown/renderer.mjs`.
 */
export const callout = (name, defaultTitle) => ({
  name,
  title: 'optional',
  render: ({ title, line, ui, inline, body }) =>
    calloutHtml({
      kind: name,
      title: title ? inline(title, line) : escapeHtml(defaultTitle(ui)),
      body: body(),
    }),
});
