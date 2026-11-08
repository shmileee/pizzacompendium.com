import {
  ANCHOR_TOP,
  layoutShift,
  overflowsSideways,
  visit,
  watchLayoutShift,
} from '../support/content.js';
import { expect, test } from '../support/fixtures.js';

// The search dialog, the way a reader uses it: opened by the button or by
// Ctrl/Cmd+K, typed into, moved through with the keys, closed, and a choice
// that lands on its place (and opens the answer it lies in).

const dialog = (page) => page.locator('#pc-search');
const input = (page) => page.locator('#pc-search-input');
const options = (page) => page.locator('#pc-search-results > li');
const caption = (page) => page.locator('[data-search-caption]');

/** Types a query and waits for the list that belongs to it. */
async function search(page, query) {
  await input(page).fill(query);
  await expect(input(page)).toHaveValue(query);
}

/** The `type:id` of every result, in order. */
const found = (page) =>
  options(page).evaluateAll((items) =>
    items.map((item) => `${item.dataset.type}:${item.dataset.id}`),
  );

async function openByButton(page) {
  await page.locator('[data-search-open]').click();
  await expect(dialog(page)).toHaveJSProperty('open', true);
}

/** Where an element's top edge is, relative to the window. */
const topOf = (locator) =>
  locator.evaluate((element) => element.getBoundingClientRect().top);

test.describe('opening and closing', () => {
  test('the button opens the dialog on the sections of the guide', async ({
    page,
  }) => {
    await visit(page, '/pl/');
    const chapters = await page.locator('main h2[id]').count();
    await openByButton(page);
    await expect(page.locator('html')).toHaveClass(/\bsearch-open\b/);
    await expect(input(page)).toBeFocused();
    await expect(options(page)).toHaveCount(chapters);
    await expect(options(page).first()).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(input(page)).toHaveAttribute(
      'aria-activedescendant',
      'pc-search-opt-0',
    );
    await expect(caption(page)).toHaveAttribute('data-state', 'browse');
    expect(
      (await found(page)).every((entry) => entry.startsWith('chapter:')),
    ).toBe(true);
  });

  test('a bare slash does not open it', async ({ page }) => {
    await visit(page, '/en/');
    await page.keyboard.press('/');
    await expect(dialog(page)).toHaveJSProperty('open', false);
  });

  for (const chord of ['Control+K', 'Meta+K']) {
    test(`${chord} opens it, with the field selected`, async ({ page }) => {
      await visit(page, '/en/');
      await page.keyboard.press(chord);
      await expect(dialog(page)).toHaveJSProperty('open', true);
      await expect(input(page)).toBeFocused();
    });
  }

  for (const chord of ['Control+K', 'Meta+K']) {
    test(`${chord} pressed while the scripts are still loading opens it once they are there`, async ({
      page,
    }) => {
      // The last module is held back, so the search is not listening yet.
      let release;
      const held = new Promise((resolve) => {
        release = resolve;
      });
      await page.route('**/assets/js/cards.js', async (route) => {
        await held;
        await route.continue();
      });
      await page.addInitScript(() => {
        window.__pcTaken = [];
        window.addEventListener('keydown', (event) => {
          if (event.code === 'KeyK')
            window.__pcTaken.push(event.defaultPrevented);
        });
      });
      await page.goto('/en/', { waitUntil: 'domcontentloaded' });
      await expect(page.locator('html')).toHaveClass(/\bjs\b/);
      await page.keyboard.press(chord);
      await expect(dialog(page)).toHaveJSProperty('open', false);
      // The browser did not take the keys for itself.
      expect(await page.evaluate(() => window.__pcTaken)).toEqual([true]);
      release();
      await expect(dialog(page)).toHaveJSProperty('open', true);
      await expect(input(page)).toBeFocused();
    });
  }

  test('the page behind it keeps the room of its scroll bar', async ({
    page,
  }) => {
    await visit(page, '/en/');
    await openByButton(page);
    expect(
      await page.evaluate(() => {
        const style = getComputedStyle(document.documentElement);
        return [style.overflow, style.scrollbarGutter];
      }),
    ).toEqual(['hidden', 'stable']);
  });

  test('Ctrl+K with Shift or Alt does nothing, and does not close it', async ({
    page,
  }) => {
    await visit(page, '/en/');
    await page.keyboard.press('Control+Shift+K');
    await page.keyboard.press('Control+Alt+K');
    await expect(dialog(page)).toHaveJSProperty('open', false);
    await page.keyboard.press('Control+K');
    await expect(dialog(page)).toHaveJSProperty('open', true);
    await page.keyboard.press('Control+K');
    await expect(dialog(page)).toHaveJSProperty('open', true);
  });

  test('Ctrl+K finds the key by its place on a layout of another script', async ({
    page,
  }) => {
    await visit(page, '/uk/');
    // The key that is K on a Latin layout is "л" on a Ukrainian one.
    await page.evaluate(() =>
      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'л',
          code: 'KeyK',
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    await expect(dialog(page)).toHaveJSProperty('open', true);
  });

  for (const [platform, hint] of [
    ['MacIntel', '⌘K'],
    ['Win32', 'Ctrl K'],
  ])
    test(`the hint on the button names the key of ${platform}`, async ({
      page,
    }) => {
      await page.addInitScript((value) => {
        Object.defineProperty(navigator, 'platform', { get: () => value });
      }, platform);
      await visit(page, '/en/');
      await expect(page.locator('[data-search-kbd]')).toHaveText(hint);
    });

  test('Escape closes it in one press and gives the focus back', async ({
    page,
  }) => {
    await visit(page, '/en/');
    await openByButton(page);
    await search(page, 'dough');
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveJSProperty('open', false);
    await expect(page.locator('html')).not.toHaveClass(/\bsearch-open\b/);
    await expect(page.locator('[data-search-open]')).toBeFocused();
  });

  test('the close button closes it', async ({ page }) => {
    await visit(page, '/en/');
    await openByButton(page);
    await page.locator('[data-search-close]').click();
    await expect(dialog(page)).toHaveJSProperty('open', false);
  });

  test('a click on the backdrop closes it, a drag from the field to it does not', async ({
    page,
  }) => {
    await visit(page, '/en/');
    await openByButton(page);
    const field = await input(page).boundingBox();
    // Below the dialog's box there is nothing but the backdrop.
    const outside = { x: 4, y: 880 };
    await page.mouse.move(field.x + 20, field.y + field.height / 2);
    await page.mouse.down();
    await page.mouse.move(outside.x, outside.y);
    await page.mouse.up();
    await expect(dialog(page)).toHaveJSProperty('open', true);
    await page.mouse.click(outside.x, outside.y);
    await expect(dialog(page)).toHaveJSProperty('open', false);
  });

  test('Tab stays in the dialog and never stops on the list', async ({
    page,
  }) => {
    await visit(page, '/en/');
    await openByButton(page);
    for (let press = 0; press < 5; press++) {
      await page.keyboard.press('Tab');
      const where = await page.evaluate(() => ({
        // Past the last control the focus leaves the page (to the browser's
        // own controls), where the document has none.
        inside:
          document.activeElement === document.body ||
          Boolean(document.activeElement.closest('#pc-search')),
        list: document.activeElement.id === 'pc-search-results',
      }));
      expect(where.list, `Tab ${press + 1} stopped on the list`).toBe(false);
      expect(where.inside, `Tab ${press + 1} left the dialog`).toBe(true);
    }
  });

  test('the shortcuts do nothing while the contents drawer is open', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await visit(page, '/en/');
    await page.locator('#toc-toggle').click();
    await expect(page.locator('html')).toHaveClass(/\btoc-open\b/);
    await page.keyboard.press('Control+K');
    await expect(dialog(page)).toHaveJSProperty('open', false);
  });
});

test.describe('matching', () => {
  test('diacritics and case do not matter: maka, mąka and MĄKA are one search', async ({
    page,
  }) => {
    await visit(page, '/pl/');
    await openByButton(page);
    const lists = [];
    for (const query of ['maka', 'mąka', 'MĄKA']) {
      await search(page, query);
      lists.push(await found(page));
    }
    expect(lists[0].length).toBeGreaterThan(1);
    expect(lists[1]).toEqual(lists[0]);
    expect(lists[2]).toEqual(lists[0]);
  });

  test('flour leads with the chapter on flours, marked, at most ten results', async ({
    page,
  }) => {
    await visit(page, '/pl/');
    await openByButton(page);
    await search(page, 'maka');
    expect((await found(page))[0]).toBe('chapter:popular-flours');
    expect(await options(page).count()).toBeLessThanOrEqual(10);
    await expect(options(page).first().locator('mark').first()).toHaveText(
      /^m[aą]k/i,
    );
    await expect(caption(page)).toHaveAttribute('data-state', 'results');
    await expect(caption(page)).not.toBeEmpty();
  });

  test('a Polish l with a stroke and an o with a stroke are found by their plain letters', async ({
    page,
  }) => {
    await visit(page, '/pl/');
    await openByButton(page);
    for (const [plain, accented] of [
      ['lopata', 'łopata'],
      ['lodowka', 'lodówka'],
    ]) {
      await search(page, plain);
      const withPlain = await found(page);
      await search(page, accented);
      expect(withPlain.length, plain).toBeGreaterThan(0);
      expect(await found(page), accented).toEqual(withPlain);
    }
  });

  test('Cyrillic: case and the apostrophe do not matter, a Latin look-alike is not Cyrillic', async ({
    page,
  }) => {
    await visit(page, '/uk/');
    await openByButton(page);
    await search(page, 'борошно');
    const flour = await found(page);
    expect(flour.length).toBeGreaterThan(0);
    await search(page, 'БОРОШНО');
    expect(await found(page), 'capitals').toEqual(flour);
    // Other forms of the word: the same chapters, the exact form first.
    for (const query of ['Борошна', 'БОРОШНУ']) {
      await search(page, query);
      expect(await found(page), query).toEqual(
        expect.arrayContaining([
          'chapter:popular-flours',
          'chapter:flour-strength',
        ]),
      );
    }
    await search(page, 'м’ясо');
    const meat = await found(page);
    expect(meat.length).toBeGreaterThan(0);
    for (const query of ["м'ясо", 'мясо']) {
      await search(page, query);
      expect(await found(page), query).toEqual(meat);
    }
    // The Latin "i" in a Ukrainian word is another letter.
    await search(page, 'дрiжджі');
    await expect(options(page)).toHaveCount(0);
  });

  test('every word must be found: a word that is nowhere narrows to nothing', async ({
    page,
  }) => {
    await visit(page, '/en/');
    await openByButton(page);
    await search(page, 'mozzarella');
    expect((await found(page)).length).toBeGreaterThan(0);
    await search(page, 'mozzarella zzzzzz');
    await expect(options(page)).toHaveCount(0);
  });

  test('an ordinary space in the query finds a no-break space in the text', async ({
    page,
  }) => {
    await visit(page, '/pl/');
    await page.evaluate(() => {
      const p = document.createElement('p');
      p.textContent = 'Zażółć gęślą jaźń';
      document.querySelector('main').append(p);
    });
    await openByButton(page);
    await search(page, 'zazolc gesla');
    await expect(options(page)).toHaveCount(1);
    await expect(options(page).first().locator('mark')).toHaveCount(2);
  });

  test('navigation queries lead with the section that was meant', async ({
    page,
  }) => {
    await visit(page, '/pl/');
    await openByButton(page);
    await search(page, 'faq');
    expect((await found(page))[0]).toBe('chapter:faq');
    await search(page, 'przepis');
    expect((await found(page))[0]).toBe('chapter:recipe');
    await search(page, 'pierwsza pizza');
    const first = await found(page);
    expect(first.indexOf('chapter:quick-start')).toBe(0);
    expect(first).toContain('chapter:first-bake');
  });

  test('sections come before questions and questions before body text', async ({
    page,
  }) => {
    await visit(page, '/en/');
    await openByButton(page);
    await search(page, 'mozzarella');
    const rank = { chapter: 0, question: 1, text: 2 };
    const types = (await found(page)).map((entry) => entry.split(':')[0]);
    expect(new Set(types).size, 'a mix of kinds').toBeGreaterThan(1);
    expect(types.map((type) => rank[type])).toEqual(
      types.map((type) => rank[type]).sort((a, b) => a - b),
    );
  });

  test('every result leads to a place of its own', async ({ page }) => {
    await visit(page, '/en/');
    await openByButton(page);
    await search(page, 'pizza');
    const places = await found(page);
    expect(places.length).toBeGreaterThan(1);
    expect(new Set(places).size).toBe(places.length);
    expect(await options(page).count()).toBeLessThanOrEqual(10);
  });

  test('page text is shown as text: markup in it does not become markup', async ({
    page,
  }) => {
    await visit(page, '/en/');
    // Added before the first opening: the index is read then, not at load.
    await page.evaluate(() => {
      const p = document.createElement('p');
      p.textContent =
        'plainmarker <img src=x onerror="window.__pwned = 1"> <b>';
      document.querySelector('main').append(p);
    });
    await openByButton(page);
    await search(page, 'plainmarker');
    await expect(options(page)).toHaveCount(1);
    await expect(options(page).first().locator('img, b, script')).toHaveCount(
      0,
    );
    await expect(options(page).first().locator('.search-title')).toContainText(
      '<img',
    );
    expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
  });
});

test.describe('the list', () => {
  test('nothing found: the list is hidden, the field says so, the keys do nothing', async ({
    page,
  }) => {
    await visit(page, '/en/');
    await openByButton(page);
    await search(page, 'qqqqqq');
    await expect(page.locator('#pc-search-results')).toBeHidden();
    await expect(input(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(input(page)).not.toHaveAttribute('aria-activedescendant');
    await expect(caption(page)).toHaveAttribute('data-state', 'none');
    const none = await dialog(page).getAttribute('data-none');
    await expect(caption(page)).toHaveText(none);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(dialog(page)).toHaveJSProperty('open', true);
    // The live region repeats it once the typing has stopped.
    await expect(page.locator('#pc-search-status')).toHaveText(none);
  });

  test('clearing the field, or punctuation alone, shows the sections again', async ({
    page,
  }) => {
    await visit(page, '/en/');
    await openByButton(page);
    const sections = await found(page);
    await search(page, 'dough');
    expect(await found(page)).not.toEqual(sections);
    await search(page, '');
    expect(await found(page)).toEqual(sections);
    await search(page, 'dough');
    await search(page, '?! —');
    expect(await found(page)).toEqual(sections);
    await expect(options(page).first()).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(caption(page)).toHaveAttribute('data-state', 'browse');
  });

  test('the arrows move the choice and wrap at both ends', async ({ page }) => {
    await visit(page, '/en/');
    await openByButton(page);
    const total = await options(page).count();
    const selected = () =>
      page.evaluate(() => ({
        index: [
          ...document.querySelectorAll('#pc-search-results > li'),
        ].findIndex((li) => li.getAttribute('aria-selected') === 'true'),
        active: document
          .getElementById('pc-search-input')
          .getAttribute('aria-activedescendant'),
        chosen: document.querySelectorAll(
          '#pc-search-results [aria-selected="true"]',
        ).length,
      }));
    await page.keyboard.press('ArrowDown');
    expect(await selected()).toEqual({
      index: 1,
      active: 'pc-search-opt-1',
      chosen: 1,
    });
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    expect(await selected()).toEqual({
      index: total - 1,
      active: `pc-search-opt-${total - 1}`,
      chosen: 1,
    });
    await page.keyboard.press('ArrowDown');
    expect((await selected()).index).toBe(0);
  });

  test('the chosen option stays inside the scrolling list on a short window', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await visit(page, '/en/');
    await openByButton(page);
    await page.keyboard.press('ArrowUp');
    const inside = await page.evaluate(() => {
      const list = document.getElementById('pc-search-results');
      const item = list
        .querySelector('[aria-selected="true"]')
        .getBoundingClientRect();
      const box = list.getBoundingClientRect();
      return item.top >= box.top - 1 && item.bottom <= box.bottom + 1;
    });
    expect(inside).toBe(true);
  });

  test('the last query is still there when it is opened again', async ({
    page,
  }) => {
    await visit(page, '/en/');
    await openByButton(page);
    await search(page, 'yeast');
    const before = await found(page);
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveJSProperty('open', false);
    await openByButton(page);
    await expect(input(page)).toHaveValue('yeast');
    expect(await found(page)).toEqual(before);
    await expect(options(page).first()).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  test('the mouse chooses by hover and by click', async ({ page }) => {
    await visit(page, '/en/');
    await openByButton(page);
    await options(page).nth(2).hover();
    await expect(options(page).nth(2)).toHaveAttribute('aria-selected', 'true');
    const id = await options(page).nth(2).getAttribute('data-id');
    await options(page).nth(2).click();
    await expect(dialog(page)).toHaveJSProperty('open', false);
    await expect.poll(() => page.evaluate(() => location.hash)).toBe(`#${id}`);
  });
});

test.describe('choosing', () => {
  test('a section: the hash, the heading under the header with focus, a mark that fades', async ({
    page,
  }) => {
    await visit(page, '/en/');
    await openByButton(page);
    await search(page, 'mozzarella');
    const [first] = await found(page);
    const [kind, id] = first.split(':');
    expect(kind).toBe('chapter');
    await page.keyboard.press('Enter');
    await expect(dialog(page)).toHaveJSProperty('open', false);
    const heading = page.locator(`#${id}`);
    await expect(heading).toBeFocused();
    expect(await page.evaluate(() => location.hash)).toBe(`#${id}`);
    expect(Math.round(await topOf(heading))).toBe(ANCHOR_TOP);
    await expect(heading).toHaveClass(/\bsearch-hit\b/);
    // The mark is for a moment: 1.8 seconds.
    await expect(page.locator('.search-hit')).toHaveCount(0);
  });

  test('a question: the answer opens, the question is under the header with focus', async ({
    page,
  }) => {
    await visit(page, '/pl/');
    await openByButton(page);
    await search(page, 'mrozic drozdze');
    const first = (await found(page))[0];
    const [kind, id] = first.split(':');
    expect(kind).toBe('question');
    const answer = page.locator(`details#${id}`);
    await expect(answer).not.toHaveJSProperty('open', true);
    await page.keyboard.press('Enter');
    await expect(answer).toHaveJSProperty('open', true);
    await expect(answer.locator('summary')).toBeFocused();
    expect(await page.evaluate(() => location.hash)).toBe(`#${id}`);
    await expect
      .poll(async () => Math.round(await topOf(answer.locator('summary'))))
      .toBe(ANCHOR_TOP);
  });

  test('text in a closed answer: the answer opens and the paragraph is marked', async ({
    page,
  }) => {
    await visit(page, '/pl/');
    await openByButton(page);
    await search(page, 'kryształki lodu');
    expect(await found(page)).toEqual(['text:faq-freeze-mozzarella']);
    const answer = page.locator('details#faq-freeze-mozzarella');
    await expect(answer).not.toHaveJSProperty('open', true);
    await page.keyboard.press('Enter');
    await expect(answer).toHaveJSProperty('open', true);
    await expect(answer.locator('summary')).toBeFocused();
    const hit = answer.locator('.search-hit');
    await expect(hit).toContainText('kryształki lodu');
    const [summaryTop, hitTop] = [
      await topOf(answer.locator('summary')),
      await topOf(hit),
    ];
    expect(Math.round(summaryTop)).toBe(ANCHOR_TOP);
    expect(hitTop).toBeGreaterThan(summaryTop);
    // The answer's own growth does not carry the place away.
    await expect(hit).toHaveCount(0);
  });

  test('text deep in a long answer on a phone: the paragraph, not the question, is brought up', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await visit(page, '/pl/');
    // The last paragraph of the tallest answer of the page.
    const target = await page.evaluate(() => {
      const faqs = [...document.querySelectorAll('details.faq')];
      for (const faq of faqs) faq.open = true;
      const tallest = faqs.sort((a, b) => b.offsetHeight - a.offsetHeight)[0];
      const paragraph = [...tallest.querySelectorAll('.faq-body > p')].at(-1);
      for (const faq of faqs) faq.open = false;
      return { id: tallest.id, text: paragraph.textContent.trim() };
    });
    const words = target.text.split(/\s+/).slice(0, 4).join(' ');
    await openByButton(page);
    await search(page, words);
    await page.keyboard.press('Enter');
    await expect(dialog(page)).toHaveJSProperty('open', false);
    const hit = page.locator('.search-hit');
    await expect(hit).toContainText(words.split(' ')[0]);
    await expect(hit).toBeFocused();
    expect(Math.round(await topOf(hit))).toBe(ANCHOR_TOP);
    await expect(page.locator(`#${target.id}`)).toHaveJSProperty('open', true);
  });

  test('a flour card: its title is brought up and the section is in the address', async ({
    page,
  }) => {
    await visit(page, '/pl/');
    await openByButton(page);
    await search(page, 'caputo cuoco');
    await page.keyboard.press('Enter');
    await expect(dialog(page)).toHaveJSProperty('open', false);
    expect(await page.evaluate(() => location.hash)).toBe('#popular-flours');
    const hit = page.locator('.search-hit');
    await expect(hit).toContainText(/caputo cuoco/i);
    await expect(hit).toBeFocused();
    expect(Math.round(await topOf(hit))).toBe(ANCHOR_TOP);
  });

  test('a card the filter hides leaves the reader at the heading of its section', async ({
    page,
  }) => {
    await visit(page, '/pl/');
    await page.locator('[data-filter="beginner"]').click();
    const hidden = await page.evaluate(() => {
      const card = document.querySelector('.card[hidden] .card-title');
      return card.textContent.trim();
    });
    await openByButton(page);
    await search(page, hidden);
    await page.keyboard.press('Enter');
    await expect(dialog(page)).toHaveJSProperty('open', false);
    expect(await page.evaluate(() => location.hash)).toBe('#popular-flours');
    await expect(page.locator('#popular-flours')).toBeFocused();
    await expect(page.locator('.card[hidden]').first()).toBeHidden();
  });

  test('choosing the place that is already in the address adds no history entry', async ({
    page,
  }) => {
    await visit(page, '/en/');
    await openByButton(page);
    await search(page, 'mozzarella');
    await page.keyboard.press('Enter');
    await expect(dialog(page)).toHaveJSProperty('open', false);
    const length = await page.evaluate(() => history.length);
    await openByButton(page);
    await expect(options(page).first()).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.keyboard.press('Enter');
    await expect(dialog(page)).toHaveJSProperty('open', false);
    expect(await page.evaluate(() => history.length)).toBe(length);
  });

  test('Back after a choice returns to the earlier address and place', async ({
    page,
  }) => {
    await visit(page, '/en/');
    await openByButton(page);
    await search(page, 'mozzarella');
    await page.keyboard.press('Enter');
    await expect(dialog(page)).toHaveJSProperty('open', false);
    expect(await page.evaluate(() => scrollY)).toBeGreaterThan(500);
    await page.goBack();
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('');
    await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThan(5);
  });

  test('opening, typing and choosing shift nothing and report nothing', async ({
    page,
    problems,
  }) => {
    await watchLayoutShift(page);
    await visit(page, '/en/');
    const before = await layoutShift(page);
    await openByButton(page);
    await search(page, 'yeast');
    await page.keyboard.press('Enter');
    await expect(dialog(page)).toHaveJSProperty('open', false);
    expect((await layoutShift(page)) - before).toBe(0);
    expect(problems).toEqual([]);
  });
});

test.describe('layout', () => {
  test('at 320 px the dialog fits the window and its options are touch targets', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await visit(page, '/uk/');
    await openByButton(page);
    await search(page, 'борошно');
    const box = await dialog(page).boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(320);
    expect(await overflowsSideways(page)).toBe(false);
    for (const height of await options(page).evaluateAll((items) =>
      items.map((item) => item.getBoundingClientRect().height),
    ))
      expect(height).toBeGreaterThanOrEqual(44);
  });

  test('on paper the dialog is not printed, even when it is open', async ({
    page,
  }) => {
    await visit(page, '/en/');
    await openByButton(page);
    await page.emulateMedia({ media: 'print' });
    await expect(dialog(page)).toHaveCSS('display', 'none');
    await expect(page.locator('.site-header')).toHaveCSS('display', 'none');
  });

  test('with reduced motion the dialog and the mark do not animate', async ({
    page,
  }) => {
    await visit(page, '/en/');
    await openByButton(page);
    await expect(dialog(page)).toHaveCSS('animation-name', 'none');
    await search(page, 'mozzarella');
    await page.keyboard.press('Enter');
    const hit = page.locator('.search-hit');
    await expect(hit).toHaveCSS('animation-name', 'none');
    expect(
      await hit.evaluate((el) => getComputedStyle(el).backgroundColor),
    ).not.toBe('rgba(0, 0, 0, 0)');
  });
});
