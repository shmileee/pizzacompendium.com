import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { renderLanguageList } from '../../scripts/lib/html/language-list.mjs';
import { lang } from '../helpers/render.mjs';

describe('renderLanguageList', () => {
  const languages = [
    lang('pl'),
    lang('ar', { dir: 'rtl', htmlLang: 'ar-EG', name: 'A<b' }),
  ];

  it('is one link per language, each in its own language and direction', () => {
    const html = renderLanguageList(languages, { prefix: '' });
    assert.match(html, /^<ul class="root-langs">/);
    assert.match(
      html,
      /<li><a href="pl\/" hreflang="pl-PL" lang="pl-PL" dir="ltr">/,
    );
    assert.match(
      html,
      /<a href="ar\/" hreflang="ar-EG" lang="ar-EG" dir="rtl">/,
    );
    assert.equal((html.match(/<li>/g) ?? []).length, 2);
    assert.match(html, /<span class="root-lang-name">A&lt;b<\/span>/);
    assert.match(html, /<svg class="icon"/);
  });

  it('puts the prefix in front of the folder, for the 404 page', () => {
    const html = renderLanguageList(languages, { prefix: '/guide/' });
    assert.match(html, /href="\/guide\/pl\/"/);
  });

  it('has no second line without a detail', () => {
    const html = renderLanguageList(languages, { prefix: '' });
    assert.doesNotMatch(html, /root-lang-detail/);
    assert.match(
      html,
      /<span class="root-lang-text"><span class="root-lang-name">A&lt;b<\/span><\/span><svg/,
    );
  });

  it('writes the detail of each language, escaped, under its name', () => {
    const html = renderLanguageList(languages, {
      prefix: '',
      detail: (l) => `about ${l.code} & <more>`,
    });
    assert.match(
      html,
      /<span class="root-lang-detail">about pl &amp; &lt;more&gt;<\/span>/,
    );
    assert.match(
      html,
      /<span class="root-lang-detail">about ar &amp; &lt;more&gt;<\/span>/,
    );
  });

  it('is an empty list for no language', () => {
    assert.equal(
      renderLanguageList([], { prefix: '' }),
      '<ul class="root-langs"></ul>',
    );
  });
});
