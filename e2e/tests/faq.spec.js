import {
  ANCHOR_TOP,
  layoutShift,
  visit,
  watchLayoutShift,
} from '../support/content.js';
import { expect, test } from '../support/fixtures.js';

// The questions and answers: expand all and collapse all, a link or an address
// that opens one, the address that follows an opening, the copy-link button,
// and paper.

const toggle = (page) => page.locator('[data-faq-toggle]');
const faqs = (page) => page.locator('details.faq');
const openCount = (page) => page.locator('details.faq[open]').count();
const hash = (page) => page.evaluate(() => location.hash);
const topOf = (locator) =>
  locator.evaluate((element) => element.getBoundingClientRect().top);

test.describe('expand all', () => {
  test('opens every answer, says "collapse all", and closes them again', async ({
    page,
  }) => {
    await visit(page, '/en/');
    const total = await faqs(page).count();
    expect(total).toBeGreaterThan(10);
    await expect(toggle(page)).toBeVisible();
    await expect(toggle(page)).toHaveText(
      await toggle(page).getAttribute('data-expand'),
    );
    // The label says the state, once: no aria-pressed besides it.
    await expect(toggle(page)).not.toHaveAttribute('aria-pressed');
    const before = await hash(page);
    await toggle(page).click();
    expect(await openCount(page)).toBe(total);
    await expect(toggle(page)).toHaveText(
      await toggle(page).getAttribute('data-collapse'),
    );
    expect(await hash(page)).toBe(before);
    await toggle(page).click();
    expect(await openCount(page)).toBe(0);
    await expect(toggle(page)).toHaveText(
      await toggle(page).getAttribute('data-expand'),
    );
  });

  test('closing one answer while all are open brings the label back', async ({
    page,
  }) => {
    await visit(page, '/en/');
    await toggle(page).click();
    await faqs(page).first().locator('summary').click();
    await expect(toggle(page)).toHaveText(
      await toggle(page).getAttribute('data-expand'),
    );
    await expect(toggle(page)).not.toHaveAttribute('data-all-open');
    // One more click opens the rest, it does not close the rest.
    await toggle(page).click();
    expect(await openCount(page)).toBe(await faqs(page).count());
  });

  test('opening the last closed answer by hand flips the label to "collapse all"', async ({
    page,
  }) => {
    await visit(page, '/en/');
    await toggle(page).click();
    await toggle(page).click();
    const items = faqs(page);
    const total = await items.count();
    for (let index = 0; index < total; index++)
      await items.nth(index).evaluate((el) => {
        el.open = true;
      });
    await expect(toggle(page)).toHaveText(
      await toggle(page).getAttribute('data-collapse'),
    );
    await expect(toggle(page)).toHaveAttribute('data-all-open', '');
  });
});

test.describe('the address', () => {
  test('opening a question puts it in the address without a history entry', async ({
    page,
  }) => {
    await visit(page, '/en/');
    const length = await page.evaluate(() => history.length);
    const first = faqs(page).first();
    const id = await first.getAttribute('id');
    await first.locator('summary').click();
    await expect(first).toHaveJSProperty('open', true);
    expect(await hash(page)).toBe(`#${id}`);
    expect(await page.evaluate(() => history.length)).toBe(length);
    // Closing it leaves the address as it is.
    await first.locator('summary').click();
    await expect(first).toHaveJSProperty('open', false);
    expect(await hash(page)).toBe(`#${id}`);
  });

  test('Enter and Space on a focused question do the same', async ({
    page,
  }) => {
    await visit(page, '/en/');
    for (const [index, key] of ['Enter', 'Space'].entries()) {
      const item = faqs(page).nth(index + 1);
      const id = await item.getAttribute('id');
      await item.locator('summary').focus();
      await page.keyboard.press(key);
      await expect(item, key).toHaveJSProperty('open', true);
      expect(await hash(page), key).toBe(`#${id}`);
    }
  });

  test('a page opened at a question opens it and puts it under the header', async ({
    page,
  }) => {
    await visit(page, '/en/#faq-stone');
    const item = page.locator('#faq-stone');
    await expect(item).toHaveJSProperty('open', true);
    await expect
      .poll(async () => Math.round(await topOf(item)))
      .toBe(ANCHOR_TOP);
  });

  test('an address that names nothing, or is malformed, is no error', async ({
    page,
    problems,
  }) => {
    for (const address of ['/en/#no-such-question', '/en/#%E0%A4%A', '/en/#']) {
      // A fresh load each time: a change of the fragment alone is no load.
      await page.goto('about:blank');
      await visit(page, address);
      expect(await openCount(page), address).toBe(0);
    }
    expect(problems).toEqual([]);
  });

  test('a changed address opens another question and brings it into view', async ({
    page,
  }) => {
    await visit(page, '/en/');
    const id = await faqs(page).nth(30).getAttribute('id');
    await page.evaluate((target) => {
      location.hash = target;
    }, id);
    const item = page.locator(`#${id}`);
    await expect(item).toHaveJSProperty('open', true);
    await expect
      .poll(() => item.evaluate((el) => el.getBoundingClientRect().top))
      .toBeLessThan(200);
    expect(
      await item.evaluate((el) => el.getBoundingClientRect().bottom),
    ).toBeGreaterThan(0);
  });

  test('a link in the text to a closed question opens it, every time', async ({
    page,
  }) => {
    await visit(page, '/en/');
    const link = page
      .locator('main a[href^="#faq-"]')
      .filter({ hasNot: page.locator('details a') })
      .first();
    const id = (await link.getAttribute('href')).slice(1);
    const target = page.locator(`details#${id}`);
    await link.scrollIntoViewIfNeeded();
    await link.click();
    await expect(target).toHaveJSProperty('open', true);
    // Closed again, the same link (the address already says so) opens it.
    await target.evaluate((el) => {
      el.open = false;
    });
    await link.scrollIntoViewIfNeeded();
    await link.click();
    await expect(target).toHaveJSProperty('open', true);
  });

  test.describe('with no preference for motion', () => {
    test.use({ reducedMotion: 'no-preference' });

    test('a page opened at a question shifts nothing', async ({ page }) => {
      await watchLayoutShift(page);
      await visit(page, '/en/#faq-stone');
      expect(await layoutShift(page)).toBe(0);
    });
  });
});

test.describe('copy link', () => {
  test('every answer has a button named after its question; it copies its link', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await visit(page, '/en/');
    const copies = page.locator('.faq-copy');
    expect(await copies.count()).toBe(await faqs(page).count());
    const item = faqs(page).nth(2);
    const id = await item.getAttribute('id');
    const question = (await item.locator('.faq-q').textContent()).trim();
    // Opened by "expand all", which leaves the address alone: the link is made,
    // not read from the address bar.
    await toggle(page).click();
    expect(await hash(page)).toBe('');
    const button = item.locator('.faq-copy');
    await expect(button).toHaveAccessibleName(
      new RegExp(`: ${question.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`),
    );
    await button.click();
    const message = await page
      .locator('#pc-faq-foot')
      .evaluate((template) => template.dataset.copied);
    await expect(item.locator('.faq-status')).toHaveText(message);
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      `${page.url().split('#')[0]}#${id}`,
    );
    // The message is for a moment.
    await expect(item.locator('.faq-status')).toBeEmpty();
  });

  test('a refused write says so, and is no console error', async ({
    page,
    problems,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        value: {
          writeText: () =>
            Promise.reject(new DOMException('no', 'NotAllowedError')),
        },
      });
    });
    await visit(page, '/en/');
    const item = faqs(page).first();
    await item.locator('summary').click();
    await item.locator('.faq-copy').click();
    const message = await page
      .locator('#pc-faq-foot')
      .evaluate((template) => template.dataset.failed);
    expect(message).not.toBe('');
    await expect(item.locator('.faq-status')).toHaveText(message);
    expect(problems).toEqual([]);
  });

  test('without a clipboard there is no copy button and the rest works', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', { value: undefined });
    });
    await visit(page, '/en/');
    await expect(page.locator('.faq-copy')).toHaveCount(0);
    await toggle(page).click();
    expect(await openCount(page)).toBe(await faqs(page).count());
  });

  test('Enter on the copy button copies, and Tab reaches it from the question', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await visit(page, '/en/');
    const item = faqs(page).nth(1);
    await item.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(item).toHaveJSProperty('open', true);
    // Tab walks the answer: its own links first, the copy button last.
    for (let press = 0; press < 20; press++) {
      await page.keyboard.press('Tab');
      if (
        await item
          .locator('.faq-copy')
          .evaluate((b) => b === document.activeElement)
      )
        break;
    }
    await expect(item.locator('.faq-copy')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(item.locator('.faq-status')).not.toBeEmpty();
  });

  test('closed answers add no tab stops', async ({ page }) => {
    await visit(page, '/en/');
    const stops = await page.evaluate(
      () =>
        [
          ...document.querySelectorAll('details.faq:not([open]) .faq-body *'),
        ].filter((el) => el.checkVisibility() && el.matches('a, button, input'))
          .length,
    );
    expect(stops).toBe(0);
  });
});

test.describe('paper', () => {
  test('printing opens every answer and closes only those it opened', async ({
    page,
  }) => {
    await visit(page, '/en/');
    const total = await faqs(page).count();
    const [kept] = await faqs(page).all();
    await kept.locator('summary').click();
    await page.evaluate(() => dispatchEvent(new Event('beforeprint')));
    expect(await openCount(page)).toBe(total);
    await page.evaluate(() => dispatchEvent(new Event('afterprint')));
    expect(await openCount(page)).toBe(1);
    await expect(kept).toHaveJSProperty('open', true);
  });

  test('on paper there is no toolbar, no copy button and no chevron', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await visit(page, '/en/');
    await toggle(page).click();
    await page.emulateMedia({ media: 'print' });
    await expect(toggle(page)).toBeHidden();
    await expect(page.locator('.faq-copy').first()).toBeHidden();
    await expect(page.locator('.faq-chevron').first()).toBeHidden();
  });
});

test.describe('motion', () => {
  test('with reduced motion an answer opens without a transition', async ({
    page,
  }) => {
    await visit(page, '/en/');
    expect(
      await faqs(page)
        .first()
        .evaluate(
          (el) => getComputedStyle(el, '::details-content').transitionDuration,
        ),
    ).toBe('0s');
  });

  test.describe('with no preference', () => {
    test.use({ reducedMotion: 'no-preference' });

    test('an answer grows over 0.2 s, once the page is ready', async ({
      page,
    }) => {
      await visit(page, '/en/');
      expect(
        await faqs(page)
          .first()
          .evaluate(
            (el) =>
              getComputedStyle(el, '::details-content').transitionDuration,
          ),
      ).toMatch(/^0\.2s(, 0\.2s)*$/);
    });
  });
});
