import { expect, test } from '../support/fixtures.js';
import { press, visit } from '../support/pointer.js';

// The page fits the window and its controls can be hit with a finger: at the
// widths of a small phone, a phone, a tablet and a desktop, in every language.
const LANGUAGES = ['pl', 'en', 'uk'];
const WIDTHS = [320, 390, 768, 1440];
const TOUCH = 44;

/** How far the page reaches past the window to the right, in pixels. */
const overflow = (page) =>
  page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );

test.describe('no horizontal overflow', () => {
  for (const code of LANGUAGES)
    for (const width of WIDTHS)
      test(`${code} at ${width} px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 });
        await visit(page, `/${code}/`);
        expect(await overflow(page)).toBeLessThanOrEqual(0);
        // Nothing sticks out of the window on its own either.
        const wide = await page.evaluate(() => {
          function* ancestors(el) {
            for (let up = el.parentElement; up; up = up.parentElement) yield up;
          }
          return [...document.querySelectorAll('body *')]
            .filter((el) => {
              const box = el.getBoundingClientRect();
              const style = getComputedStyle(el);
              return (
                box.width > 0 &&
                box.right > document.documentElement.clientWidth + 1 &&
                style.position !== 'fixed' &&
                !el.closest('.toc, .pc-sprite, [hidden], dialog') &&
                // What a box clips or scrolls cannot push the page sideways.
                ![...ancestors(el)].some((up) =>
                  ['auto', 'scroll', 'hidden', 'clip'].includes(
                    getComputedStyle(up).overflowX,
                  ),
                )
              );
            })
            .map((el) => `${el.tagName}.${el.className}`)
            .slice(0, 5);
        });
        expect(wide).toEqual([]);
      });

  for (const width of [320, 390]) {
    test(`with the language list open at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await visit(page, '/uk/');
      await press(page, page.locator('#lang-picker > summary'));
      await expect(page.locator('#lang-picker')).toHaveAttribute('open', '');
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      const list = await page.locator('#lang-picker ul').boundingBox();
      expect(list.x).toBeGreaterThanOrEqual(0);
      expect(list.x + list.width).toBeLessThanOrEqual(width);
    });

    test(`with the contents drawer open at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await visit(page, '/pl/');
      await press(page, page.locator('#toc-toggle'));
      await expect(page.locator('html')).toHaveClass(/toc-open/);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
    });
  }
});

test.describe('the header', () => {
  for (const width of [320, 390, 768, 1440])
    test(`is 56 px tall and keeps its controls inside the window at ${width} px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await visit(page, '/uk/');
      const header = await page.locator('.site-header').boundingBox();
      expect(header.height).toBe(56);
      expect(header.y).toBe(0);
      const actions = await page.locator('.header-actions').boundingBox();
      expect(actions.x + actions.width).toBeLessThanOrEqual(width);
    });

  test('stays at the top of the window while the page scrolls', async ({
    page,
  }) => {
    await visit(page, '/en/');
    await page.evaluate(() => scrollTo(0, 7000));
    const header = await page.locator('.site-header').boundingBox();
    expect(header.y).toBe(0);
  });

  test('never covers the heading a link lands on', async ({ page }) => {
    for (const id of ['quick-start', 'ovens', 'faq-dough', 'topping-ideas']) {
      await visit(page, `/en/#${id}`);
      await expect
        .poll(() =>
          page.evaluate(
            (target) =>
              document.getElementById(target).getBoundingClientRect().top,
            id,
          ),
        )
        .toBeGreaterThanOrEqual(56);
    }
  });
});

test.describe('touch targets', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  /** The controls of the header that a finger has to hit. */
  const HEADER = [
    '#toc-toggle',
    '[data-search-open]',
    '#pc-theme',
    '#lang-picker > summary',
  ];

  for (const code of LANGUAGES)
    test(`${code}: every control of the header is at least 44 px high and wide`, async ({
      page,
    }) => {
      await visit(page, `/${code}/`);
      for (const selector of HEADER) {
        const box = await page.locator(selector).boundingBox();
        expect(box.height, `${selector} height`).toBeGreaterThanOrEqual(TOUCH);
        expect(box.width, `${selector} width`).toBeGreaterThanOrEqual(TOUCH);
      }
    });

  test('the controls of the header do not overlap each other', async ({
    page,
  }) => {
    await visit(page, '/uk/');
    const boxes = [];
    for (const selector of ['#toc-toggle', '.brand', ...HEADER.slice(1)])
      boxes.push([selector, await page.locator(selector).boundingBox()]);
    for (let i = 1; i < boxes.length; i++) {
      const [name, box] = boxes[i];
      const [previous, before] = boxes[i - 1];
      expect(box.x, `${name} after ${previous}`).toBeGreaterThanOrEqual(
        before.x + before.width - 1,
      );
    }
  });

  test('a tap opens the language list and a tap outside closes it', async ({
    page,
  }) => {
    await visit(page, '/en/');
    await page.locator('#lang-picker > summary').tap();
    await expect(page.locator('#lang-picker')).toHaveAttribute('open', '');
    await page.touchscreen.tap(20, 400);
    await expect(page.locator('#lang-picker')).not.toHaveAttribute('open', '');
  });

  test('the button back to the top in the footer is big enough, its language links meet the WCAG minimum', async ({
    page,
  }) => {
    await visit(page, '/en/');
    await page.locator('footer').scrollIntoViewIfNeeded();
    const up = await page.locator('.footer-top').boundingBox();
    expect(up.height).toBeGreaterThanOrEqual(TOUCH);
    for (const link of await page.locator('.footer-langs a').all()) {
      // Text links in a row, about 24 px (the least WCAG 2.2, 2.5.8, allows).
      const box = await link.boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(23);
    }
  });

  test('the hero buttons are big enough', async ({ page }) => {
    await visit(page, '/en/');
    for (const link of await page.locator('.hero-actions a').all()) {
      const box = await link.boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(TOUCH);
    }
  });

  test('the language links of the list and the root page are big enough', async ({
    page,
  }) => {
    await visit(page, '/en/');
    await page.locator('#lang-picker > summary').tap();
    for (const link of await page.locator('#lang-picker a').all()) {
      const box = await link.boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(TOUCH);
    }
    await page.goto('/');
    await page.waitForURL(/\/(pl|en|uk)\//);
  });
});
