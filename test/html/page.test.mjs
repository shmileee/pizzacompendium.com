import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { scriptHash } from '../../scripts/lib/csp.mjs';
import { HERO_SQUARE, HERO_WIDE } from '../../scripts/lib/html/hero.mjs';
import { renderPage } from '../../scripts/lib/html/page.mjs';
import { capture, codes } from '../helpers/capture.mjs';
import { fakeImages, lang, ui } from '../helpers/render.mjs';

const site = { siteUrl: 'https://x.test', themeColors: [{ content: '#fff' }] };
const en = lang('en', { title: 'Guide <1>', description: 'About "pizza".' });
const pl = lang('pl');
const toc = [
  { level: 2, id: 'quick-start', html: 'Quick start' },
  { level: 2, id: 'faq', html: 'FAQ' },
];
const assets = {
  css: { path: 'assets/style.css', v: 'cc' },
  js: { path: 'assets/app.js', v: 'jj' },
  modules: [
    { path: 'assets/js/a.js', v: 'aa' },
    { path: 'assets/js/b.js', v: null },
  ],
};
const image = { href: 'img/og.jpg', width: 1200, height: 630 };

function render(over = {}) {
  const reporter = capture();
  const html = renderPage({
    site,
    lang: en,
    languages: [pl, en],
    ui: ui(),
    body: '<p>BODY</p>',
    toc,
    assets,
    scripts: ['one();', 'two();'],
    image,
    images: fakeImages({
      [HERO_WIDE]: { width: 1600, height: 900 },
      [HERO_SQUARE]: { width: 800, height: 600 },
    }),
    reporter,
    ...over,
  });
  return { html, reporter };
}

describe('renderPage: the document', () => {
  const { html, reporter } = render();

  it('is an HTML5 page with the language and the direction of the language', () => {
    assert.ok(
      html.startsWith('<!doctype html>\n<html lang="en-GB" dir="ltr">\n<head>'),
    );
    assert.ok(html.endsWith('</body>\n</html>\n'));
    assert.match(html, /<body id="top">/);
    assert.match(
      render({ lang: lang('ar', { dir: 'rtl', htmlLang: 'ar-EG' }) }).html,
      /<html lang="ar-EG" dir="rtl">/,
    );
  });

  it('reports nothing for a complete page', () => {
    assert.deepEqual(codes(reporter), []);
  });

  it('allows its inline scripts by hash and has them in the head', () => {
    for (const script of ['one();', 'two();']) {
      assert.ok(html.includes(scriptHash(script)));
      assert.ok(html.includes(`<script>${script}</script>`));
    }
    assert.ok(html.indexOf('<script>one();') < html.indexOf('</head>'));
  });

  it('loads the app as one module at the end of the body', () => {
    assert.match(
      html,
      /<script type="module" src="\.\.\/assets\/app\.js\?v=jj"><\/script>\n<\/body>/,
    );
  });

  it('puts the parts in order: sprite, skip link, header, layout, footer, progress', () => {
    const at = (text) => html.indexOf(text);
    const order = [
      '<svg class="pc-sprite"',
      '<a class="skip" href="#content">skip</a>',
      '<header class="site-header">',
      '<div class="layout">',
      '<nav class="toc" id="toc"',
      '<div class="toc-backdrop" id="pc-backdrop" aria-hidden="true"></div>',
      '<main id="content" tabindex="-1">',
      '<footer class="site-footer">',
      '<div class="progress" id="pc-progress" aria-hidden="true"></div>',
    ].map(at);
    assert.ok(
      order.every((n) => n > 0),
      String(order),
    );
    assert.deepEqual(
      order,
      [...order].sort((a, b) => a - b),
    );
  });

  it('has the hero, then the article with the body, then the back-to-top link, in the main', () => {
    const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'));
    assert.ok(main.indexOf('<div class="hero-slot"><div class="hero"') >= 0);
    assert.ok(
      main.indexOf('hero-slot') < main.indexOf('<div class="article">'),
    );
    assert.ok(
      main.indexOf('<p>BODY</p>') > main.indexOf('<div class="article">'),
    );
    assert.match(
      main,
      /<a class="btn btn-icon to-top" id="pc-top" href="#top" aria-label="top">/,
    );
    assert.ok(main.indexOf('<p>BODY</p>') < main.indexOf('to-top'));
  });

  it('has exactly one h1, the title of the hero', () => {
    assert.equal((html.match(/<h1[ >]/g) ?? []).length, 1);
    assert.match(html, /<h1>Guide &lt;1&gt;<\/h1>/);
  });

  it('has the contents of the toc argument', () => {
    assert.match(
      html,
      /<a href="#quick-start" data-number="01">Quick start<\/a>/,
    );
  });
});

describe('renderPage: the head', () => {
  const { html } = render();

  it('has the escaped title and description, the canonical address and the alternates', () => {
    assert.match(html, /<title>Guide &lt;1&gt;<\/title>/);
    assert.match(
      html,
      /<meta name="description" content="About &quot;pizza&quot;\.">/,
    );
    assert.match(html, /<link rel="canonical" href="https:\/\/x\.test\/en\/">/);
    assert.match(html, /hreflang="pl-PL" href="https:\/\/x\.test\/pl\/"/);
    assert.match(html, /hreflang="x-default" href="https:\/\/x\.test\/"/);
  });

  it('is not noindex when published', () => {
    assert.doesNotMatch(html, /noindex/);
  });

  it('is noindex when a draft', () => {
    const draft = render({ lang: lang('en', { ...en, status: 'draft' }) }).html;
    assert.match(draft, /<meta name="robots" content="noindex">/);
  });

  it('describes itself for sharing: the open graph, its locale and the other locales', () => {
    assert.match(html, /<meta property="og:title" content="Guide &lt;1&gt;">/);
    assert.match(html, /<meta property="og:type" content="article">/);
    assert.match(
      html,
      /<meta property="og:url" content="https:\/\/x\.test\/en\/">/,
    );
    assert.match(
      html,
      /<meta property="og:site_name" content="Guide &lt;1&gt;">/,
    );
    assert.match(html, /<meta property="og:locale" content="en_GB">/);
    assert.match(html, /<meta property="og:locale:alternate" content="pl_PL">/);
    assert.equal((html.match(/og:locale:alternate/g) ?? []).length, 1);
  });

  it('leaves the locale out for a language that has none, and lists no alternate of its own', () => {
    const none = render({ lang: lang('en', { ...en, ogLocale: null }) }).html;
    assert.doesNotMatch(none, /property="og:locale"/);
  });

  it('shows the preview image with the alt of the language, else its title', () => {
    assert.match(html, /og:image" content="https:\/\/x\.test\/img\/og\.jpg"/);
    assert.match(html, /og:image:alt" content="Guide &lt;1&gt;"/);
    const empty = render({ lang: lang('en', { ...en, ogImageAlt: '' }) }).html;
    assert.match(empty, /og:image:alt" content=""/);
    const alt = render({
      lang: lang('en', { ...en, ogImageAlt: 'Alt & text' }),
    }).html;
    assert.match(alt, /og:image:alt" content="Alt &amp; text"/);
  });

  it('links the icons, the manifest, the stylesheet and a preload for every module', () => {
    assert.match(html, /<link rel="icon" href="\.\.\/favicon\.svg"/);
    assert.match(html, /<link rel="manifest" href="manifest\.webmanifest">/);
    assert.match(
      html,
      /<link rel="stylesheet" href="\.\.\/assets\/style\.css\?v=cc">/,
    );
    assert.match(
      html,
      /<link rel="modulepreload" href="\.\.\/assets\/js\/a\.js\?v=aa">/,
    );
    assert.match(
      html,
      /<link rel="modulepreload" href="\.\.\/assets\/js\/b\.js">/,
    );
    assert.match(html, /<meta name="theme-color" content="#fff">/);
  });

  it('has no preload of a module when there are none', () => {
    assert.doesNotMatch(
      render({ assets: { ...assets, modules: [] } }).html,
      /modulepreload/,
    );
  });
});

describe('renderPage: the font preload', () => {
  const preloads = (html) =>
    [
      ...html.matchAll(
        /<link rel="preload" href="\.\.\/([^"]+)" as="font" type="font\/woff2" crossorigin>/g,
      ),
    ].map((m) => m[1]);

  it('preloads the Latin font for a Latin title', () => {
    assert.deepEqual(preloads(render().html), ['fonts/vollkorn-latin.woff2']);
  });

  it('preloads the Cyrillic font for a Cyrillic title, and no Latin one', () => {
    const uk = lang('uk', { title: 'Піца', description: 'Опис' });
    const html = render({
      lang: uk,
      toc: [{ level: 2, id: 'faq', html: 'Часті' }],
    }).html;
    assert.deepEqual(preloads(html), ['fonts/vollkorn-cyrillic.woff2']);
  });

  it('adds the Latin font when a Cyrillic page has a Latin heading', () => {
    const uk = lang('uk', { title: 'Піца', description: 'Опис' });
    const html = render({
      lang: uk,
      toc: [{ level: 2, id: 'faq', html: 'Caputo' }],
    }).html;
    assert.deepEqual(preloads(html).sort(), [
      'fonts/vollkorn-cyrillic.woff2',
      'fonts/vollkorn-latin.woff2',
    ]);
  });

  it('does not take the letters of an entity for text', () => {
    const uk = lang('uk', { title: 'Піца', description: 'Опис' });
    const html = render({
      lang: uk,
      toc: [{ level: 2, id: 'faq', html: 'Часті &amp; &#8212; &nbsp;' }],
    }).html;
    assert.deepEqual(preloads(html), ['fonts/vollkorn-cyrillic.woff2']);
  });

  it('preloads nothing for a title in a script without a font', () => {
    const zh = lang('zh', { title: '披萨', description: 'x' });
    assert.deepEqual(preloads(render({ lang: zh, toc: [] }).html), []);
  });
});

describe('renderPage: the translation note', () => {
  it('shows the note of the language, escaped, above the body', () => {
    const { html } = render({
      ui: ui({ translationNote: 'Machine <translated>.' }),
    });
    assert.match(
      html,
      /<p class="translation-note">Machine &lt;translated&gt;\.<\/p>/,
    );
    assert.ok(html.indexOf('translation-note') < html.indexOf('<p>BODY</p>'));
  });

  it('shows none when the language has none', () => {
    const { html } = render();
    assert.doesNotMatch(html, /translation-note/);
    assert.match(html, /<div class="article">\s*<p>BODY<\/p>\s*<\/div>/);
    assert.doesNotMatch(
      render({ ui: ui({ translationNote: '' }) }).html,
      /translation-note/,
    );
  });
});

describe('renderPage: what it reports', () => {
  it('reports a hero button that has no heading, and a missing hero picture', () => {
    const { reporter } = render({ toc: [], images: fakeImages({}) });
    assert.deepEqual(codes(reporter).sort(), [
      'E_HERO_TARGET',
      'E_HERO_TARGET',
      'E_IMG_MISSING',
      'E_IMG_MISSING',
    ]);
  });
});
