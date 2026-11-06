import { expect, test } from '../support/fixtures.js';
import { press, visit } from '../support/pointer.js';

// Where the reader is: the button back to the top, the chapter in the header,
// the progress line under it.
const button = (page) => page.locator('#pc-top');
const label = (page) => page.locator('#pc-chapter');
const scrollTo = (page, y) =>
  page.evaluate((top) => window.scrollTo(0, top), y);
const scrollY = (page) => page.evaluate(() => window.scrollY);
const readHeading = (page, id) =>
  page.evaluate(
    (target) => document.getElementById(target).scrollIntoView(),
    id,
  );
const scrollToEnd = (page) =>
  page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));

test.describe('the button back to the top', () => {
  test('is hidden at the top and before a screen and a half', async ({
    page,
  }) => {
    await visit(page, '/en/');
    await expect(button(page)).toBeHidden();
    const screen = await page.evaluate(() => innerHeight);
    await scrollTo(page, screen * 1.4);
    await expect(button(page)).not.toHaveClass(/is-visible/);
    await expect(button(page)).toBeHidden();
  });

  test('shows after a screen and a half', async ({ page }) => {
    await visit(page, '/en/');
    const screen = await page.evaluate(() => innerHeight);
    await scrollTo(page, screen * 1.6);
    await expect(button(page)).toBeVisible();
    await expect(button(page)).toHaveAccessibleName('Back to top');
  });

  test('hides again once the footer, with its own link up, is on screen', async ({
    page,
  }) => {
    await visit(page, '/en/');
    await scrollTo(page, 5000);
    await expect(button(page)).toBeVisible();
    await scrollToEnd(page);
    await expect(button(page)).toBeHidden();
    await expect(page.locator('.footer-top')).toBeInViewport();
  });

  test('a click takes the reader to the top at once and puts #top in the address', async ({
    page,
  }) => {
    await visit(page, '/en/');
    await scrollTo(page, 6000);
    await expect(button(page)).toBeVisible();
    await press(page, button(page));
    await expect.poll(() => scrollY(page), { timeout: 1000 }).toBe(0);
    await expect(page).toHaveURL(/#top$/);
    await expect(button(page)).toBeHidden();
  });

  test('is at least 44 px square', async ({ page }) => {
    await visit(page, '/en/');
    await scrollTo(page, 5000);
    const box = await button(page).boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  });

  test('is not there without scripts', async ({ browser, baseURL }) => {
    const context = await browser.newContext({
      baseURL,
      javaScriptEnabled: false,
    });
    const page = await context.newPage();
    await visit(page, '/en/');
    await scrollTo(page, 5000);
    await expect(button(page)).toBeHidden();
    await context.close();
  });
});

test.describe('the chapter in the header', () => {
  test('is out of sight at the top', async ({ page }) => {
    await visit(page, '/en/');
    await expect(label(page)).toHaveCount(1);
    await expect(label(page)).not.toHaveClass(/is-visible/);
    await expect(label(page)).toHaveCSS('opacity', '0');
  });

  test('names the number and the title of the chapter being read', async ({
    page,
  }) => {
    await visit(page, '/en/');
    await readHeading(page, 'recipe');
    await expect(label(page)).toHaveClass(/is-visible/);
    await expect(label(page)).toHaveCSS('opacity', '1');
    await expect(label(page).locator('.chapter-num')).toHaveText('09');
    await expect(label(page)).toContainText('Your first pizza step by step');
  });

  test('follows the reading from chapter to chapter', async ({ page }) => {
    await visit(page, '/en/');
    await readHeading(page, 'recipe');
    await expect(label(page).locator('.chapter-num')).toHaveText('09');
    await readHeading(page, 'ovens');
    await expect(label(page).locator('.chapter-num')).toHaveText('08');
    await expect(label(page)).toContainText('Equipment');
  });

  test('fades out again when the reader is back above the first chapter', async ({
    page,
  }) => {
    await visit(page, '/en/');
    await readHeading(page, 'recipe');
    await expect(label(page)).toHaveClass(/is-visible/);
    await scrollTo(page, 0);
    await expect(label(page)).not.toHaveClass(/is-visible/);
  });

  test('is hidden from screen readers, which have the contents', async ({
    page,
  }) => {
    await visit(page, '/en/');
    await expect(label(page)).toHaveAttribute('aria-hidden', 'true');
  });

  test('is in the language of the page', async ({ page }) => {
    await visit(page, '/uk/');
    await readHeading(page, 'recipe');
    await expect(label(page).locator('.chapter-num')).toHaveText('09');
    await expect(label(page)).toContainText('Перша піца крок за кроком');
  });

  test('is not shown on a narrow screen, where the header has no room', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await visit(page, '/en/');
    await readHeading(page, 'recipe');
    await expect(label(page)).toBeHidden();
  });
});

test.describe('the progress line', () => {
  const progress = (page) =>
    page.evaluate(() => {
      const matrix = getComputedStyle(
        document.getElementById('pc-progress'),
      ).transform;
      return matrix === 'none' ? 0 : Number(matrix.match(/matrix\(([^,]+)/)[1]);
    });

  test('is empty at the top, half way at the middle and full at the end', async ({
    page,
  }) => {
    await visit(page, '/en/');
    expect(await progress(page)).toBe(0);
    await page.evaluate(() =>
      scrollTo(0, (document.documentElement.scrollHeight - innerHeight) / 2),
    );
    await expect.poll(() => progress(page)).toBeGreaterThan(0.45);
    expect(await progress(page)).toBeLessThan(0.55);
    await scrollToEnd(page);
    await expect.poll(() => progress(page)).toBeCloseTo(1, 2);
  });

  test('sits under the header and does not get in the way of clicks', async ({
    page,
  }) => {
    await visit(page, '/en/');
    const bar = page.locator('#pc-progress');
    await expect(bar).toHaveAttribute('aria-hidden', 'true');
    await expect(bar).toHaveCSS('pointer-events', 'none');
    const box = await bar.boundingBox();
    expect(box.height).toBe(2);
    expect(box.y).toBe(54);
  });
});

test.describe('hash navigation', () => {
  test('the hero buttons lead to their sections', async ({ page }) => {
    await visit(page, '/en/');
    await press(page, page.locator('.hero-actions a[href="#faq"]'));
    await expect(page).toHaveURL(/#faq$/);
    await expect
      .poll(() =>
        page.evaluate(
          () => document.getElementById('faq').getBoundingClientRect().top,
        ),
      )
      .toBeLessThan(90);
  });

  test('the brand takes the reader back to the top', async ({ page }) => {
    await visit(page, '/en/#recipe');
    await expect.poll(() => scrollY(page)).toBeGreaterThan(1000);
    await press(page, page.locator('.brand'));
    await expect.poll(() => scrollY(page)).toBe(0);
    await expect(page).toHaveURL(/#top$/);
  });

  test('an address that names nothing leaves the page at the top, without errors', async ({
    page,
  }) => {
    await visit(page, '/en/#no-such-section');
    expect(await scrollY(page)).toBe(0);
    await visit(page, '/en/#%E0%A4%A');
    expect(await scrollY(page)).toBe(0);
  });

  test('a heading reached by an address is not under the header', async ({
    page,
  }) => {
    await visit(page, '/en/#kneading');
    const top = await page.evaluate(
      () => document.getElementById('kneading').getBoundingClientRect().top,
    );
    expect(top).toBeGreaterThanOrEqual(56);
    expect(top).toBeLessThan(90);
  });
});
