import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { scriptHash } from '../../scripts/lib/csp.mjs';
import { renderRoot } from '../../scripts/lib/html/root.mjs';
import { themeScript } from '../../scripts/lib/inline-scripts.mjs';
import { lang } from '../helpers/render.mjs';

const site = {
  siteUrl: 'https://x.test',
  themeColors: [{ content: '#fff' }],
};
const image = { href: 'img/og.jpg', width: 1200, height: 630 };
const pl = lang('pl', {
  title: 'Tytuł <1>',
  description: 'Opis "x".',
  ogImageAlt: 'Obraz & co',
});
const languages = [pl, lang('en')];
const assets = { css: { path: 'assets/style.css', v: 'abc123' } };
const script = 'redirect();';

const render = (over = {}) =>
  renderRoot({ site, lang: pl, languages, assets, script, image, ...over });

describe('renderRoot', () => {
  const html = render();

  it('is an HTML5 page in the language it is given', () => {
    assert.ok(
      html.startsWith('<!doctype html>\n<html lang="pl-PL" dir="ltr">\n<head>'),
    );
    assert.ok(html.endsWith('</body>\n</html>\n'));
    assert.match(html, /<body class="root">/);
  });

  it('carries the redirect script, allowed by its hash, after the fallback', () => {
    assert.ok(html.includes('<script>redirect();</script>'));
    assert.ok(html.includes(scriptHash(script)));
    assert.ok(html.indexOf('<noscript>') < html.indexOf('<script>redirect'));
  });

  it('wears the stored theme, by the theme script allowed by its hash', () => {
    assert.equal(html.split('<script>').length - 1, 2);
    assert.ok(html.includes(`<script>${themeScript()}</script>`));
    assert.ok(html.includes(scriptHash(themeScript())));
  });

  it('refreshes visitors without JavaScript to its language', () => {
    assert.match(
      html,
      /<noscript><meta http-equiv="refresh" content="0; url=pl\/"><\/noscript>/,
    );
  });

  it('is the page of whichever language it is given: English', () => {
    const en = render({
      lang: lang('en', { title: 'Title', description: 'Lead.' }),
    });
    assert.ok(en.startsWith('<!doctype html>\n<html lang="en-GB" dir="ltr">'));
    assert.match(en, /<title>Title<\/title>/);
    assert.match(en, /<meta name="description" content="Lead\.">/);
    assert.match(en, /content="0; url=en\/"><\/noscript>/);
  });

  it('is its own canonical address and lists the language alternates', () => {
    assert.match(html, /<link rel="canonical" href="https:\/\/x\.test\/">/);
    assert.match(html, /hreflang="pl-PL" href="https:\/\/x\.test\/pl\/"/);
    assert.match(html, /hreflang="en-GB" href="https:\/\/x\.test\/en\/"/);
    assert.match(html, /hreflang="x-default" href="https:\/\/x\.test\/"/);
  });

  it('describes itself with the escaped title and description of its language', () => {
    assert.match(html, /<title>Tytuł &lt;1&gt;<\/title>/);
    assert.match(
      html,
      /<meta name="description" content="Opis &quot;x&quot;\.">/,
    );
    assert.match(html, /<meta property="og:title" content="Tytuł &lt;1&gt;">/);
    assert.match(
      html,
      /<meta property="og:url" content="https:\/\/x\.test\/">/,
    );
    assert.match(
      html,
      /<meta property="og:site_name" content="Tytuł &lt;1&gt;">/,
    );
    assert.doesNotMatch(html, /og:type|og:locale/);
  });

  it('shows the preview image with the alternative text of its language', () => {
    assert.match(html, /og:image" content="https:\/\/x\.test\/img\/og\.jpg"/);
    assert.match(html, /og:image:alt" content="Obraz &amp; co"/);
  });

  it('keeps an alternative text that the author left empty', () => {
    const empty = render({ lang: lang('pl', { ogImageAlt: '' }) });
    assert.match(empty, /og:image:alt" content=""/);
  });

  it('falls back to the title for the alternative text', () => {
    const plain = render({
      lang: lang('pl', { title: 'T', ogImageAlt: undefined }),
    });
    assert.match(plain, /og:image:alt" content="T"/);
  });

  it('loads the stylesheet with its fingerprint, and no script file', () => {
    assert.match(
      html,
      /<link rel="stylesheet" href="assets\/style\.css\?v=abc123">/,
    );
    assert.doesNotMatch(html, /<script[^>]* src=/);
  });

  it('has the icons without a prefix, the theme colour and the colour scheme', () => {
    assert.match(html, /<link rel="icon" href="favicon\.svg"/);
    assert.match(html, /<meta name="theme-color" content="#fff">/);
    assert.match(html, /<meta name="color-scheme" content="light dark">/);
  });

  it('has the mark, the title, the lead and a link to each language, in the body', () => {
    assert.match(
      html,
      /<img class="root-mark" src="favicon\.svg" alt="" width="96" height="96">/,
    );
    assert.match(html, /<h1>Tytuł &lt;1&gt;<\/h1>/);
    assert.match(html, /<p class="root-lead">Opis &quot;x&quot;\.<\/p>/);
    assert.match(html, /<a href="pl\/" hreflang="pl-PL"/);
    assert.match(html, /<a href="en\/" hreflang="en-GB"/);
    assert.match(html, /<svg class="pc-sprite"/);
  });

  it('has no language detail, and is not noindex', () => {
    assert.doesNotMatch(html, /root-lang-detail|noindex/);
  });
});
