import { LANGUAGES } from '../support/content.js';
import { expect, test } from '../support/fixtures.js';

// A visitor whose browser runs no scripts (or whose scripts did not arrive)
// gets the guide and nothing that does not work.

test.use({ javaScriptEnabled: false });

for (const code of LANGUAGES) {
  test.describe(`the ${code} page`, () => {
    test('the text, the questions and the cards are all there to read', async ({
      page,
    }) => {
      await page.goto(`/${code}/`);
      await expect(page.locator('h1')).toBeVisible();
      await expect(page.locator('main h2').first()).toBeVisible();
      await expect(page.locator('#toc')).toBeVisible();
      await expect(page.locator('html')).not.toHaveClass(/\bjs\b/);
      expect(await page.locator('main h2[id]').count()).toBeGreaterThan(10);
      expect(await page.locator('details.faq').count()).toBeGreaterThan(10);
      await expect(page.locator('.card:not([hidden])').first()).toBeVisible();
    });

    test('no control is shown that would do nothing', async ({ page }) => {
      await page.goto(`/${code}/`);
      const dead = await page.evaluate(() =>
        [...document.querySelectorAll('button, dialog, input, [role=button]')]
          .filter((element) => element.checkVisibility())
          .map((element) => `${element.tagName}.${element.className}`),
      );
      expect(dead).toEqual([]);
      await expect(page.locator('.search-btn')).toBeHidden();
      await expect(page.locator('#pc-search')).toBeHidden();
      await expect(page.locator('[data-faq-toggle]')).toBeHidden();
      await expect(page.locator('[data-cards-filter]')).toBeHidden();
      await expect(page.locator('.faq-copy')).toHaveCount(0);
    });

    test('a question opens by itself, a link to the next page of a section works', async ({
      page,
    }) => {
      await page.goto(`/${code}/`);
      const item = page.locator('details.faq').first();
      await item.locator('summary').click();
      await expect(item).toHaveJSProperty('open', true);
      await item.locator('summary').click();
      await expect(item).toHaveJSProperty('open', false);
      await page.locator('#toc a[href^="#"]').nth(3).click();
      expect(await page.evaluate(() => location.hash)).not.toBe('');
    });
  });
}

test('the language list opens by itself and leads to another page', async ({
  page,
}) => {
  await page.goto('/en/');
  await page.locator('#lang-picker summary').click();
  await page.locator('#lang-picker a[data-lang="uk"]').click();
  await expect(page).toHaveURL(/\/uk\/$/);
  await expect(page.locator('html')).toHaveAttribute('lang', /^uk/);
});

test('the root page sends the visitor to the guide by itself', async ({
  page,
}) => {
  // The <noscript> refresh of the root page, to the language of the source.
  await page.goto('/');
  await expect(page).toHaveURL(/\/pl\/$/);
  await expect(page.locator('h1')).toBeVisible();
});
