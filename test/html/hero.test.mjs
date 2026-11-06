import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  HERO_SQUARE,
  HERO_TARGETS,
  HERO_WIDE,
  heroBreakpointMismatches,
  heroPicture,
  PHONE_MAX,
  renderHero,
  SPLIT_MIN,
} from '../../scripts/lib/html/hero.mjs';
import { capture, codes, findAll, view } from '../helpers/capture.mjs';
import { fakeImages, lang, ui } from '../helpers/render.mjs';

const both = () =>
  fakeImages({
    [HERO_WIDE]: {
      width: 1600,
      height: 900,
      variants: [{ href: 'img/hero-800w.webp', width: 800 }],
    },
    [HERO_SQUARE]: { width: 800, height: 600 },
  });

const toc = [{ id: 'quick-start' }, { id: 'faq' }];

describe('the hero constants', () => {
  it('name the two pictures, the two targets and the two breakpoints', () => {
    assert.equal(HERO_WIDE, 'img/hero.webp');
    assert.equal(HERO_SQUARE, 'img/hero-mobile.webp');
    assert.deepEqual(HERO_TARGETS, { start: 'quick-start', faq: 'faq' });
    assert.equal(PHONE_MAX, 640);
    assert.equal(SPLIT_MIN, 960);
  });
});

describe('heroBreakpointMismatches', () => {
  const css = `@media (width > ${PHONE_MAX}px) { a {} }\n@media (width >= ${SPLIT_MIN}px) { b {} }`;

  it('is empty when the stylesheet spells both widths', () => {
    assert.deepEqual(heroBreakpointMismatches(css), []);
  });

  it('names the query that is missing', () => {
    assert.deepEqual(
      heroBreakpointMismatches(`@media (width > ${PHONE_MAX}px) {}`),
      [`(width >= ${SPLIT_MIN}px)`],
    );
    assert.deepEqual(
      heroBreakpointMismatches(`@media (width >= ${SPLIT_MIN}px) {}`),
      [`(width > ${PHONE_MAX}px)`],
    );
  });

  it('names both for a stylesheet that has neither, or another number', () => {
    assert.equal(heroBreakpointMismatches('').length, 2);
    assert.equal(
      heroBreakpointMismatches(
        '@media (width > 600px) {} @media (width >= 900px) {}',
      ).length,
      2,
    );
  });

  it('wants the query to be a media query, not just the text', () => {
    assert.equal(
      heroBreakpointMismatches(
        `(width > ${PHONE_MAX}px) (width >= ${SPLIT_MIN}px)`,
      ).length,
      2,
    );
  });
});

describe('heroPicture', () => {
  it('is a picture with the 4:3 cut for phones and wide screens and the wide one for the rest', () => {
    const reporter = capture();
    const html = heroPicture({
      images: both(),
      reporter,
      alt: 'A "pie"',
      page: 'en',
    });
    assert.deepEqual(codes(reporter), []);
    assert.match(
      html,
      /^<picture class="hero-media"><source media="\(max-width: 640px\), \(min-width: 960px\)" srcset="\.\.\/img\/hero-mobile\.webp 800w" sizes="[^"]*" width="800" height="600">/,
    );
    assert.match(
      html,
      /<img src="\.\.\/img\/hero\.webp" srcset="\.\.\/img\/hero-800w\.webp 800w, \.\.\/img\/hero\.webp 1600w" sizes="100vw" width="1600" height="900" alt="A &quot;pie&quot;" fetchpriority="high" loading="eager" decoding="async"><\/picture>$/,
    );
  });

  it('reports a missing picture with its own code and goes without the hero image', () => {
    const reporter = capture();
    const images = fakeImages({ [HERO_SQUARE]: { width: 800, height: 600 } });
    assert.equal(heroPicture({ images, reporter, alt: 'x', page: 'pl' }), '');
    assert.deepEqual(view(reporter), [
      {
        level: 'error',
        code: 'E_IMG_MISSING',
        file: 'scripts/lib/html/hero.mjs',
      },
    ]);
  });

  it('reports each missing picture once', () => {
    const reporter = capture();
    const images = fakeImages({});
    assert.equal(heroPicture({ images, reporter, alt: 'x', page: 'pl' }), '');
    assert.equal(findAll(reporter, 'E_IMG_MISSING').length, 2);
  });

  it('passes on the code of the problem, whatever it is', () => {
    const reporter = capture();
    const images = fakeImages({
      [HERO_WIDE]: { ok: false, code: 'E_IMG_UNREADABLE' },
      [HERO_SQUARE]: { width: 1, height: 1 },
    });
    heroPicture({ images, reporter, alt: 'x', page: 'pl' });
    assert.deepEqual(codes(reporter), ['E_IMG_UNREADABLE']);
  });

  it('asks for the pictures by their names', () => {
    const images = both();
    heroPicture({ images, reporter: capture(), alt: 'x', page: 'en' });
    assert.deepEqual(images.asked.sort(), [HERO_SQUARE, HERO_WIDE].sort());
  });
});

describe('renderHero', () => {
  const run = (over = {}) => {
    const reporter = capture();
    const html = renderHero({
      lang: lang('en', {
        title: 'The <Guide>',
        description: 'Make it & bake it.',
      }),
      ui: ui({ heroAlt: 'alt text' }),
      images: both(),
      reporter,
      toc,
      ...over,
    });
    return { html, reporter };
  };

  it('has the one h1 with the escaped title', () => {
    const { html } = run();
    assert.equal((html.match(/<h1>/g) ?? []).length, 1);
    assert.match(html, /<h1>The &lt;Guide&gt;<\/h1>/);
  });

  it('has the lead and two buttons that lead to the quick start and the FAQ', () => {
    const { html } = run();
    assert.match(html, /<p class="hero-lead">Make it &amp; bake it\.<\/p>/);
    assert.match(
      html,
      /<a class="btn btn-primary" href="#quick-start">heroStart<svg/,
    );
    assert.match(html, /<a class="btn" href="#faq">heroFaq<\/a>/);
  });

  it('has the picture, with the alternative text of the language, before the text', () => {
    const { html } = run();
    assert.ok(html.indexOf('<picture') < html.indexOf('hero-text'));
    assert.match(html, /alt="alt text"/);
  });

  it('applies the typography of the language to the lead only', () => {
    const { html } = run({
      lang: lang('pl', {
        title: 'i tak',
        description: 'Ciasto i woda.',
        typography: { nbspAfter: ['i'] },
      }),
    });
    assert.match(html, /Ciasto i woda\./);
    assert.match(html, /<h1>i tak<\/h1>/);
  });

  it('reports no diagnostic when the targets and the pictures are there', () => {
    assert.deepEqual(codes(run().reporter), []);
  });

  it('reports a button whose target no heading has, at the hero module', () => {
    const { reporter } = run({ toc: [{ id: 'faq' }] });
    assert.deepEqual(view(reporter), [
      {
        level: 'error',
        code: 'E_HERO_TARGET',
        file: 'scripts/lib/html/hero.mjs',
      },
    ]);
  });

  it('reports both buttons without a toc at all', () => {
    const { reporter } = run({ toc: undefined });
    assert.deepEqual(codes(reporter), ['E_HERO_TARGET', 'E_HERO_TARGET']);
  });

  it('goes without the picture, and says why, when a file is missing', () => {
    const { html, reporter } = run({ images: fakeImages({}) });
    assert.doesNotMatch(html, /<picture/);
    assert.match(html, /<h1>/);
    assert.deepEqual(codes(reporter), ['E_IMG_MISSING', 'E_IMG_MISSING']);
  });

  it('names the page in the diagnostics of the pictures', () => {
    const { reporter } = run({ lang: lang('uk'), images: fakeImages({}) });
    assert.ok(reporter.entries.every((e) => e.message.includes('uk')));
  });
});
