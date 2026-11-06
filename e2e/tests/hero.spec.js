import {
  ANCHOR_TOP,
  LANGUAGES,
  layoutShift,
  visit,
  watchLayoutShift,
} from '../support/content.js';
import { expect, test } from '../support/fixtures.js';

// The hero at the top of the page: one title, two ways in, a photograph that
// is the right file for the window and does not move the page.

const hero = (page) => page.locator('#pc-hero');

for (const code of LANGUAGES) {
  test(`the ${code} hero has the one title of the page, the lead and two links`, async ({
    page,
  }) => {
    await visit(page, `/${code}/`);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(hero(page).locator('h1')).toHaveCount(1);
    const title = await page.evaluate(() => document.title);
    expect(title).toContain(await hero(page).locator('h1').innerText());
    const lead = await page
      .locator('meta[name="description"]')
      .getAttribute('content');
    await expect(hero(page).locator('.hero-lead')).toHaveText(lead);
    const links = hero(page).locator('.hero-actions a');
    await expect(links).toHaveCount(2);
    await expect(links.nth(0)).toHaveAttribute('href', '#quick-start');
    await expect(links.nth(1)).toHaveAttribute('href', '#faq');
    await expect(page.locator('#quick-start')).toHaveCount(1);
    await expect(page.locator('#faq')).toHaveCount(1);
  });
}

test('the primary link brings the quick start into view below the header', async ({
  page,
}) => {
  await visit(page, '/en/');
  await hero(page).locator('.hero-actions a').first().click();
  expect(await page.evaluate(() => location.hash)).toBe('#quick-start');
  await expect
    .poll(() =>
      page
        .locator('#quick-start')
        .evaluate((el) => el.getBoundingClientRect().top),
    )
    .toBeGreaterThanOrEqual(0);
  const top = await page
    .locator('#quick-start')
    .evaluate((el) => el.getBoundingClientRect().top);
  expect(top).toBeLessThanOrEqual(ANCHOR_TOP + 1);
});

test('the secondary link leads to the questions', async ({ page }) => {
  await visit(page, '/en/');
  await hero(page).locator('.hero-actions a').nth(1).click();
  expect(await page.evaluate(() => location.hash)).toBe('#faq');
  await expect(page.locator('#faq')).toBeInViewport();
});

test('the photograph is loaded at once, has a size and a description', async ({
  page,
}) => {
  await visit(page, '/en/');
  const image = hero(page).locator('img');
  await expect(image).toHaveAttribute('loading', 'eager');
  await expect(image).toHaveAttribute('fetchpriority', 'high');
  await expect(image).toHaveAttribute('width', /^\d+$/);
  await expect(image).toHaveAttribute('height', /^\d+$/);
  expect(((await image.getAttribute('alt')) ?? '').trim()).not.toBe('');
});

test.describe('which file the window gets', () => {
  const current = (page) =>
    hero(page)
      .locator('img')
      .evaluate(async (img) => {
        await img.decode();
        return new URL(img.currentSrc).pathname;
      });

  for (const [width, height, scale, file] of [
    [390, 844, 2, /\/img\/hero-mobile(-\d+w)?\.webp$/],
    [768, 1024, 2, /\/img\/hero(-\d+w)?\.webp$/],
    [1280, 900, 1, /\/img\/hero-mobile(-\d+w)?\.webp$/],
  ]) {
    test(`${width} px wide at ${scale}x`, async ({ browser, site }) => {
      const context = await browser.newContext({
        baseURL: site.url,
        viewport: { width, height },
        deviceScaleFactor: scale,
      });
      const page = await context.newPage();
      await visit(page, '/en/');
      expect(await current(page)).toMatch(file);
      await context.close();
    });
  }
});

test.describe('layout shift', () => {
  for (const width of [320, 390, 768, 1440]) {
    test(`at ${width} px the hero shifts nothing`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await watchLayoutShift(page);
      await visit(page, '/pl/');
      await expect(hero(page).locator('img')).toHaveJSProperty(
        'complete',
        true,
      );
      expect(await layoutShift(page)).toBe(0);
    });
  }
});
