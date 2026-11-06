// Small helpers of the content specs (search, FAQ, cards, hero, galleries and
// the cross-cutting checks): going to a page and waiting until its scripts
// have started, and measuring layout shift. Nothing here asserts a feature.
import { expect } from '@playwright/test';

export const LANGUAGES = ['pl', 'en', 'uk'];

/** The distance from the top of the window an anchor lands at (the header). */
export const ANCHOR_TOP = 72;

/**
 * Opens a page and waits until every script of the site has started: the
 * entry script starts them one after the other, and `faq-ready` is put on
 * `<html>` two frames after the last of them (see src/js/faq.js), so after it
 * no control is without its handler.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} address For example `/en/` or `/pl/#faq-stone`.
 */
export async function visit(page, address) {
  const response = await page.goto(address);
  expect(response?.status(), `${address} status`).toBe(200);
  await expect(page.locator('html'), `${address} scripts`).toHaveClass(
    /\bfaq-ready\b/,
  );
}

/**
 * Starts adding up the layout shifts of the page (call it before the first
 * `goto`), those of the contents list left out; `layoutShift(page)` reads the
 * sum.
 *
 * @param {import('@playwright/test').Page} page
 */
export async function watchLayoutShift(page) {
  await page.addInitScript(() => {
    window.__pcShift = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        // The contents list settles its own scroll as the page loads; what a
        // reader reads is what counts.
        const own =
          entry.sources.length > 0 &&
          entry.sources.every((source) => source.node?.closest?.('#toc'));
        if (!entry.hadRecentInput && !own) window.__pcShift += entry.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
}

/**
 * The layout shift so far. The observer delivers its entries in a task of its
 * own, so the read goes through two frames first.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<number>}
 */
export const layoutShift = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => resolve(window.__pcShift)),
        ),
      ),
  );

/**
 * Whether the page scrolls sideways.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<boolean>}
 */
export const overflowsSideways = (page) =>
  page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
