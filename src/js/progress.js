// Wayfinding on a long page: the button back to the top, the
// chapter being read in the header, and jumps that do not scroll slowly. (The
// reading progress line is the stylesheet's alone.)
import { byFragment, query } from './util.js';

/** The button shows once the page is scrolled this many screens down. */
const SHOW_AFTER = 1.5;

/**
 * @param {number} scrolled How far the page is scrolled, in pixels.
 * @param {number} screen The height of the window.
 * @returns {boolean} Is it far enough for the button back to the top?
 */
export const isFarDown = (scrolled, screen) => scrolled > screen * SHOW_AFTER;

/**
 * A jump of more than a screen is not worth watching: it is made at once.
 *
 * @param {number} top Distance of the target from the top of the window.
 * @param {number} screen The height of the window.
 * @returns {boolean}
 */
export const isFarJump = (top, screen) => Math.abs(top) > screen;

/**
 * The chapter label of the header shows the chapter that the contents say is
 * being read (`li.is-current`, announced by the `pc-section` events) and is
 * visible while there is one. The contents may have settled before this runs,
 * so the label starts from what is there.
 */
function wireLabel(root) {
  const label = root.createElement('span');
  label.id = 'pc-chapter';
  label.className = 'chapter-label';
  label.setAttribute('aria-hidden', 'true');
  const text = root.createElement('span');
  text.className = 'chapter-text';
  label.append(text);
  query('.brand', root).after(label);
  const show = (item) => {
    if (item) {
      const link = item.firstElementChild;
      const number = root.createElement('span');
      number.className = 'chapter-num';
      number.textContent = link.dataset.number;
      text.replaceChildren(number, ` ${link.textContent}`);
    }
    label.classList.toggle('is-visible', Boolean(item));
  };
  root.addEventListener('pc-section', ({ detail }) => show(detail));
  show(query('.toc-chapter.is-current', root));
}

/**
 * A jump of more than a screen is made at once, not over a second or two (the
 * page scrolls smoothly otherwise): a link to a place that far away, and the
 * address the page is opened at, which is scrolled to while the page loads
 * (the inline script of the head puts `jump-instant` on the page before it is
 * painted, and it is taken off here once the page has loaded). A place inside
 * a closed question has no position yet and counts as far.
 */
function wireJumps(root) {
  const html = root.documentElement;
  const view = root.defaultView;
  const instant = () => html.classList.add('jump-instant');
  const smooth = () =>
    setTimeout(() => html.classList.remove('jump-instant'), 300);
  // The scripts are loaded one by one (app.js), so the page may be loaded
  // already by the time this runs: then there is no load event to wait for.
  if (root.readyState === 'complete') smooth();
  else view.addEventListener('load', smooth, { once: true });
  root.addEventListener('click', (event) => {
    const link = event.target.closest('a[href^="#"]');
    if (!link) return;
    const [box] = byFragment(root, link.hash).getClientRects();
    if (!box || isFarJump(box.top, view.innerHeight)) {
      instant();
      smooth();
    }
  });
}

/**
 * Wires the button back to the top, the chapter label and the jumps. It has
 * to run before the FAQ's `init`: a click on a link into a closed question is
 * judged "far" because the question has no box yet, and the FAQ opens it in
 * a click handler registered after this one.
 *
 * @param {Document} [root]
 */
export function init(root = document) {
  const view = root.defaultView;
  const button = query('#pc-top', root);
  // Once the footer is on screen its own link back up is there to use.
  const footer = query('.site-footer', root);
  const sync = () =>
    button.classList.toggle(
      'is-visible',
      isFarDown(view.scrollY, view.innerHeight) &&
        footer.getBoundingClientRect().top >= view.innerHeight,
    );
  view.addEventListener('scroll', sync, { passive: true });
  view.addEventListener('resize', sync);
  sync();
  wireLabel(root);
  wireJumps(root);
}
