import { visit } from '../support/content.js';
import { expect, test } from '../support/fixtures.js';

// Reduced motion: nothing animates for a visitor who asked for none, and the
// page still does what it did.

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('nothing on the page runs an animation or a long transition', async ({
    page,
  }) => {
    await visit(page, '/en/');
    await page.locator('[data-search-open]').click();
    await page.locator('#pc-search-input').fill('dough');
    // The stylesheet leaves 0.00001 s, not zero, so that events still fire.
    const longer = (times) =>
      times.split(',').some((time) => Number.parseFloat(time) > 0.001);
    const moving = await page.evaluate(
      (source) =>
        [...document.querySelectorAll('body *')]
          .map((element) => {
            const style = getComputedStyle(element);
            const longer = new Function(`return ${source}`)();
            return {
              name: `${element.tagName}.${element.className}`,
              animated:
                style.animationName !== 'none' &&
                longer(style.animationDuration),
              slow: longer(style.transitionDuration),
            };
          })
          .filter((entry) => entry.animated || entry.slow),
      longer.toString(),
    );
    expect(moving).toEqual([]);
  });

  test('a jump to an anchor is instant', async ({ page }) => {
    await visit(page, '/en/');
    expect(
      await page.evaluate(() => {
        // The script marks a long jump as instant whatever the stylesheet
        // says; take the mark off to see what the stylesheet says.
        document.documentElement.classList.remove('jump-instant');
        return getComputedStyle(document.documentElement).scrollBehavior;
      }),
    ).not.toBe('smooth');
    await page.locator('#toc a[href="#quick-start"]').first().click();
    await expect
      .poll(() => page.evaluate(() => location.hash))
      .toBe('#quick-start');
    await expect(page.locator('#quick-start')).toBeInViewport();
  });
});

test.describe('with no preference', () => {
  test.use({ reducedMotion: 'no-preference' });

  test('the page works the same: search, answers and filter', async ({
    page,
    problems,
  }) => {
    await visit(page, '/en/');
    await page.keyboard.press('Control+K');
    await page.locator('#pc-search-input').fill('mozzarella');
    await page.keyboard.press('Enter');
    await expect(page.locator('#pc-search')).toHaveJSProperty('open', false);
    await expect(page.locator('.search-hit').first()).toBeVisible();
    await page.locator('[data-faq-toggle]').click();
    await expect(page.locator('details.faq:not([open])')).toHaveCount(0);
    await page.locator('[data-filter="beginner"]').click();
    await expect(page.locator('.card[hidden]').first()).toBeHidden();
    expect(problems).toEqual([]);
  });
});
