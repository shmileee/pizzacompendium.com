import { expect, test } from '../support/fixtures.js';

// The pages around the guide: the root page that sends the reader to a
// language, the 404 page, the manifests and icons, and the footer.
const KEY = 'pizzacompendium-lang';
const LANGUAGES = ['pl', 'en', 'uk'];

/** Where the root page sends a reader whose browser prefers `locale`. */
const landing = async (browser, baseURL, options, path = '/') => {
  const context = await browser.newContext({ baseURL, ...options });
  const page = await context.newPage();
  await page.goto(path);
  await page.waitForURL(/\/(pl|en|uk)\//);
  const { pathname, search, hash } = new URL(page.url());
  await context.close();
  return pathname + search + hash;
};

test.describe('the root page', () => {
  const byLocale = [
    ['pl-PL', '/pl/'],
    ['en-GB', '/en/'],
    ['en-US', '/en/'],
    ['uk-UA', '/uk/'],
    ['uk', '/uk/'],
    // No such language on the site: the source language.
    ['de-DE', '/pl/'],
  ];
  for (const [locale, expected] of byLocale)
    test(`sends a ${locale} browser to ${expected}`, async ({
      browser,
      baseURL,
    }) => {
      expect(await landing(browser, baseURL, { locale })).toBe(expected);
    });

  test('takes the first of the browser languages that the site has', async ({
    browser,
    baseURL,
  }) => {
    const context = await browser.newContext({ baseURL, locale: 'de-DE' });
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'languages', {
        get: () => ['de-DE', 'uk-UA', 'en'],
      });
    });
    const page = await context.newPage();
    await page.goto('/');
    await page.waitForURL(/\/uk\//);
    await context.close();
  });

  test('the remembered language wins over the browser language', async ({
    browser,
    baseURL,
  }) => {
    const context = await browser.newContext({ baseURL, locale: 'pl-PL' });
    await context.addInitScript((key) => localStorage.setItem(key, 'en'), KEY);
    const page = await context.newPage();
    await page.goto('/');
    await page.waitForURL(/\/en\//);
    await context.close();
  });

  test('a remembered value that is no language of the site is ignored', async ({
    browser,
    baseURL,
  }) => {
    const context = await browser.newContext({ baseURL, locale: 'uk-UA' });
    await context.addInitScript((key) => localStorage.setItem(key, 'xx'), KEY);
    const page = await context.newPage();
    await page.goto('/');
    await page.waitForURL(/\/uk\//);
    await context.close();
  });

  test('with storage blocked it still goes by the browser language', async ({
    browser,
    baseURL,
  }) => {
    const context = await browser.newContext({ baseURL, locale: 'en-GB' });
    await context.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new DOMException('blocked', 'SecurityError');
        },
      });
    });
    const page = await context.newPage();
    await page.goto('/');
    await page.waitForURL(/\/en\//);
    await context.close();
  });

  test('keeps the query and the hash it was opened with', async ({
    browser,
    baseURL,
  }) => {
    expect(
      await landing(browser, baseURL, { locale: 'en-GB' }, '/?a=1#recipe'),
    ).toBe('/en/?a=1#recipe');
  });

  test('without scripts it shows the three languages and the page refreshes to the source language', async ({
    browser,
    baseURL,
  }) => {
    const context = await browser.newContext({
      baseURL,
      javaScriptEnabled: false,
      locale: 'en-GB',
    });
    const page = await context.newPage();
    await page.goto('/');
    await page.waitForURL(/\/pl\/$/);
    await context.close();
  });

  test('offers a link for every language in its own HTML, for a reader the script cannot help', async ({
    request,
  }) => {
    const text = await (await request.get('/')).text();
    expect(text).toMatch(/<h1>[^<]+<\/h1>/);
    for (const code of LANGUAGES)
      expect(text).toContain(`<a href="${code}/" hreflang="${code}"`);
  });
});

test.describe('the 404 page', () => {
  test('is served with status 404, is not indexed and links to every language', async ({
    page,
    problems,
  }) => {
    problems.allow(/status of 404/);
    const response = await page.goto('/there/is/no/such/page');
    expect(response.status()).toBe(404);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex',
    );
    await expect(page.locator('h1')).toHaveText('404');
    await expect(page.locator('.root-langs a')).toHaveCount(3);
    expect(
      await page
        .locator('.root-langs a')
        .evaluateAll((links) => links.map((a) => a.getAttribute('href'))),
    ).toEqual(['/pl/', '/en/', '/uk/']);
  });

  test('has its own style and icon, whatever the depth of the address', async ({
    page,
    problems,
  }) => {
    problems.allow(/status of 404/);
    await page.goto('/en/no-such-chapter/deeper/');
    const mark = page.locator('img.root-mark');
    await expect(mark).toBeVisible();
    expect(
      await mark.evaluate((img) => img.complete && img.naturalWidth > 0),
    ).toBe(true);
    // The style sheet applied: the links are the large touch targets.
    const box = await page.locator('.root-langs a').first().boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
  });

  test('its links go to the guide', async ({ page, problems }) => {
    problems.allow(/status of 404/);
    await page.goto('/nowhere');
    await page.locator('.root-langs a[hreflang="uk"]').click();
    await expect(page).toHaveURL(/\/uk\/$/);
  });
});

test.describe('manifests and icons', () => {
  for (const code of LANGUAGES)
    test(`${code}: the manifest is linked, valid, and every icon it names is served`, async ({
      page,
      request,
    }) => {
      await page.goto(`/${code}/`);
      const href = await page
        .locator('link[rel="manifest"]')
        .getAttribute('href');
      const url = new URL(href, page.url()).href;
      const response = await request.get(url);
      expect(response.status()).toBe(200);
      expect(response.headers()['content-type']).toMatch(/json/);
      const manifest = await response.json();
      expect(manifest.lang).toBe(code);
      expect(manifest.name).toBeTruthy();
      expect(manifest.display).toBe('standalone');
      // The root page, which opens the language the reader chose.
      expect(new URL(manifest.start_url, url).pathname).toBe('/');
      expect(manifest.icons.length).toBeGreaterThanOrEqual(3);
      for (const icon of manifest.icons) {
        const served = await request.get(new URL(icon.src, url).href);
        expect(served.status(), icon.src).toBe(200);
        expect(served.headers()['content-type']).toBe(icon.type);
      }
      expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true);
    });

  test('the icons in the head of the page are served', async ({
    page,
    request,
  }) => {
    await page.goto('/en/');
    const links = await page
      .locator('link[rel~="icon"], link[rel="apple-touch-icon"]')
      .evaluateAll((els) => els.map((el) => el.href));
    expect(links.length).toBeGreaterThanOrEqual(3);
    for (const href of links)
      expect((await request.get(href)).status(), href).toBe(200);
    expect((await request.get('/favicon.ico')).status()).toBe(200);
  });

  test('the English page says en_GB to social sites', async ({ page }) => {
    await page.goto('/en/');
    await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute(
      'content',
      'en_GB',
    );
  });
});

test.describe('the footer', () => {
  for (const code of LANGUAGES)
    test(`${code}: has the mark, the credit, the way back up and one current language`, async ({
      page,
    }) => {
      await page.goto(`/${code}/`);
      const footer = page.locator('.site-footer');
      await expect(footer.locator('img.footer-mark')).toHaveCount(1);
      await expect(footer.locator('.footer-credit')).not.toBeEmpty();
      await expect(footer.locator('.footer-langs a')).toHaveCount(3);
      await expect(
        footer.locator('.footer-langs a[aria-current]'),
      ).toHaveAttribute('data-lang', code);
    });

  test('its link back up goes to the top of the page', async ({ page }) => {
    await page.goto('/en/#topping-ideas');
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(1000);
    await page.locator('.footer-top').click();
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
    await expect(page).toHaveURL(/#top$/);
  });
});
