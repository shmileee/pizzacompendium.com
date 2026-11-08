import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cspMeta, scriptHash } from '../../scripts/lib/csp.mjs';
import {
  alternates,
  COLOR_SCHEME,
  iconLinks,
  MANIFEST_FILE,
  MANIFEST_ICONS,
  MARKDOWN_FILE,
  manifestLink,
  markdownLink,
  missingIcons,
  NOINDEX,
  renderHead,
  STATIC_ICONS,
  socialImage,
  themeColor,
} from '../../scripts/lib/html/head.mjs';
import { lang } from '../helpers/render.mjs';

describe('renderHead', () => {
  it('starts with the charset and the policy, then the viewport, the lines, the scripts', () => {
    const html = renderHead({
      scripts: ['let a = 1;'],
      lines: ['<title>T</title>', '<meta name="x">'],
    });
    assert.equal(
      html,
      [
        '<head>',
        '<meta charset="utf-8">',
        cspMeta(['let a = 1;']),
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        '<title>T</title>',
        '<meta name="x">',
        '<script>let a = 1;</script>',
        '</head>',
      ].join('\n'),
    );
  });

  it('skips falsy lines', () => {
    const html = renderHead({
      scripts: [],
      lines: [false, '<title>T</title>', '', undefined],
    });
    assert.equal(
      html.split('\n').filter((l) => l.includes('<title>')).length,
      1,
    );
    assert.equal(html.includes('false'), false);
    assert.equal(html.includes('undefined'), false);
    assert.doesNotMatch(html, /\n\n/);
  });

  it('allows each inline script by its hash in the policy', () => {
    const html = renderHead({ scripts: ['one();', 'two();'], lines: [] });
    assert.ok(html.includes(scriptHash('one();')));
    assert.ok(html.includes(scriptHash('two();')));
    assert.ok(
      html.indexOf('one();</script>') < html.indexOf('two();</script>'),
    );
  });

  it('has no script at all for none', () => {
    assert.doesNotMatch(renderHead({ scripts: [], lines: [] }), /<script/);
  });
});

describe('the head constants', () => {
  it('say what they say', () => {
    assert.equal(NOINDEX, '<meta name="robots" content="noindex">');
    assert.equal(
      COLOR_SCHEME,
      '<meta name="color-scheme" content="light dark">',
    );
    assert.equal(MANIFEST_FILE, 'manifest.webmanifest');
    assert.equal(
      manifestLink(),
      '<link rel="manifest" href="manifest.webmanifest">',
    );
    assert.equal(MARKDOWN_FILE, 'index.md');
    assert.equal(
      markdownLink(),
      '<link rel="alternate" type="text/markdown" href="index.md">',
    );
  });
});

describe('alternates', () => {
  it('lists every language and then x-default, which is the root', () => {
    const html = alternates({ siteUrl: 'https://x.test' }, [
      lang('pl'),
      lang('en'),
    ]);
    assert.equal(
      html,
      [
        '<link rel="alternate" hreflang="pl-PL" href="https://x.test/pl/">',
        '<link rel="alternate" hreflang="en-GB" href="https://x.test/en/">',
        '<link rel="alternate" hreflang="x-default" href="https://x.test/">',
      ].join('\n'),
    );
  });

  it('has x-default alone for no language', () => {
    assert.equal(
      alternates({ siteUrl: 'https://x.test' }, []),
      '<link rel="alternate" hreflang="x-default" href="https://x.test/">',
    );
  });
});

describe('socialImage', () => {
  const lines = socialImage(
    { siteUrl: 'https://x.test' },
    { href: 'img/og.jpg', width: 1200, height: 630 },
    'A "big" <pizza>',
  );

  it('gives the image, its size, its alternative text and the card', () => {
    assert.deepEqual(lines, [
      '<meta property="og:image" content="https://x.test/img/og.jpg">',
      '<meta property="og:image:width" content="1200">',
      '<meta property="og:image:height" content="630">',
      '<meta property="og:image:alt" content="A &quot;big&quot; &lt;pizza&gt;">',
      '<meta name="twitter:card" content="summary_large_image">',
      '<meta name="twitter:image:alt" content="A &quot;big&quot; &lt;pizza&gt;">',
    ]);
  });
});

describe('themeColor', () => {
  it('writes one meta for each colour, with the media query when there is one', () => {
    assert.deepEqual(
      themeColor({
        themeColors: [
          { content: '#fff', media: '(prefers-color-scheme: light)' },
          { content: '#000', media: '(prefers-color-scheme: dark)' },
        ],
      }),
      [
        '<meta name="theme-color" content="#fff" media="(prefers-color-scheme: light)">',
        '<meta name="theme-color" content="#000" media="(prefers-color-scheme: dark)">',
      ],
    );
  });

  it('leaves the media out for a single colour and writes nothing for none', () => {
    assert.deepEqual(themeColor({ themeColors: [{ content: '#abc' }] }), [
      '<meta name="theme-color" content="#abc">',
    ]);
    assert.deepEqual(themeColor({ themeColors: [] }), []);
  });
});

describe('the icons', () => {
  it('lists the manifest icons with their sizes, the last one maskable', () => {
    assert.deepEqual(
      MANIFEST_ICONS.map((i) => [i.src, i.sizes, i.type, i.purpose]),
      [
        ['icon-192.png', '192x192', 'image/png', undefined],
        ['icon-512.png', '512x512', 'image/png', undefined],
        ['icon-maskable-512.png', '512x512', 'image/png', 'maskable'],
      ],
    );
  });

  it('names the files the head and the manifest need: the favicon, the touch icon, the manifest icons', () => {
    assert.deepEqual(STATIC_ICONS, [
      'favicon-32.png',
      'apple-touch-icon.png',
      'icon-192.png',
      'icon-512.png',
      'icon-maskable-512.png',
    ]);
  });

  it('says which of them a folder lacks, in the order they are listed', () => {
    assert.deepEqual(missingIcons(STATIC_ICONS), []);
    assert.deepEqual(missingIcons([...STATIC_ICONS, 'other.png']), []);
    assert.deepEqual(missingIcons([]), STATIC_ICONS);
    assert.deepEqual(missingIcons(['favicon-32.png', 'icon-512.png', 'x']), [
      'apple-touch-icon.png',
      'icon-192.png',
      'icon-maskable-512.png',
    ]);
  });

  it('links the favicons through the given prefix', () => {
    assert.deepEqual(iconLinks('../'), [
      '<link rel="icon" href="../favicon.svg" type="image/svg+xml">',
      '<link rel="icon" href="../favicon-32.png" sizes="32x32" type="image/png">',
      '<link rel="apple-touch-icon" href="../apple-touch-icon.png">',
    ]);
    assert.match(iconLinks('')[0], /href="favicon\.svg"/);
    assert.match(
      iconLinks('/pizza/')[2],
      /href="\/pizza\/apple-touch-icon\.png"/,
    );
  });
});
