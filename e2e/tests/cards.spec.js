import { LANGUAGES, visit } from '../support/content.js';
import { expect, test } from '../support/fixtures.js';

// The flour cards and the filter above them.

const group = (page) => page.locator('[data-cards-filter]');
const wrap = (page) => page.locator('.cards-wrap').filter({ has: group(page) });
const cards = (page) => wrap(page).locator('.card');
const shown = (page) => wrap(page).locator('.card:not([hidden])');

/** The status line the template makes of two numbers. */
const status = (template, count, total) =>
  template.replace('{shown}', count).replace('{total}', total);

for (const code of LANGUAGES) {
  test.describe(`on the ${code} page`, () => {
    test('the filter is shown, "all" is pressed, every card is shown', async ({
      page,
    }) => {
      await visit(page, `/${code}/`);
      await expect(group(page)).toBeVisible();
      await expect(group(page)).not.toHaveAttribute('hidden');
      await expect(group(page).locator('[data-filter="all"]')).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await expect(
        group(page).locator('[data-filter="beginner"]'),
      ).toHaveAttribute('aria-pressed', 'false');
      const total = await cards(page).count();
      expect(total).toBeGreaterThan(6);
      await expect(shown(page)).toHaveCount(total);
      const template = await group(page).getAttribute('data-status');
      await expect(group(page).locator('.cards-status')).toHaveText(
        status(template, total, total),
      );
    });

    test('"beginner" keeps the marked cards and hides the others', async ({
      page,
    }) => {
      await visit(page, `/${code}/`);
      const total = await cards(page).count();
      const marked = await wrap(page)
        .locator('.card[data-level="beginner"]')
        .count();
      expect(marked).toBeGreaterThan(0);
      expect(marked).toBeLessThan(total);
      const template = await group(page).getAttribute('data-status');
      await group(page).locator('[data-filter="beginner"]').click();
      await expect(shown(page)).toHaveCount(marked);
      expect(
        await shown(page).evaluateAll((items) =>
          items.every((item) => item.dataset.level === 'beginner'),
        ),
      ).toBe(true);
      // Hidden by the attribute, which is what takes a card out of the page
      // for everyone, not only out of sight.
      await expect(wrap(page).locator('.card[hidden]')).toHaveCount(
        total - marked,
      );
      await expect(wrap(page).locator('.card[hidden]').first()).toBeHidden();
      await expect(
        group(page).locator('[data-filter="beginner"]'),
      ).toHaveAttribute('aria-pressed', 'true');
      await expect(group(page).locator('[data-filter="all"]')).toHaveAttribute(
        'aria-pressed',
        'false',
      );
      await expect(group(page).locator('.cards-status')).toHaveText(
        status(template, marked, total),
      );
      await group(page).locator('[data-filter="all"]').click();
      await expect(shown(page)).toHaveCount(total);
      await expect(group(page).locator('.cards-status')).toHaveText(
        status(template, total, total),
      );
    });

    test('every marked card says so in words, no other does', async ({
      page,
    }) => {
      await visit(page, `/${code}/`);
      const badges = await wrap(page).evaluate((element) => {
        const texts = (selector) =>
          [...element.querySelectorAll(selector)].map((el) =>
            el.textContent.trim(),
          );
        return {
          marked: element.querySelectorAll('.card[data-level="beginner"]')
            .length,
          badged: element.querySelectorAll('.card:has(.card-badge)').length,
          badges: texts('.card-badge'),
          titles: texts('.card-title'),
          filter: texts('[data-filter="beginner"]'),
        };
      });
      expect(badges.badged).toBe(badges.marked);
      expect(new Set(badges.badges).size).toBe(1);
      // The badge and the filter use the same word.
      expect(badges.filter[0]).toContain(badges.badges[0].replace(/\s+/g, ' '));
      expect(badges.titles.every((title) => title.length > 0)).toBe(true);
    });
  });
}

test('the filter buttons answer to Enter and Space', async ({ page }) => {
  await visit(page, '/en/');
  const total = await cards(page).count();
  const beginner = group(page).locator('[data-filter="beginner"]');
  const all = group(page).locator('[data-filter="all"]');
  await beginner.focus();
  await page.keyboard.press('Enter');
  await expect(beginner).toHaveAttribute('aria-pressed', 'true');
  expect(await shown(page).count()).toBeLessThan(total);
  await all.focus();
  await page.keyboard.press('Space');
  await expect(all).toHaveAttribute('aria-pressed', 'true');
  await expect(shown(page)).toHaveCount(total);
});

test('a card holds a title, and chips are the short leading facts', async ({
  page,
}) => {
  await visit(page, '/en/');
  const facts = await wrap(page).evaluate((element) => {
    const chips = (card) => card.querySelectorAll('.card-fact').length;
    const byTitle = (text) =>
      [...element.querySelectorAll('.card')].find((card) =>
        card.querySelector('.card-title').textContent.includes(text),
      );
    return {
      stagioni: chips(byTitle('5 Stagioni Superiore')),
      divella: chips(byTitle('Divella')),
    };
  });
  expect(facts.stagioni).toBe(2);
  expect(facts.divella).toBe(0);
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('the filter stays hidden and every card is shown', async ({ page }) => {
    await page.goto('/en/');
    await expect(group(page)).toBeHidden();
    await expect(group(page)).toHaveAttribute('hidden', '');
    const all = await cards(page).count();
    expect(all).toBeGreaterThan(6);
    for (const card of await cards(page).all())
      await expect(card).toBeVisible();
    await expect(wrap(page).locator('.card[hidden]')).toHaveCount(0);
  });
});
