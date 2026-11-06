import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { renderHeader } from '../../scripts/lib/html/header.mjs';
import { renderSearch } from '../../scripts/lib/html/search.mjs';
import { lang, ui } from '../helpers/render.mjs';

const pl = lang('pl');
const en = lang('en', { title: 'Pizza <Guide>' });
const model = { lang: en, languages: [pl, en], ui: ui() };

describe('renderHeader', () => {
  const html = renderHeader(model);

  it('is the sticky header with the contents button, the brand and the actions', () => {
    assert.match(html, /^<header class="site-header">/);
    assert.ok(html.endsWith('</header>'));
    const menu = html.indexOf('id="toc-toggle"');
    const brand = html.indexOf('class="brand"');
    const actions = html.indexOf('class="header-actions"');
    assert.ok(0 < menu && menu < brand && brand < actions);
  });

  it('has a contents button that controls the table of contents', () => {
    assert.match(
      html,
      /<button type="button" class="btn btn-quiet menu-btn" id="toc-toggle" aria-expanded="false" aria-controls="toc">/,
    );
    assert.match(html, /<span class="menu-label">toc<\/span>/);
  });

  it('has the brand with the escaped title, which goes to the top', () => {
    assert.match(
      html,
      /<a class="brand" href="#top"><img class="brand-mark" src="\.\.\/favicon\.svg" alt="" width="32" height="32"><span class="brand-name">Pizza &lt;Guide&gt;<\/span><\/a>/,
    );
  });

  it('has the search before the theme button', () => {
    const search = html.indexOf(renderSearch(model));
    assert.ok(search > 0);
    assert.ok(search < html.indexOf('id="pc-theme"'));
  });

  it('has a theme button with the three modes, an icon and a label each, and a status line', () => {
    assert.match(
      html,
      /<button type="button" class="btn btn-quiet theme-btn" id="pc-theme">/,
    );
    for (const [mode, name, key] of [
      ['auto', 'auto', 'themeAuto'],
      ['light', 'sun', 'themeLight'],
      ['dark', 'moon', 'themeDark'],
    ]) {
      assert.ok(
        html.includes(
          `<svg class="icon theme-${mode}" width="24" height="24" aria-hidden="true"><use href="#pc-i-${name}"/></svg><span class="visually-hidden theme-${mode}">${key}</span>`,
        ),
        mode,
      );
    }
    assert.match(
      html,
      /<\/button><span class="visually-hidden" id="pc-theme-status" role="status"><\/span>/,
    );
  });

  it('has a language picker: a disclosure with the current code and name', () => {
    assert.match(html, /<details class="lang" id="lang-picker">/);
    assert.match(
      html,
      /<span class="visually-hidden">language:<\/span> <span class="lang-code">langCode<\/span> <span class="lang-name">English<\/span>/,
    );
  });

  it('lists every language in the picker, the current one marked and ticked', () => {
    assert.match(
      html,
      /<li><a href="\.\.\/pl\/" hreflang="pl-PL" lang="pl-PL" dir="ltr" data-lang="pl">Polski<\/a><\/li>/,
    );
    const current =
      /<li><a href="\.\.\/en\/"[^>]*data-lang="en" aria-current="true">English(.*?)<\/a><\/li>/.exec(
        html,
      );
    assert.ok(current);
    assert.match(current[1], /pc-i-check/);
    assert.equal((html.match(/aria-current="true"/g) ?? []).length, 1);
    assert.equal((html.match(/pc-i-check/g) ?? []).length, 1);
  });

  it('writes the direction of a language into its link', () => {
    const rtl = lang('ar', { dir: 'rtl', htmlLang: 'ar-EG', name: 'Arabic' });
    assert.match(
      renderHeader({ ...model, languages: [pl, rtl, en] }),
      /hreflang="ar-EG" lang="ar-EG" dir="rtl" data-lang="ar">Arabic</,
    );
  });

  it('escapes what comes from the language', () => {
    const bad = renderHeader({
      lang: lang('en', { name: '<n>', title: '<t>' }),
      languages: [lang('en', { name: '<n>' })],
      ui: ui({
        toc: '<a>',
        themeAuto: '<b>',
        language: '<c>',
        langCode: '<d>',
      }),
    });
    assert.doesNotMatch(bad, /<n>|<t>|<a>|<b>|<c>|<d>/);
  });
});
