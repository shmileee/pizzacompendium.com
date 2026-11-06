import { expect } from '@playwright/test';
import axe from 'axe-core';

/**
 * WCAG 2.2 AA, via axe-core: the test fails with the rules that were broken
 * and the elements they were broken on. axe-core is put into the page through
 * the browser's debugging protocol, which the page's Content-Security-Policy
 * does not govern, so the page is audited under its real policy.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} label Says which page or state this is, in the failure.
 * @param {{ exclude?: string[] }} [options] Selectors to leave out.
 */
export async function audit(page, label, { exclude = [] } = {}) {
  await page.evaluate(axe.source);
  const { violations } = await page.evaluate(
    (excluded) =>
      axe.run(excluded.length ? { exclude: excluded } : document, {
        runOnly: {
          type: 'tag',
          values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'],
        },
      }),
    exclude,
  );
  expect(
    violations.map(
      (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`,
    ),
    label,
  ).toEqual([]);
}
