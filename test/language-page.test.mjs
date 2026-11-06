import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { scriptHash } from '../scripts/lib/csp.mjs';
import { HERO_SQUARE, HERO_WIDE } from '../scripts/lib/html/hero.mjs';
import { renderLanguagePage } from '../scripts/lib/language-page.mjs';
import { capture, codes, find } from './helpers/capture.mjs';
import { fakeImages, lang, ui } from './helpers/render.mjs';

const site = { siteUrl: 'https://x.test', themeColors: [{ content: '#fff' }] };
const source = lang('pl', {
  ui: ui({ tip: 'Wskazówka', translationNote: undefined }),
});
const en = lang('en', { ui: { tip: 'Hint' } });
const assets = {
  css: { path: 'assets/style.css', v: null },
  js: { path: 'assets/app.js', v: null },
  modules: [],
};
const image = { href: 'img/og.jpg', width: 1200, height: 630 };
const images = () =>
  fakeImages({
    [HERO_WIDE]: { width: 1600, height: 900 },
    [HERO_SQUARE]: { width: 800, height: 600 },
    'img/a.webp': { width: 960, height: 640 },
  });

const INTRO =
  '## Quick start {#quick-start}\n\nText.\n\n## FAQ {#faq}\n\nAnswer.\n';

function render(sections, over = {}) {
  const reporter = capture();
  const html = renderLanguagePage({
    lang: en,
    source,
    visible: [source, en],
    content: { sections },
    site,
    images: images(),
    image,
    assets,
    reporter,
    ...over,
  });
  return { html, reporter };
}

const own = (text, path = 'content/en/01.md') => ({
  text,
  path,
  fallback: false,
});

describe('renderLanguagePage', () => {
  it('renders the sections in order into the page, with the table of contents', () => {
    const { html, reporter } = render([
      own('## A {#a}\n\nFirst.\n', 'content/en/01.md'),
      own('## B {#b}\n\nSecond.\n', 'content/en/02.md'),
      own(INTRO.replace('Text', 'Third'), 'content/en/03.md'),
    ]);
    assert.deepEqual(codes(reporter), []);
    assert.ok(html.indexOf('id="a"') < html.indexOf('id="b"'));
    assert.ok(html.indexOf('id="b"') < html.indexOf('id="quick-start"'));
    assert.match(html, /<a href="#a" data-number="01">A<\/a>/);
    assert.match(html, /<a href="#b" data-number="02">B<\/a>/);
  });

  it('is a page of the language: its tag, its canonical address', () => {
    const { html } = render([own(INTRO)]);
    assert.match(html, /<html lang="en-GB" dir="ltr">/);
    assert.match(html, /<link rel="canonical" href="https:\/\/x\.test\/en\/">/);
  });

  it('marks the page as scripted and sets the theme before the first paint, by hash', () => {
    const { html } = render([own(INTRO)]);
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
      (m) => m[1],
    );
    assert.equal(scripts.length, 2);
    assert.match(scripts[0], /classList/);
    assert.match(scripts[1], /dataset\.theme/);
    for (const text of scripts) assert.ok(html.includes(scriptHash(text)));
  });

  it('wraps a section that is the source text, in the language of the source', () => {
    const { html } = render([
      own(INTRO),
      {
        text: '## Zapas {#fallback}\n\nTekst.\n',
        path: 'content/pl/02.md',
        fallback: true,
      },
    ]);
    assert.match(html, /<div lang="pl-PL"><h2 id="fallback">/);
    assert.match(html, /<\/h2>\n<p>Tekst\.<\/p>\n<\/div>/);
    assert.equal((html.match(/<div lang="pl-PL">/g) ?? []).length, 1);
  });

  it('does not wrap a section of its own', () => {
    const { html } = render([own(INTRO)]);
    assert.doesNotMatch(html, /<div lang="pl-PL">/);
  });

  it('takes a string of the language over the one of the source', () => {
    const { html } = render([own('::: tip\nx\n:::\n' + INTRO)]);
    assert.match(html, /<p class="callout-title">Hint<\/p>/);
    assert.doesNotMatch(html, /Wskazówka/);
  });

  it('falls back to the string of the source for a key the language lacks', () => {
    const { html } = render([own('::: tip\nx\n:::\n' + INTRO)], {
      lang: lang('en', { ui: {} }),
    });
    assert.match(html, /<p class="callout-title">Wskazówka<\/p>/);
  });

  it('refuses an id that the page itself uses', () => {
    const { reporter } = render([own('## Top {#top}\n\nx\n' + INTRO)]);
    assert.equal(find(reporter, 'E_ID_RESERVED').file, 'content/en/01.md');
    const pc = render([own('## X {#pc-search}\n\nx\n' + INTRO)]);
    assert.deepEqual(codes(pc.reporter), ['E_ID_RESERVED']);
  });

  it('refuses an id that a section before it has used, across sections', () => {
    const { reporter } = render([
      own('## A {#dup}\n\nx\n'),
      own('## B {#dup}\n\nx\n', 'content/en/02.md'),
    ]);
    assert.equal(find(reporter, 'E_DUP_ID').file, 'content/en/02.md');
  });

  it('reports the problems of a section at its own file', () => {
    const { reporter } = render([
      own(INTRO),
      own('![x](img/nope.webp)\n', 'content/en/05.md'),
    ]);
    assert.equal(find(reporter, 'E_IMG_MISSING').file, 'content/en/05.md');
  });

  it('lists only the visible languages in the picker', () => {
    const { html } = render([own(INTRO)], { visible: [en] });
    assert.doesNotMatch(html, /data-lang="pl"/);
    assert.match(html, /data-lang="en"/);
  });

  it('has no sections for a language with none, and still a page', () => {
    const { html } = render([]);
    assert.match(html, /<div class="article">/);
    assert.match(html, /<ul class="toc-list"><\/ul>/);
  });

  it('shows a local note only on its own language', () => {
    const text =
      '::: local lang=en Only here\nNote.\n:::\n\n::: local lang=pl Tylko tu\nUwaga.\n:::\n' +
      INTRO;
    const { html } = render([own(text)]);
    assert.match(html, /Only here/);
    assert.doesNotMatch(html, /Tylko tu/);
  });
});
