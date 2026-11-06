// The contents: which place of the text is being read (marked in
// the list, its chapter opened, the list scrolled to it) and, on narrow
// screens, the drawer that the header button opens.
import { query, queryAll } from './util.js';

/** How close to the edge of the list a link may come before it is scrolled. */
const EDGE = 48;

/**
 * The heading being read: the last one that has reached the line where
 * reading starts, or the last of the page when the page is scrolled to its
 * end (a short last section never reaches the line).
 *
 * @param {number[]} tops Distance of each heading from the top of the window,
 *   in the order of the text.
 * @param {number} line Distance from the top at which reading starts.
 * @param {boolean} atEnd Is the page scrolled to its end?
 * @returns {number} The index of the heading, -1 before the first one.
 */
export function activeIndex(tops, line, atEnd) {
  return atEnd ? tops.length - 1 : tops.findLastIndex((top) => top <= line);
}

/**
 * Where a box that scrolls has to be scrolled to for a link to show: null when
 * the link is in view already, else the position that puts it a third of the
 * way down.
 *
 * @param {{ top: number, bottom: number }} link Its rectangle in the window.
 * @param {{ top: number, bottom: number, height: number }} box The same for
 *   the box that holds it.
 * @param {number} scrollTop Where the box is scrolled to now.
 * @returns {number | null}
 */
export function scrollTarget(link, box, scrollTop) {
  const seen = link.top >= box.top + EDGE && link.bottom <= box.bottom - EDGE;
  return seen ? null : scrollTop + link.top - box.top - box.height / 3;
}

/**
 * Everything on the page that is not an ancestor of the element or the
 * element itself, one level at a time: what has to be inert while the
 * element is a drawer.
 *
 * @param {Element} element
 * @returns {Element[]}
 */
export function around(element) {
  const others = [];
  for (let node = element; node.parentElement; node = node.parentElement)
    for (const sibling of node.parentElement.children)
      if (sibling !== node) others.push(sibling);
  return others;
}

/**
 * Follows the reading: the link of the place being read is `a.active`
 * (`aria-current="location"`), the item that holds it `li.is-current` and
 * open, and the list is scrolled so that the link is in view. When the
 * chapter changes the list says so with a `pc-section` event on the list,
 * whose `detail` is that chapter's `li` (null before the first chapter).
 */
function followReading(root, toc) {
  const html = root.documentElement;
  const view = root.defaultView;
  const links = queryAll('a[href^="#"]', toc);
  const headings = links.map((link) =>
    root.getElementById(link.getAttribute('href').slice(1)),
  );
  let current = null;
  let item = null;

  const show = (link) => {
    if (link === current) return;
    current = link;
    for (const mark of queryAll('.active', toc)) {
      mark.classList.remove('active');
      mark.removeAttribute('aria-current');
    }
    for (const open of queryAll('.is-current', toc))
      open.classList.remove('is-current', 'is-open');
    const holder = link ? link.closest('.toc-list > li') : null;
    if (link) {
      link.classList.add('active');
      link.setAttribute('aria-current', 'location');
      holder.classList.add('is-current', 'is-open');
      const top = scrollTarget(
        link.getBoundingClientRect(),
        toc.getBoundingClientRect(),
        toc.scrollTop,
      );
      if (top !== null) toc.scrollTo({ top });
    }
    if (holder !== item) {
      item = holder;
      toc.dispatchEvent(
        new CustomEvent('pc-section', { bubbles: true, detail: item }),
      );
    }
  };

  const update = () => {
    const line = parseFloat(view.getComputedStyle(html).scrollPaddingTop) + 1;
    const atEnd = view.innerHeight + view.scrollY >= html.scrollHeight - 2;
    const tops = headings.map((heading) => heading.getBoundingClientRect().top);
    show(links[activeIndex(tops, line, atEnd)]);
  };

  view.addEventListener('scroll', update, { passive: true });
  view.addEventListener('resize', update);
  update();
  return show;
}

/**
 * The drawer of narrow screens. Open, the page behind it is inert and does
 * not scroll, focus is inside it, and it closes with the close button, the
 * backdrop, Esc, a link or a wide window.
 *
 * @returns {(restoreFocus: boolean) => void} The function that closes it.
 */
function wireDrawer(root, toc) {
  const html = root.documentElement;
  const view = root.defaultView;
  const toggle = query('#toc-toggle', root);
  const backdrop = query('#pc-backdrop', root);
  let inerted = [];

  const close = (restoreFocus) => {
    html.classList.remove('toc-open');
    toggle.setAttribute('aria-expanded', 'false');
    for (const element of inerted) element.inert = false;
    inerted = [];
    if (restoreFocus) toggle.focus();
  };

  toggle.addEventListener('click', () => {
    html.classList.add('toc-open');
    toggle.setAttribute('aria-expanded', 'true');
    inerted = around(toc).filter((e) => e !== backdrop && !e.inert);
    for (const element of inerted) element.inert = true;
    // The drawer already shows the place being read; focusing it must not
    // scroll the page, which is behind it.
    (query('.active', toc) ?? query('a', toc)).focus({ preventScroll: true });
  });
  query('[data-toc-close]', toc).addEventListener('click', () => close(true));
  backdrop.addEventListener('click', () => close(true));
  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && html.classList.contains('toc-open'))
      close(true);
  });
  view
    .matchMedia('(width >= 800px)')
    .addEventListener('change', () => close(false));
  return close;
}

/**
 * Wires the contents (`#toc`, which every language page has).
 *
 * @param {Document} [root]
 */
export function init(root = document) {
  const toc = query('#toc', root);
  const show = followReading(root, toc);
  const close = wireDrawer(root, toc);
  toc.addEventListener('click', (event) => {
    const link = event.target.closest('a');
    if (!link) return;
    show(link);
    close(false);
  });
}
