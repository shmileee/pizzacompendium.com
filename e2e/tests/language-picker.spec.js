import { expect, test } from '../support/fixtures.js';
import { press, visit } from '../support/pointer.js';

// The language picker (the <details> of the header) and the language links of
// the footer: they remember the choice, take the reader to the place they are
// reading in the other language, and the picker shuts the way a menu does.
const KEY = 'pizzacompendium-lang';

const stored = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);

/**
 * Scrolls the page so that a section is being read: its heading sits 100 px
 * down, well above the line the picker reads at. Returns how far below the
 * heading the next section starts, so that a test can tell the reader is
 * still in this one.
 */
const readAt = (page, id) =>
  page.evaluate((target) => {
    const marks = [
      ...document.querySelectorAll(
        'main :is(h2, h3, h4)[id], main details[id]',
      ),
    ];
    const index = marks.findIndex((el) => el.id === target);
    scrollBy(0, marks[index].getBoundingClientRect().top - 100);
    return marks[index + 1].getBoundingClientRect().top - 100;
  }, id);

/** The first section that is long enough to be told apart from the next. */
const longSection = (page) =>
  page.evaluate(() => {
    const marks = [...document.querySelectorAll('main :is(h2, h3, h4)[id]')];
    return marks.find((el, i) => {
      const next = marks[i + 1];
      return (
        next &&
        next.getBoundingClientRect().top - el.getBoundingClientRect().top >
          innerHeight
      );
    }).id;
  });

const picker = (page) => page.locator('#lang-picker');
const summary = (page) => page.locator('#lang-picker > summary');

test.describe('picker', () => {
  test('opens on a click, lists the three languages, marks the current one', async ({
    page,
  }) => {
    await visit(page, '/en/');
    await expect(picker(page)).not.toHaveAttribute('open', '');
    await summary(page).click();
    await expect(picker(page)).toHaveAttribute('open', '');
    await expect(picker(page).locator('a[data-lang]')).toHaveText([
      'Polski',
      'English',
      'Українська',
    ]);
    const current = picker(page).locator('a[aria-current]');
    await expect(current).toHaveCount(1);
    await expect(current).toHaveAttribute('data-lang', 'en');
  });

  test('its items are at least 44 px high', async ({ page }) => {
    await visit(page, '/en/');
    await summary(page).click();
    for (const link of await picker(page).locator('a[data-lang]').all()) {
      const box = await link.boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
  });

  test('Esc closes it and puts focus back on its button without scrolling', async ({
    page,
  }) => {
    await visit(page, '/en/#recipe');
    await summary(page).click();
    await picker(page).locator('a[data-lang="uk"]').focus();
    const before = await page.evaluate(() => scrollY);
    await page.keyboard.press('Escape');
    await expect(picker(page)).not.toHaveAttribute('open', '');
    await expect(summary(page)).toBeFocused();
    expect(await page.evaluate(() => scrollY)).toBe(before);
  });

  test('Esc does nothing to the page while the picker is shut', async ({
    page,
  }) => {
    await visit(page, '/en/');
    await page.locator('a.skip').focus();
    await page.keyboard.press('Escape');
    await expect(page.locator('a.skip')).toBeFocused();
  });

  test('a click outside closes it, a click inside does not', async ({
    page,
  }) => {
    await visit(page, '/en/');
    await summary(page).click();
    await picker(page).locator('ul').dispatchEvent('click');
    await expect(picker(page)).toHaveAttribute('open', '');
    await page.mouse.click(5, 400);
    await expect(picker(page)).not.toHaveAttribute('open', '');
  });

  test('leaving it with Tab closes it, moving inside it does not', async ({
    page,
  }) => {
    await visit(page, '/en/');
    await summary(page).focus();
    await page.keyboard.press('Enter');
    await expect(picker(page)).toHaveAttribute('open', '');
    await page.keyboard.press('Tab');
    await expect(picker(page).locator('a[data-lang="pl"]')).toBeFocused();
    await expect(picker(page)).toHaveAttribute('open', '');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(picker(page)).not.toHaveAttribute('open', '');
  });

  test('stays open when focus goes nowhere, as when Safari presses a link', async ({
    page,
  }) => {
    await visit(page, '/en/');
    await summary(page).click();
    await picker(page).locator('a[data-lang="uk"]').focus();
    await picker(page).evaluate((el) => {
      el.dispatchEvent(
        new FocusEvent('focusout', { bubbles: true, relatedTarget: null }),
      );
    });
    await expect(picker(page)).toHaveAttribute('open', '');
  });

  test('is shut again when the page is left and comes back from the cache', async ({
    page,
  }) => {
    await visit(page, '/en/');
    await summary(page).click();
    await expect(picker(page)).toHaveAttribute('open', '');
    await page.evaluate(() => dispatchEvent(new Event('pagehide')));
    await expect(picker(page)).not.toHaveAttribute('open', '');
  });

  test('is named with the language: wide the name, narrow the code', async ({
    page,
  }) => {
    await visit(page, '/en/');
    await expect(summary(page)).toHaveAccessibleName('Language: English');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(summary(page)).toHaveAccessibleName('Language: EN English');
    await visit(page, '/uk/');
    await expect(summary(page).locator('.lang-code')).toHaveText('УКР');
  });
});

test.describe('switching language', () => {
  test('goes to the other language and remembers the choice', async ({
    page,
  }) => {
    await visit(page, '/en/');
    expect(await stored(page)).toBeNull();
    await summary(page).click();
    await page.locator('#lang-picker a[data-lang="uk"]').click();
    await expect(page).toHaveURL(/\/uk\/$/);
    await expect(page.locator('html')).toHaveAttribute('lang', /^uk/);
    expect(await stored(page)).toBe('uk');
  });

  test('keeps the section being read', async ({ page }) => {
    await visit(page, '/en/');
    const id = await longSection(page);
    expect(await readAt(page, id)).toBeGreaterThan(400);
    await press(page, summary(page));
    await press(page, page.locator('#lang-picker a[data-lang="uk"]'));
    await expect(page).toHaveURL(new RegExp(`/uk/#${id}$`));
  });

  test('changes the link before the browser follows it, so a new tab opens at the section too', async ({
    page,
  }) => {
    await visit(page, '/en/');
    const id = await longSection(page);
    await readAt(page, id);
    // Stays on the page: the link is read after the click has run.
    await press(page, summary(page));
    await page.evaluate(() =>
      document.addEventListener('click', (event) => event.preventDefault()),
    );
    const link = page.locator('#lang-picker a[data-lang="uk"]');
    await press(page, link);
    expect(await link.getAttribute('href')).toMatch(new RegExp(`#${id}$`));
    expect(await stored(page)).toBe('uk');
  });

  test('keeps the open question being read', async ({ page }) => {
    await visit(page, '/en/#faq-stone');
    await expect(page.locator('#faq-stone')).toHaveAttribute('open', '');
    expect(await readAt(page, 'faq-stone')).toBeGreaterThan(400);
    await press(page, summary(page));
    await press(page, page.locator('#lang-picker a[data-lang="pl"]'));
    await expect(page).toHaveURL(/\/pl\/#faq-stone$/);
    await expect(page.locator('#faq-stone')).toHaveAttribute('open', '');
  });

  test('at the top of the page leaves the address without a stale hash', async ({
    page,
  }) => {
    await visit(page, '/en/#recipe');
    await page.evaluate(() => scrollTo(0, 0));
    await summary(page).click();
    await page.locator('#lang-picker a[data-lang="pl"]').click();
    await expect(page).toHaveURL(/\/pl\/$/);
  });

  test('works with storage blocked: the page follows the link, nothing is thrown', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new DOMException('blocked', 'SecurityError');
        },
      });
    });
    await visit(page, '/en/');
    await summary(page).click();
    await page.locator('#lang-picker a[data-lang="pl"]').click();
    await expect(page).toHaveURL(/\/pl\/$/);
    await expect(page.locator('html')).toHaveAttribute('lang', /^pl/);
  });

  test('works without scripts: the picker opens and its links are links', async ({
    browser,
    baseURL,
  }) => {
    const context = await browser.newContext({
      baseURL,
      javaScriptEnabled: false,
    });
    const page = await context.newPage();
    await visit(page, '/en/');
    await summary(page).click();
    await expect(picker(page)).toHaveAttribute('open', '');
    await picker(page).locator('a[data-lang="uk"]').click();
    await expect(page).toHaveURL(/\/uk\/$/);
    await context.close();
  });
});

test.describe('footer languages', () => {
  test('lists the three languages by their own names, one is current', async ({
    page,
  }) => {
    await visit(page, '/uk/');
    const links = page.locator('.footer-langs a');
    await expect(links).toHaveText(['Polski', 'English', 'Українська']);
    await expect(page.locator('.footer-langs a[aria-current]')).toHaveCount(1);
    await expect(links.nth(2)).toHaveAttribute('aria-current', 'true');
  });

  test('a click remembers the choice and keeps the section being read', async ({
    page,
  }) => {
    await visit(page, '/en/');
    // The footer is on screen when its link is clicked: the reader is at the
    // end of the text, in its last section.
    await page.locator('.footer-langs a[data-lang="pl"]').click();
    await expect(page).toHaveURL(/\/pl\/#topping-ideas$/);
    expect(await stored(page)).toBe('pl');
  });
});
