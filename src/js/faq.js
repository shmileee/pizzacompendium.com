// The FAQ. An answer opens from a link or from the address,
// "expand all" opens or closes every one, an open answer can give its link
// away, and every answer is open on paper. Without this script the questions
// still open and close by themselves (they are <details>).
import { byFragment, query, queryAll } from './util.js';

/** How long a message after "copy link" stays, in milliseconds. */
export const MESSAGE_MS = 2500;

/**
 * Opens every `<details>` that holds the element (the element too, when it is
 * one).
 *
 * @param {Element} element
 * @returns {boolean} True when one of them had been closed.
 */
export function openAncestors(element) {
  let changed = false;
  for (let node = element; node; node = node.parentElement)
    if (node.tagName === 'DETAILS' && !node.open) {
      node.open = true;
      changed = true;
    }
  return changed;
}

/** @param {{ open: boolean }[]} items */
export const allOpen = (items) => items.every((item) => item.open);

/**
 * The address of one question: this page, at the question's id.
 *
 * @param {string} href The address of the page (`location.href`).
 * @param {string} id
 * @returns {string}
 */
export function linkTo(href, id) {
  const url = new URL(href);
  url.hash = id;
  return url.href;
}

/**
 * "Expand all" opens every question, or closes every question when all are
 * open; its label follows whatever opens or closes one (the label alone says the
 * state; no `aria-pressed`, which would say it twice).
 */
function wireToggle(faqs, root) {
  for (const toggle of queryAll('[data-faq-toggle]', root)) {
    const label = toggle.lastElementChild;
    const sync = () => {
      const open = allOpen(faqs);
      label.textContent = toggle.dataset[open ? 'collapse' : 'expand'];
      toggle.toggleAttribute('data-all-open', open);
    };
    toggle.addEventListener('click', () => {
      const open = !allOpen(faqs);
      for (const faq of faqs) faq.open = open;
      sync();
    });
    for (const faq of faqs) faq.addEventListener('toggle', sync);
  }
}

/**
 * Gives every answer a footer with a copy-link button, if the browser lets a
 * page write to the clipboard (otherwise there is no button at all). The
 * footer comes from the page's `<template>`; the button's name says which
 * question it is for, and the result of a click is said in the footer's
 * status, for a moment.
 */
function wireCopy(faqs, root) {
  const { clipboard } = root.defaultView.navigator;
  if (!clipboard) return;
  const template = query('#pc-faq-foot', root);
  for (const faq of faqs) {
    const foot = template.content.cloneNode(true);
    const button = query('.faq-copy', foot);
    const status = query('.faq-status', foot);
    let timer;
    const say = (text) => {
      status.textContent = text;
      clearTimeout(timer);
      timer = setTimeout(() => {
        status.textContent = '';
      }, MESSAGE_MS);
    };
    button.setAttribute(
      'aria-label',
      `${button.textContent}: ${query('.faq-q', faq).textContent}`,
    );
    button.addEventListener('click', async () => {
      try {
        await clipboard.writeText(
          linkTo(root.defaultView.location.href, faq.id),
        );
        say(template.dataset.copied);
      } catch {
        say(template.dataset.failed);
      }
    });
    query('.faq-body', faq).append(foot);
  }
}

/**
 * Opening a question puts it in the address (a link someone can share; closing
 * leaves it, and "expand all" does not touch it). A click on a link to
 * something inside a closed question opens the question before the browser
 * scrolls to it, which also works when the address already says so.
 */
function wireClicks(root) {
  const view = root.defaultView;
  root.addEventListener('click', (event) => {
    const summary = event.target.closest('details.faq > summary');
    if (summary && !summary.parentElement.open)
      view.history.replaceState(
        view.history.state,
        '',
        `#${summary.parentElement.id}`,
      );
    const link = event.target.closest('a[href^="#"]');
    if (link) openAncestors(byFragment(root, link.hash));
  });
}

/**
 * An address that names a question, or something inside one, opens it and
 * brings it into view (below the header: the page's scroll padding), when the
 * page is loaded and whenever the address changes (back and forward, the
 * search).
 *
 * A page loaded at such an address opens the question at once and scrolls to
 * it two frames later: in one frame, the content below the question would
 * count as a layout shift (it was in view where the page scrolled to, and the
 * open question pushed it away). The same two frames pass before the
 * stylesheet may animate (`.faq-ready`), so that opening is not animated.
 */
function wireAddress(root) {
  const view = root.defaultView;
  const named = () => byFragment(root, view.location.hash);
  view.addEventListener('hashchange', () => {
    const target = named();
    if (target && openAncestors(target)) target.scrollIntoView();
  });
  const target = named();
  const opened = Boolean(target) && openAncestors(target);
  view.requestAnimationFrame(() =>
    view.requestAnimationFrame(() => {
      if (opened) target.scrollIntoView({ behavior: 'instant' });
      root.documentElement.classList.add('faq-ready');
    }),
  );
}

/** Every answer is open on paper, and closed again afterwards. */
function wirePrint(faqs, root) {
  const view = root.defaultView;
  let opened = [];
  view.addEventListener('beforeprint', () => {
    opened = faqs.filter((faq) => !faq.open);
    for (const faq of opened) faq.open = true;
  });
  view.addEventListener('afterprint', () => {
    for (const faq of opened) faq.open = false;
    opened = [];
  });
}

/**
 * Wires the questions of the page (there may be none).
 *
 * @param {Document} [root]
 */
export function init(root = document) {
  const faqs = queryAll('details.faq', root);
  wireToggle(faqs, root);
  wireCopy(faqs, root);
  wireClicks(root);
  wireAddress(root);
  wirePrint(faqs, root);
}
