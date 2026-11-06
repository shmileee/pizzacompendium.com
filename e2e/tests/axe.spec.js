import { audit } from '../support/axe.js';
import { LANGUAGES, visit } from '../support/content.js';
import { expect, test } from '../support/fixtures.js';

// WCAG 2.2 AA through axe-core (support/axe.js, which fails on any violation
// of the rules it runs, whatever their impact): all three languages, both
// themes, and the states a visitor puts the page in.

for (const scheme of ['light', 'dark']) {
  test.describe(`${scheme} theme`, () => {
    test.use({ colorScheme: scheme });

    for (const code of LANGUAGES) {
      const label = (state) => `${code} ${scheme}: ${state}`;

      test(`${code}: the page, and with every answer open`, async ({
        page,
      }) => {
        await visit(page, `/${code}/`);
        await audit(page, label('page'));
        await page.locator('[data-faq-toggle]').click();
        await audit(page, label('every answer open'));
      });

      test(`${code}: the flour filter on "beginner"`, async ({ page }) => {
        await visit(page, `/${code}/`);
        await page.locator('[data-filter="beginner"]').click();
        await expect(page.locator('.card[hidden]').first()).toBeHidden();
        await audit(page, label('filter'));
      });

      test(`${code}: the search, with sections, with results, with none`, async ({
        page,
      }) => {
        await visit(page, `/${code}/`);
        await page.locator('[data-search-open]').click();
        await expect(page.locator('#pc-search')).toHaveJSProperty('open', true);
        await audit(page, label('search: sections'));
        await page.locator('#pc-search-input').fill('a');
        await expect(page.locator('[data-search-caption]')).toHaveAttribute(
          'data-state',
          'results',
        );
        await audit(page, label('search: results'));
        await page.locator('#pc-search-input').fill('qqqqqq');
        await expect(page.locator('[data-search-caption]')).toHaveAttribute(
          'data-state',
          'none',
        );
        await audit(page, label('search: none'));
      });

      test(`${code}: the language list and the contents drawer on a phone`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await visit(page, `/${code}/`);
        await audit(page, label('phone'));
        await page.locator('#lang-picker summary').click();
        await audit(page, label('phone: language list'));
        await page.keyboard.press('Escape');
        await page.locator('#toc-toggle').click();
        await expect(page.locator('html')).toHaveClass(/\btoc-open\b/);
        await audit(page, label('phone: drawer'));
      });
    }
  });
}

test('the page at 320 px, the search open', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await visit(page, '/uk/');
  await page.locator('[data-search-open]').click();
  await page.locator('#pc-search-input').fill('борошно');
  await audit(page, 'uk 320: search');
});

test('the 404 page', async ({ page, problems }) => {
  problems.allow(/status of 404/);
  await page.goto('/no/such/page/');
  await audit(page, '404');
});
