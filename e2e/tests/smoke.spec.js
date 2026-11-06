import { expect, test } from '../support/fixtures.js';

// The first of the browser tests: every language page of the real site loads,
// its inline script and its modules run under the page's own
// Content-Security-Policy, and nothing is reported on the way. The specs of
// each area replace and extend it.
const LANGUAGES = ['pl', 'en', 'uk'];

test('the pl, en and uk pages load with no console error and no policy violation', async ({
  page,
  site,
  problems,
}) => {
  expect(site.languages).toEqual(expect.arrayContaining(LANGUAGES));
  for (const code of LANGUAGES) {
    const response = await page.goto(`/${code}/`);
    expect(response?.status(), `${code} status`).toBe(200);
    const html = page.locator('html');
    await expect(html, `${code} lang`).toHaveAttribute(
      'lang',
      new RegExp(`^${code}(-|$)`),
    );
    // Set by the inline script of the head: it only ran if the policy allows it.
    await expect(html, `${code} scripted`).toHaveClass(/\bjs\b/);
    await expect(page.locator('h1'), `${code} title`).toHaveCount(1);
  }
  expect(problems).toEqual([]);
});
