import { expect, test } from '../support/fixtures.js';
import { visit } from '../support/pointer.js';

// The theme button: match system, light, dark, match system. The choice is
// remembered, and the page has it before the first paint.
const KEY = 'pizzacompendium-theme';
const PAPER = { light: 'rgb(248, 242, 231)', dark: 'rgb(27, 22, 18)' };
const BARS = { light: '#f8f2e7', dark: '#1b1612' };

const html = (page) => page.locator('html');
const button = (page) => page.locator('#pc-theme');
const stored = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);
const paper = (page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const bars = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('meta[name="theme-color"]')].map(
      (meta) => meta.content,
    ),
  );

/** Remembers a value in the page's storage before its scripts run. */
const remember = (page, value) =>
  page.addInitScript(
    ([key, text]) => localStorage.setItem(key, text),
    [KEY, value],
  );

test.describe('the button', () => {
  test('starts on match system: no data-theme, the name says what comes next', async ({
    page,
  }) => {
    await visit(page, '/en/');
    await expect(html(page)).not.toHaveAttribute('data-theme', /.*/);
    await expect(button(page)).toBeVisible();
    await expect(button(page)).toHaveAccessibleName(
      'Theme: match system. Switch to light.',
    );
    expect(await stored(page)).toBeNull();
  });

  test('three presses go light, dark, match system, and each is remembered', async ({
    page,
  }) => {
    await visit(page, '/en/');
    const steps = [
      ['light', 'Theme: light. Switch to dark.'],
      ['dark', 'Theme: dark. Switch to match system.'],
      ['auto', 'Theme: match system. Switch to light.'],
    ];
    for (const [mode, name] of steps) {
      await button(page).click();
      await expect(button(page)).toHaveAccessibleName(name);
      if (mode === 'auto')
        await expect(html(page)).not.toHaveAttribute('data-theme', /.*/);
      else await expect(html(page)).toHaveAttribute('data-theme', mode);
      expect(await stored(page)).toBe(mode);
    }
  });

  test('a press says the new mode in a status region for screen readers', async ({
    page,
  }) => {
    await visit(page, '/en/');
    const status = page.locator('#pc-theme-status');
    await expect(status).toHaveText('');
    await button(page).click();
    await expect(status).toHaveText('Theme: light. Switch to dark.');
    await button(page).click();
    await expect(status).toHaveText('Theme: dark. Switch to match system.');
  });

  test('the colour of the browser bars follows the mode and goes back with it', async ({
    page,
  }) => {
    await visit(page, '/en/');
    expect(await bars(page)).toEqual([BARS.light, BARS.dark]);
    await button(page).click();
    expect(await bars(page)).toEqual([BARS.light, BARS.light]);
    await button(page).click();
    expect(await bars(page)).toEqual([BARS.dark, BARS.dark]);
    await button(page).click();
    expect(await bars(page)).toEqual([BARS.light, BARS.dark]);
  });

  test('is the same in every language (the name comes from the text of the page)', async ({
    page,
  }) => {
    await visit(page, '/uk/');
    await expect(button(page)).toHaveAccessibleName(/\S/);
    await expect(button(page)).not.toHaveAccessibleName(
      'Theme: match system. Switch to light.',
    );
    await button(page).click();
    await expect(html(page)).toHaveAttribute('data-theme', 'light');
  });

  test('keeps the choice across a reload and a visit to another language', async ({
    page,
  }) => {
    await visit(page, '/en/');
    await button(page).click();
    await button(page).click();
    await expect(html(page)).toHaveAttribute('data-theme', 'dark');
    await page.reload();
    await expect(html(page)).toHaveAttribute('data-theme', 'dark');
    // The scripts take the saved mode up: the next press goes on from it.
    await button(page).click();
    await expect(html(page)).not.toHaveAttribute('data-theme', /.*/);
    await visit(page, '/pl/');
    await expect(html(page)).not.toHaveAttribute('data-theme', /.*/);
    await button(page).click();
    await visit(page, '/uk/');
    await expect(html(page)).toHaveAttribute('data-theme', 'light');
  });
});

test.describe('colours', () => {
  for (const system of ['light', 'dark']) {
    test.describe(`system ${system}`, () => {
      test.use({ colorScheme: system });

      test('match system follows the system', async ({ page }) => {
        await visit(page, '/en/');
        expect(await paper(page)).toBe(PAPER[system]);
      });

      for (const mode of ['light', 'dark']) {
        test(`the saved mode ${mode} wins over the system`, async ({
          page,
        }) => {
          await remember(page, mode);
          await visit(page, '/en/');
          expect(await paper(page)).toBe(PAPER[mode]);
        });
      }
    });
  }
});

test.describe('before the first paint', () => {
  test('the saved mode is on <html> by the time the body is there', async ({
    page,
  }) => {
    await remember(page, 'dark');
    await page.addInitScript(() => {
      new MutationObserver((_records, observer) => {
        if (!document.body) return;
        window.themeAtBody = document.documentElement.dataset.theme;
        observer.disconnect();
      }).observe(document, { childList: true, subtree: true });
    });
    await visit(page, '/en/');
    expect(await page.evaluate(() => window.themeAtBody)).toBe('dark');
  });

  test('the inline script alone does it: the page is dark with the app script blocked', async ({
    page,
    problems,
  }) => {
    problems.allow(/Failed to load resource/);
    await page.route('**/assets/app.js', (route) => route.abort());
    await remember(page, 'dark');
    await page.goto('/en/');
    await expect(html(page)).toHaveAttribute('data-theme', 'dark');
    expect(await paper(page)).toBe(PAPER.dark);
  });

  test('a saved value that is no mode is ignored', async ({ page }) => {
    await remember(page, 'sepia');
    await visit(page, '/en/');
    await expect(html(page)).not.toHaveAttribute('data-theme', /.*/);
    expect(await paper(page)).toBe(PAPER.light);
    await button(page).click();
    await expect(html(page)).toHaveAttribute('data-theme', 'light');
  });
});

test.describe('storage blocked', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new DOMException('blocked', 'SecurityError');
        },
      });
    });
  });

  test('the page loads and the button still changes the page', async ({
    page,
  }) => {
    await visit(page, '/en/');
    await button(page).click();
    await expect(html(page)).toHaveAttribute('data-theme', 'light');
    await button(page).click();
    await expect(html(page)).toHaveAttribute('data-theme', 'dark');
    expect(await paper(page)).toBe(PAPER.dark);
  });
});

test.describe('without scripts', () => {
  test('there is no button that does nothing', async ({ browser, baseURL }) => {
    const context = await browser.newContext({
      baseURL,
      javaScriptEnabled: false,
    });
    const page = await context.newPage();
    await visit(page, '/en/');
    await expect(button(page)).toBeHidden();
    await context.close();
  });
});

test.describe('the root page', () => {
  test('wears the saved mode while it sends the reader on', async ({
    page,
  }) => {
    // The installed app starts here, so it must not flash light before the
    // language page is there. The page sends the reader on from its head,
    // and the browser may never get to its body: the mode it has is the one
    // it has when its last script, the one that sends the reader on, is in.
    const seen = [];
    await page.exposeBinding('__pcThemeAtScript', (_source, path, theme) =>
      seen.push([path, theme]),
    );
    await page.addInitScript(() => {
      new MutationObserver((records, observer) => {
        const scripts = records.flatMap((record) =>
          [...record.addedNodes].filter(
            (node) =>
              node.nodeName === 'SCRIPT' &&
              node.textContent.includes('location'),
          ),
        );
        if (scripts.length === 0) return;
        observer.disconnect();
        window.__pcThemeAtScript(
          location.pathname,
          document.documentElement.dataset.theme ?? null,
        );
      }).observe(document, { childList: true, subtree: true });
    });
    await remember(page, 'dark');
    await page.goto('/');
    await page.waitForURL(/\/en\/$/);
    await expect.poll(() => seen).toContainEqual(['/', 'dark']);
  });
});

test.describe('the 404 page', () => {
  test('wears the saved mode too', async ({ page, problems }) => {
    problems.allow(/status of 404/);
    await remember(page, 'dark');
    await visit(page, '/no-such-page/');
    await expect(html(page)).toHaveAttribute('data-theme', 'dark');
    expect(await paper(page)).toBe(PAPER.dark);
  });
});
