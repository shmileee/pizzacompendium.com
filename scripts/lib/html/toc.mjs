import { escapeHtml } from './escape.mjs';
import { icon } from './icons.mjs';

/**
 * @typedef {{ level: number, id: string, html: string }} TocEntry `html` is
 *   already escaped text.
 */

/**
 * The entries as chapters (h2) with the sections (h3) below them. An h3 that
 * comes before any h2 stands on its own.
 *
 * @param {TocEntry[]} entries
 * @returns {(TocEntry & { kids: TocEntry[] })[]}
 */
export function groupToc(entries) {
  const groups = [];
  let current = null;
  for (const entry of entries) {
    if (entry.level === 3 && current) {
      current.kids.push(entry);
    } else {
      const group = { ...entry, kids: [] };
      groups.push(group);
      if (entry.level === 2) current = group;
    }
  }
  return groups;
}

const link = (entry, attrs = '') =>
  `<a href="#${entry.id}"${attrs}>${entry.html}</a>`;

/**
 * The list of the contents: `ul.toc-list` with one `li.toc-chapter` for each
 * h2 and the h3 entries in a `ul` inside it. A chapter's link carries its
 * number in `data-number` (`01`, `02`, ...), the same one the text shows in
 * front of the heading, which counts every h2; an h3 that stands on its own
 * has no number. It is a plain nested list that reads and works without
 * scripts and styles; the client collapses the chapters it is not in.
 *
 * @param {TocEntry[]} entries
 * @returns {string}
 */
export function renderTocList(entries) {
  let chapters = 0;
  const items = groupToc(entries).map((group) => {
    const number = group.level === 2 ? String(++chapters).padStart(2, '0') : '';
    const kids = group.kids.length
      ? `<ul>${group.kids.map((kid) => `<li>${link(kid)}</li>`).join('')}</ul>`
      : '';
    return `<li class="toc-chapter">${link(group, ` data-number="${number}"`)}${kids}</li>`;
  });
  return `<ul class="toc-list">${items.join('')}</ul>`;
}

/**
 * The contents of the page: the sidebar on wide screens and, with scripts, a
 * drawer on narrow ones (`#toc`, opened by the header's `#toc-toggle`). The
 * close button is for the drawer only; the stylesheet shows it nowhere else.
 *
 * @param {object} model The same model as `renderPage`.
 * @param {TocEntry[]} model.toc
 * @param {Record<string, string>} model.ui
 * @returns {string}
 */
export function renderToc({ toc, ui }) {
  const title = escapeHtml(ui.toc);
  return `<nav class="toc" id="toc" aria-label="${title}">
    <div class="toc-head">
      <p class="toc-title">${title}</p>
      <button type="button" class="btn btn-quiet btn-icon toc-close" data-toc-close aria-label="${escapeHtml(ui.tocClose)}">${icon('close')}</button>
    </div>
    ${renderTocList(toc)}
  </nav>`;
}
