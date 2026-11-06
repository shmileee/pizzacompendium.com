import { LANGUAGES, visit } from '../support/content.js';
import { expect, test } from '../support/fixtures.js';

// The page under its own Content-Security-Policy: whatever a visitor does, no
// securitypolicyviolation event and no console message. The `problems`
// fixture of every test fails it at the end; the tests here walk the states
// the other specs do not, in all three languages (and both themes), so that
// a script, a style or a font that the policy refuses is found.

const NO_PROBLEMS = (problems) => expect(problems).toEqual([]);

for (const code of LANGUAGES) {
  test.describe(`the ${code} page`, () => {
    test('loads, scrolls to the end and prints cleanly', async ({
      page,
      problems,
    }) => {
      await visit(page, `/${code}/`);
      // Every lazy picture is fetched.
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 1200) {
          scrollTo(0, y);
          await new Promise((resolve) => requestAnimationFrame(resolve));
        }
      });
      await page.emulateMedia({ media: 'print' });
      await page.emulateMedia({ media: 'screen' });
      NO_PROBLEMS(problems);
    });

    test('search, the answers, the filter, the theme and the language list', async ({
      page,
      problems,
    }) => {
      await visit(page, `/${code}/`);
      await page.keyboard.press('Control+K');
      await page.locator('#pc-search-input').fill('a');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await expect(page.locator('#pc-search')).toHaveJSProperty('open', false);
      await page.locator('[data-faq-toggle]').click();
      await page.locator('[data-filter="beginner"]').click();
      for (let press = 0; press < 3; press++)
        await page.locator('#pc-theme').click();
      await page.locator('#lang-picker summary').click();
      NO_PROBLEMS(problems);
    });

    test('the contents drawer on a phone', async ({ page, problems }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await visit(page, `/${code}/`);
      await page.locator('#toc-toggle').click();
      await expect(page.locator('html')).toHaveClass(/\btoc-open\b/);
      await page.keyboard.press('Escape');
      await expect(page.locator('html')).not.toHaveClass(/\btoc-open\b/);
      NO_PROBLEMS(problems);
    });

    test.describe('dark', () => {
      test.use({ colorScheme: 'dark' });

      test('loads and searches', async ({ page, problems }) => {
        await visit(page, `/${code}/`);
        const [red, green, blue] = await page.evaluate(() =>
          getComputedStyle(document.body)
            .backgroundColor.match(/\d+/g)
            .map(Number),
        );
        expect(red + green + blue, 'a dark page').toBeLessThan(200);
        await page.keyboard.press('Control+K');
        await page.locator('#pc-search-input').fill('qqqqqq');
        NO_PROBLEMS(problems);
      });
    });
  });
}

test('the root page, its redirect and the 404 page are clean', async ({
  page,
  problems,
}) => {
  // The browser reports the status of the 404 page itself.
  problems.allow(/status of 404/);
  await page.goto('/');
  await expect(page).toHaveURL(/\/(pl|en|uk)\/$/);
  const missing = await page.goto('/no/such/page/');
  expect(missing?.status()).toBe(404);
  await expect(page.locator('h1')).toBeVisible();
  // What the fixture reports at the end is all that is checked here.
});

test('a script that does not load leaves the page without dead controls', async ({
  page,
  problems,
}) => {
  problems.allow(/ERR_FAILED/);
  await page.route('**/assets/js/search.js', (route) => route.abort());
  await page.goto('/en/');
  await expect(page.locator('html')).not.toHaveClass(/\bjs\b/);
  await expect(page.locator('.search-btn')).toBeHidden();
  await expect(page.locator('h1')).toBeVisible();
});
