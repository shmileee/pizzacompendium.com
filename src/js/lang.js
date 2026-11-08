// The language picker: it remembers the choice, takes the
// reader to the section they are reading in the other language, and closes
// on Esc (focus back on its button), on a click outside, when focus moves to
// something outside it and when the page is left (so that the back button finds it shut).
import { LANG_KEY, query, queryAll, storage } from './util.js';

/** Where a section counts as being read: this far down the window. */
const READING_LINE = 0.3;

/**
 * The section being read.
 *
 * @param {{ id: string, top: number }[]} marks The headings and questions of
 *   the page, in page order, with their distance from the top of the window.
 * @param {number} line The distance from the top of the window below which a
 *   mark has not been reached.
 * @returns {string} The id of the last mark at or above `line`; empty when
 *   the reader is still above the first one.
 */
export const currentSection = (marks, line) =>
  marks.findLast((mark) => mark.top <= line)?.id ?? '';

/**
 * Wires the language picker.
 *
 * @param {Document} [root]
 */
export function init(root = document) {
  const picker = query('#lang-picker', root);
  const view = root.defaultView;
  const close = () => {
    picker.open = false;
  };

  const marks = () =>
    queryAll('main :is(h2, h3, h4)[id], main details[id]', root).map((el) => ({
      id: el.id,
      top: el.getBoundingClientRect().top,
    }));
  // The link is changed before the browser follows it, so that the page
  // opens at the section also in a new tab: a click (with Ctrl or Cmd too), a
  // click of the middle button, and the context menu, whose "open in a new
  // tab" reads the link as it is when the menu opens. Following the link is a
  // choice to remember; opening the menu is not yet one.
  const aim = (link) => {
    link.hash = currentSection(marks(), view.innerHeight * READING_LINE);
  };
  const follow = (link) => {
    storage.set(LANG_KEY, link.dataset.lang);
    aim(link);
  };
  for (const link of queryAll('a[data-lang]', root)) {
    link.addEventListener('click', () => follow(link));
    link.addEventListener('auxclick', (event) => {
      if (event.button === 1) follow(link);
    });
    link.addEventListener('contextmenu', () => aim(link));
  }

  root.addEventListener('click', (event) => {
    if (!picker.contains(event.target)) close();
  });
  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && picker.open) {
      close();
      query('summary', picker).focus({ preventScroll: true });
    }
  });
  // Focus moving to something else outside the picker closes it. Focus
  // moving to nothing does not: Safari on iOS and macOS does not focus a link
  // that is pressed, so pressing a language reports "focus went nowhere",
  // and closing then would take the link away before the tap's click arrives.
  picker.addEventListener('focusout', (event) => {
    if (event.relatedTarget && !picker.contains(event.relatedTarget)) close();
  });
  view.addEventListener('pagehide', close);
}
