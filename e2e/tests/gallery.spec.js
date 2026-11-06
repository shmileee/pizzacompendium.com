import { LANGUAGES, overflowsSideways, visit } from '../support/content.js';
import { expect, test } from '../support/fixtures.js';

// Figures and galleries: pictures that line up in a row, captions that say
// what the picture shows, cut-outs on their plate, and no sideways scroll.

const galleries = (page) => page.locator('.gallery');

/** The height of the picture and the top of the caption of every figure. */
const rows = (gallery) =>
  gallery.evaluate((element) =>
    [...element.querySelectorAll('figure')].map((figure) => {
      const picture = figure.querySelector('img').getBoundingClientRect();
      const caption = figure
        .querySelector('figcaption')
        .getBoundingClientRect();
      return {
        left: Math.round(picture.left),
        top: Math.round(picture.top),
        height: picture.height,
        captionTop: Math.round(caption.top),
        photo: figure.classList.contains('photo-portrait'),
      };
    }),
  );

test.describe('at 1440 px', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('the pictures of a row are equally tall and the captions line up', async ({
    page,
  }) => {
    await visit(page, '/en/');
    const total = await galleries(page).count();
    expect(total).toBeGreaterThan(0);
    for (let index = 0; index < total; index++) {
      const gallery = galleries(page).nth(index);
      await gallery.scrollIntoViewIfNeeded();
      const figures = await rows(gallery);
      const byRow = Map.groupBy(figures, (figure) => figure.top);
      for (const row of byRow.values()) {
        for (const figure of row) {
          expect(
            Math.abs(figure.height - row[0].height),
            `gallery ${index}: pictures of a row`,
          ).toBeLessThanOrEqual(1);
          expect(figure.captionTop, `gallery ${index}: captions`).toBe(
            row[0].captionTop,
          );
        }
      }
    }
  });
});

test.describe('at 390 px', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('two pictures stack, three upright ones stay in a row', async ({
    page,
  }) => {
    await visit(page, '/en/');
    const layouts = await galleries(page).evaluateAll((items) =>
      items.map((gallery) => {
        const lefts = new Set(
          [...gallery.querySelectorAll('figure')].map((figure) =>
            Math.round(figure.getBoundingClientRect().left),
          ),
        );
        return {
          count: gallery.querySelectorAll('figure').length,
          upright: gallery.querySelector('.photo-portrait') !== null,
          columns: lefts.size,
        };
      }),
    );
    expect(layouts.some((layout) => layout.count === 2)).toBe(true);
    for (const layout of layouts) {
      if (layout.upright && layout.count === 3)
        expect(layout.columns, 'three upright pictures').toBe(3);
      else if (layout.count === 2)
        expect(layout.columns, 'two pictures').toBe(1);
    }
  });
});

test('the cut-outs sit on a plate, the small ones are not enlarged', async ({
  page,
}) => {
  await visit(page, '/en/');
  const cutouts = page.locator('figure.photo-cutout');
  await expect(cutouts).toHaveCount(8);
  const small = page.locator('figure.photo-small');
  expect(await small.count()).toBeGreaterThan(0);
  expect(
    await small.evaluateAll((items) =>
      items.every((item) => item.classList.contains('photo-cutout')),
    ),
  ).toBe(true);
  await small.first().scrollIntoViewIfNeeded();
  const width = await small
    .first()
    .locator('img')
    .evaluate((el) => el.getBoundingClientRect().width);
  expect(width).toBeLessThanOrEqual(400);
});

test('a gallery picture is described by its caption, a single figure by its alt', async ({
  page,
}) => {
  await visit(page, '/en/');
  const gallery = await page.evaluate(() =>
    [...document.querySelectorAll('.gallery figure')].map((figure) => ({
      alt: figure.querySelector('img').getAttribute('alt'),
      caption: figure.querySelector('figcaption').textContent.trim(),
    })),
  );
  expect(gallery.length).toBeGreaterThan(3);
  for (const figure of gallery) {
    expect(figure.alt).toBe('');
    expect(figure.caption).not.toBe('');
  }
  const singles = await page.evaluate(() =>
    [...document.querySelectorAll('figure:not(.gallery figure)')].map(
      (figure) => figure.querySelector('img').getAttribute('alt') ?? '',
    ),
  );
  expect(singles.length).toBeGreaterThan(0);
  for (const alt of singles) expect(alt.trim()).not.toBe('');
});

test('every picture of the page has its size before it loads', async ({
  page,
}) => {
  await visit(page, '/en/');
  const missing = await page.evaluate(() =>
    [...document.querySelectorAll('main img')]
      .filter(
        (img) => !img.getAttribute('width') || !img.getAttribute('height'),
      )
      .map((img) => img.getAttribute('src')),
  );
  expect(missing).toEqual([]);
});

for (const code of LANGUAGES)
  for (const width of [320, 390, 768, 1440])
    test(`the ${code} page does not scroll sideways at ${width} px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await visit(page, `/${code}/`);
      expect(await overflowsSideways(page)).toBe(false);
      // Nor with every answer open.
      await page.locator('[data-faq-toggle]').click();
      expect(await overflowsSideways(page)).toBe(false);
    });
