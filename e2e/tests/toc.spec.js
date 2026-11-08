import { layoutShift, watchLayoutShift } from '../support/content.js';
import { expect, test } from '../support/fixtures.js';
import { press, visit } from '../support/pointer.js';

// The contents: a sidebar from 800 px that follows the reading, a drawer
// below that. `/en/` has 13 chapters in the list and 34 links in all.
const CHAPTERS = 13;
const NARROW = { width: 390, height: 844 };

const toc = (page) => page.locator('#toc');
const active = (page) => page.locator('#toc a.active');
const toggle = (page) => page.locator('#toc-toggle');
const html = (page) => page.locator('html');
const topOf = (page, id) =>
  page.evaluate(
    (target) => document.getElementById(target).getBoundingClientRect().top,
    id,
  );

/** Is the heading just below the header (56 px tall), where links land? */
const below = async (page, id) => {
  const top = await topOf(page, id);
  return top >= 56 && top < 90;
};

/** Puts a heading where reading starts, the way a link to it would. */
const readHeading = (page, id) =>
  page.evaluate(
    (target) => document.getElementById(target).scrollIntoView(),
    id,
  );

const scrollToEnd = (page) =>
  page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));

test.describe('following the reading (wide)', () => {
  test('at the top nothing is current and every chapter is closed', async ({
    page,
  }) => {
    await visit(page, '/en/');
    await expect(toc(page).locator('.active')).toHaveCount(0);
    await expect(toc(page).locator('[aria-current]')).toHaveCount(0);
    await expect(toc(page).locator('.is-current, .is-open')).toHaveCount(0);
    await expect(toc(page).locator('.toc-chapter > a')).toHaveCount(CHAPTERS);
    for (const link of await toc(page).locator('.toc-chapter > a').all())
      await expect(link).toBeVisible();
    await expect(toc(page).locator('.toc-chapter > ul a').first()).toBeHidden();
  });

  test('a heading at the line makes exactly its link current', async ({
    page,
  }) => {
    await visit(page, '/en/');
    await readHeading(page, 'recipe');
    await expect(active(page)).toHaveCount(1);
    await expect(active(page)).toHaveAttribute('href', '#recipe');
    await expect(active(page)).toHaveAttribute('aria-current', 'location');
    await expect(toc(page).locator('[aria-current]')).toHaveCount(1);
  });

  test('the last heading stays current in the middle of its section', async ({
    page,
  }) => {
    await visit(page, '/en/');
    await readHeading(page, 'recipe');
    await page.evaluate(() => scrollBy(0, 120));
    await expect(active(page)).toHaveAttribute('href', '#recipe');
  });

  test('the next heading takes over when it reaches the line', async ({
    page,
  }) => {
    await visit(page, '/en/');
    await readHeading(page, 'recipe');
    await expect(active(page)).toHaveAttribute('href', '#recipe');
    await readHeading(page, 'kneading');
    await expect(active(page)).toHaveAttribute('href', '#kneading');
    await expect(toc(page).locator('a.active')).toHaveCount(1);
  });

  test('at the end of the page the last link is current, even if its heading never reached the line', async ({
    page,
  }) => {
    // A window taller than the last section: its heading stays below the line.
    await page.setViewportSize({ width: 1280, height: 1800 });
    await visit(page, '/en/');
    await scrollToEnd(page);
    await expect(active(page)).toHaveAttribute('href', '#topping-ideas');
  });

  test('going back to the top clears the mark again', async ({ page }) => {
    await visit(page, '/en/');
    await readHeading(page, 'recipe');
    await expect(active(page)).toHaveCount(1);
    await page.evaluate(() => scrollTo(0, 0));
    await expect(toc(page).locator('.active, .is-current')).toHaveCount(0);
  });

  test('only the chapter being read shows its sections', async ({ page }) => {
    await visit(page, '/en/');
    await readHeading(page, 'recipe');
    const own = toc(page).locator('a[href="#kneading"]');
    const other = toc(page).locator('a[href="#ovens"]');
    await expect(own).toBeVisible();
    await expect(other).toBeHidden();
    await expect(toc(page).locator('.toc-chapter.is-current')).toHaveCount(1);
    await expect(
      toc(page).locator('.toc-chapter.is-current > a'),
    ).toHaveAttribute('href', '#first-bake');
  });

  test('a click on another chapter opens it at once', async ({ page }) => {
    await visit(page, '/en/');
    await readHeading(page, 'recipe');
    await press(page, toc(page).locator('a[href="#equipment"]'));
    await expect(toc(page).locator('a[href="#ovens"]')).toBeVisible();
    await expect(toc(page).locator('a[href="#kneading"]')).toBeHidden();
    await expect(active(page)).toHaveAttribute('href', '#equipment');
    await expect(page).toHaveURL(/#equipment$/);
  });

  test('the sidebar is a column at the side of the text', async ({ page }) => {
    await visit(page, '/en/');
    const sidebar = await toc(page).boundingBox();
    const text = await page.locator('.article').boundingBox();
    expect(sidebar.x + sidebar.width).toBeLessThanOrEqual(text.x + 1);
    await expect(toggle(page)).toBeHidden();
    await expect(page.locator('[data-toc-close]')).toBeHidden();
  });
});

test.describe('the list scrolls to the link (short window)', () => {
  test.use({ viewport: { width: 1024, height: 600 } });

  test('reading far down the text scrolls the sidebar so the link shows', async ({
    page,
  }) => {
    await visit(page, '/en/');
    const overflow = await toc(page).evaluate(
      (el) => el.scrollHeight - el.clientHeight,
    );
    expect(
      overflow,
      'the sidebar must be taller than its window',
    ).toBeGreaterThan(100);
    await readHeading(page, 'faq-dough');
    await expect(active(page)).toHaveAttribute('href', '#faq-dough');
    await expect
      .poll(() => toc(page).evaluate((el) => el.scrollTop))
      .toBeGreaterThan(0);
    const link = await active(page).boundingBox();
    const box = await toc(page).boundingBox();
    expect(link.y).toBeGreaterThanOrEqual(box.y);
    expect(link.y + link.height).toBeLessThanOrEqual(box.y + box.height);
  });
});

test.describe('where a link lands', () => {
  test('a heading reached through a link sits below the header', async ({
    page,
  }) => {
    await visit(page, '/en/');
    await press(page, toc(page).locator('a[href="#pizza-types"]'));
    await expect.poll(() => below(page, 'pizza-types')).toBe(true);
  });

  test('an address with a hash opens at its place, and the contents agree', async ({
    page,
  }) => {
    await visit(page, '/uk/#faq-dough');
    await expect.poll(() => below(page, 'faq-dough')).toBe(true);
    await expect(active(page)).toHaveAttribute('href', '#faq-dough');
    await expect(page.locator('#pc-chapter')).toHaveClass(/is-visible/);
    await expect(page.locator('#pc-chapter .chapter-num')).toHaveText('11');
  });

  test('a change of the hash scrolls to the new place', async ({ page }) => {
    await visit(page, '/en/');
    await page.evaluate(() => {
      location.hash = 'ovens';
    });
    await expect.poll(() => below(page, 'ovens')).toBe(true);
    await expect(active(page)).toHaveAttribute('href', '#ovens');
  });

  test('a link a screen or more away jumps at once, a near one is left to scroll smoothly', async ({
    page,
  }) => {
    await visit(page, '/en/');
    // Moving at once is a class on <html> that the page takes off a moment
    // after it has loaded: wait until it is off.
    await expect(html(page)).not.toHaveClass(/jump-instant/);
    const flag = (selector) =>
      page.evaluate((link) => {
        document.querySelector(link).click();
        return document.documentElement.classList.contains('jump-instant');
      }, selector);
    // 'balling' is a hundred pixels below 'shaping-baking'; 'ovens' is
    // thousands of pixels up.
    await readHeading(page, 'shaping-baking');
    await expect(
      toc(page).locator('a[href="#balling"]'),
      'the chapter is open',
    ).toBeVisible();
    expect(await flag('#toc a[href="#balling"]')).toBe(false);
    await expect(html(page)).not.toHaveClass(/jump-instant/);
    expect(await flag('#toc a[href="#ovens"]')).toBe(true);
    // ...and it is let go again.
    await expect(html(page)).not.toHaveClass(/jump-instant/);
  });
});

test.describe('smooth motion', () => {
  test.use({ reducedMotion: 'no-preference' });

  test('a near jump scrolls smoothly, a far one does not', async ({ page }) => {
    await visit(page, '/en/');
    await expect(html(page)).not.toHaveClass(/jump-instant/);
    expect(
      await html(page).evaluate((el) => getComputedStyle(el).scrollBehavior),
    ).toBe('smooth');
    await page.evaluate(() =>
      document.querySelector('a[href="#ovens"]').click(),
    );
    expect(
      await html(page).evaluate((el) => getComputedStyle(el).scrollBehavior),
    ).toBe('auto');
    await expect.poll(() => below(page, 'ovens')).toBe(true);
    await expect(html(page)).not.toHaveClass(/jump-instant/);
    expect(
      await html(page).evaluate((el) => getComputedStyle(el).scrollBehavior),
    ).toBe('smooth');
  });

  // The address the page is opened at is scrolled to while the page loads,
  // before the scripts have started: that jump must be instant from the first
  // paint, and nothing that the scripts show above the place (the flour
  // filter) may push it down.
  for (const id of ['toppings', 'recipe', 'baking'])
    test(`an address with #${id} opens at its place, and the contents agree`, async ({
      page,
    }) => {
      await watchLayoutShift(page);
      await visit(page, `/en/#${id}`);
      expect(await layoutShift(page)).toBe(0);
      await expect(html(page)).not.toHaveClass(/jump-instant/);
      expect(await topOf(page, id)).toBeGreaterThanOrEqual(56);
      expect(await topOf(page, id)).toBeLessThan(90);
      await expect(active(page)).toHaveAttribute('href', `#${id}`);
    });
});

test.describe('the drawer (narrow)', () => {
  test.use({ viewport: NARROW });

  /** Opens it with the button and waits until it has slid into place. */
  const open = async (page) => {
    await press(page, toggle(page));
    await expect(html(page)).toHaveClass(/toc-open/);
    await expect
      .poll(async () => (await toc(page).boundingBox())?.x)
      .toBeGreaterThanOrEqual(0);
  };

  /** Focus is somewhere in the page behind the drawer. */
  const focusBehind = (page) =>
    page.evaluate(
      () => !!document.activeElement.closest('main, header, footer'),
    );

  test('is shut: hidden, and the button says so', async ({ page }) => {
    await visit(page, '/en/');
    await expect(toc(page)).toBeHidden();
    await expect(toggle(page)).toBeVisible();
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle(page)).toHaveAttribute('aria-controls', 'toc');
    await expect(html(page)).not.toHaveClass(/toc-open/);
  });

  test('opens with the button: shown, focus inside, the page behind inert and still', async ({
    page,
  }) => {
    await visit(page, '/en/');
    await readHeading(page, 'recipe');
    const before = await topOf(page, 'recipe');
    await press(page, toggle(page));
    await expect(html(page)).toHaveClass(/toc-open/);
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
    await expect(toc(page)).toBeVisible();
    // Focus is on the link of the place being read.
    await expect(page.locator('#toc a.active')).toBeFocused();
    for (const selector of ['main', 'header.site-header', 'footer'])
      expect(
        await page.locator(selector).evaluate((el) => el.inert),
        selector,
      ).toBe(true);
    expect(await toc(page).evaluate((el) => el.inert)).toBe(false);
    expect(
      await html(page).evaluate((el) => getComputedStyle(el).overflow),
    ).toBe('hidden');
    // Locking the scroll must not move the page (sub-pixel layout differs by
    // platform, so a pixel of slack).
    expect(Math.abs((await topOf(page, 'recipe')) - before)).toBeLessThan(1.5);
  });

  test('opened at the top it focuses the first link', async ({ page }) => {
    await visit(page, '/en/');
    await open(page);
    await expect(toc(page).locator('a').first()).toBeFocused();
  });

  test('opens from the keyboard', async ({ page }) => {
    await visit(page, '/en/');
    await toggle(page).focus();
    await page.keyboard.press('Enter');
    await expect(html(page)).toHaveClass(/toc-open/);
  });

  test('Tab never leaves the drawer for the page behind it', async ({
    page,
  }) => {
    await visit(page, '/en/');
    await open(page);
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('Tab');
      expect(await focusBehind(page), `Tab ${i + 1}`).toBe(false);
    }
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('Shift+Tab');
      expect(await focusBehind(page), `Shift+Tab ${i + 1}`).toBe(false);
    }
  });

  const closers = {
    Esc: (page) => page.keyboard.press('Escape'),
    'the close button': (page) => press(page, page.locator('[data-toc-close]')),
    'a click on the backdrop': (page) => page.mouse.click(360, 400),
  };
  for (const [name, close] of Object.entries(closers))
    test(`${name} closes it, frees the page and returns focus to the button`, async ({
      page,
    }) => {
      await visit(page, '/en/');
      await open(page);
      await close(page);
      await expect(html(page)).not.toHaveClass(/toc-open/);
      await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
      await expect(toggle(page)).toBeFocused();
      await expect(toc(page)).toBeHidden();
      for (const selector of ['main', 'header.site-header', 'footer'])
        expect(
          await page.locator(selector).evaluate((el) => el.inert),
          selector,
        ).toBe(false);
      expect(
        await html(page).evaluate((el) => getComputedStyle(el).overflow),
      ).not.toBe('hidden');
    });

  test('a click on a link closes it and lands the heading below the header', async ({
    page,
  }) => {
    await visit(page, '/en/');
    await open(page);
    await press(page, toc(page).locator('a[href="#equipment"]'));
    await expect(html(page)).not.toHaveClass(/toc-open/);
    await expect(page).toHaveURL(/#equipment$/);
    await expect.poll(() => below(page, 'equipment')).toBe(true);
    await expect(page.locator('main')).not.toHaveJSProperty('inert', true);
  });

  test('a link chosen from the keyboard leaves focus on its heading, not on the page', async ({
    page,
  }) => {
    await visit(page, '/en/');
    await open(page);
    await toc(page).locator('a[href="#equipment"]').focus();
    await page.keyboard.press('Enter');
    await expect(html(page)).not.toHaveClass(/toc-open/);
    await expect(page.locator('#equipment')).toBeFocused();
    await expect.poll(() => below(page, 'equipment')).toBe(true);
    // The next Tab goes on from the heading, into the text.
    await page.keyboard.press('Tab');
    expect(
      await page.evaluate(
        () =>
          document
            .getElementById('equipment')
            .compareDocumentPosition(document.activeElement) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ).toBeTruthy();
  });

  test('widening the window to the sidebar closes it and removes the inert', async ({
    page,
  }) => {
    await visit(page, '/en/');
    await open(page);
    await page.setViewportSize({ width: 900, height: 844 });
    await expect(html(page)).not.toHaveClass(/toc-open/);
    await expect(page.locator('main')).not.toHaveJSProperty('inert', true);
    await expect(toc(page)).toBeVisible();
    await expect(toggle(page)).toBeHidden();
  });

  test('its links are at least 44 px high', async ({ page }) => {
    await visit(page, '/en/');
    await open(page);
    for (const link of await toc(page).locator('.toc-chapter > a').all()) {
      const box = await link.boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    const close = await page.locator('[data-toc-close]').boundingBox();
    expect(close.width).toBeGreaterThanOrEqual(44);
    expect(close.height).toBeGreaterThanOrEqual(44);
  });
});

test.describe('wide or narrow', () => {
  test('the sidebar takes over at 800 px, not before', async ({ page }) => {
    await visit(page, '/en/');
    await page.setViewportSize({ width: 799, height: 800 });
    await expect(toggle(page)).toBeVisible();
    await expect(toc(page)).toBeHidden();
    await page.setViewportSize({ width: 800, height: 800 });
    await expect(toggle(page)).toBeHidden();
    await expect(toc(page)).toBeVisible();
  });
});

test.describe('without scripts', () => {
  const plain = async (browser, baseURL, viewport) => {
    const context = await browser.newContext({
      baseURL,
      javaScriptEnabled: false,
      viewport,
    });
    return { context, page: await context.newPage() };
  };

  test('wide: the whole list is on show and nothing is a dead control', async ({
    browser,
    baseURL,
  }) => {
    const { context, page } = await plain(browser, baseURL, {
      width: 1280,
      height: 900,
    });
    await visit(page, '/en/');
    const links = toc(page).locator('a[href^="#"]');
    expect(await links.count()).toBeGreaterThan(CHAPTERS);
    for (const link of await links.all()) await expect(link).toBeVisible();
    await expect(page.locator('#pc-top')).toBeHidden();
    await context.close();
  });

  test('narrow: the chapters are in the flow, with no drawer, no close and no top button', async ({
    browser,
    baseURL,
  }) => {
    const { context, page } = await plain(browser, baseURL, NARROW);
    await visit(page, '/en/');
    await expect(toc(page).locator('.toc-chapter > a')).toHaveCount(CHAPTERS);
    for (const link of await toc(page).locator('.toc-chapter > a').all())
      await expect(link).toBeVisible();
    await expect(toc(page).locator('.toc-chapter > ul a').first()).toBeHidden();
    await expect(toggle(page)).toBeHidden();
    await expect(page.locator('[data-toc-close]')).toBeHidden();
    await expect(page.locator('#pc-top')).toBeHidden();
    await context.close();
  });
});

test.describe('the page structure', () => {
  test('has one h1, and the contents are not inside main', async ({ page }) => {
    await visit(page, '/en/');
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('main #toc')).toHaveCount(0);
    await expect(toc(page)).toHaveAttribute('aria-label', 'Table of contents');
  });

  test('the skip link puts focus on the text', async ({ page }) => {
    await visit(page, '/en/');
    await page.keyboard.press('Tab');
    await expect(page.locator('a.skip')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('main#content')).toBeFocused();
    await expect(page).toHaveURL(/#content$/);
  });
});
