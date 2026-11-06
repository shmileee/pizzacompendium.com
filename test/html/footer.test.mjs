import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { renderFooter } from '../../scripts/lib/html/footer.mjs';
import { lang, ui } from '../helpers/render.mjs';

const pl = lang('pl');
const en = lang('en');
const rtl = lang('ar', { dir: 'rtl', htmlLang: 'ar-EG', name: 'Arabic' });

describe('renderFooter', () => {
  const html = renderFooter({ lang: en, languages: [pl, en, rtl], ui: ui() });

  it('has the mark, the credit and the way back to the top', () => {
    assert.match(html, /^<footer class="site-footer">/);
    assert.match(
      html,
      /<img class="footer-mark" src="\.\.\/favicon\.svg" alt="" width="40" height="40">/,
    );
    assert.match(html, /<p class="footer-credit">credit<\/p>/);
    assert.match(
      html,
      /<a class="btn footer-top" href="#top">[\s\S]*?top<\/a>/,
    );
    assert.ok(html.endsWith('</footer>'));
  });

  it('lists every language by its own name, with its tag and direction', () => {
    assert.match(
      html,
      /<a href="\.\.\/pl\/" hreflang="pl-PL" lang="pl-PL" dir="ltr" data-lang="pl">Polski<\/a>/,
    );
    assert.match(
      html,
      /<a href="\.\.\/ar\/" hreflang="ar-EG" lang="ar-EG" dir="rtl" data-lang="ar">Arabic<\/a>/,
    );
  });

  it('marks the current language and only that one', () => {
    assert.equal((html.match(/aria-current="true"/g) ?? []).length, 1);
    assert.match(html, /data-lang="en" aria-current="true">English<\/a>/);
  });

  it('names the navigation with the word for language', () => {
    assert.match(html, /<nav class="footer-langs" aria-label="language">/);
  });

  it('escapes the credit, the names and the labels', () => {
    const bad = renderFooter({
      lang: en,
      languages: [lang('en', { name: '<b>E</b>' })],
      ui: ui({ credit: '<i>c</i>', top: '"t"', language: '"l"' }),
    });
    assert.doesNotMatch(bad, /<b>|<i>/);
    assert.match(bad, /&lt;b&gt;E&lt;\/b&gt;/);
    assert.match(bad, /&quot;t&quot;/);
    assert.match(bad, /aria-label="&quot;l&quot;"/);
  });
});
