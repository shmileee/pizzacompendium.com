import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { scriptHash } from '../../scripts/lib/csp.mjs';
import { renderNotFound } from '../../scripts/lib/html/not-found.mjs';
import { themeScript } from '../../scripts/lib/inline-scripts.mjs';
import { lang } from '../helpers/render.mjs';

const site = {
  basePath: '/',
  themeColors: [{ content: '#000', media: '(prefers-color-scheme: dark)' }],
};
const source = lang('pl', { title: 'Tytuł <1>' });
const languages = [
  lang('pl', { ui: { notFound: 'Nie ma tej strony.' } }),
  lang('en', { ui: { notFound: 'Not found & gone.' } }),
];
const assets = { css: { path: 'assets/style.css', v: null } };
const html = renderNotFound({ site, source, languages, assets });

describe('renderNotFound', () => {
  it('is a page in the language of the source, with a 404 title', () => {
    assert.ok(
      html.startsWith('<!doctype html>\n<html lang="pl-PL" dir="ltr">'),
    );
    assert.match(html, /<title>404 – Tytuł &lt;1&gt;<\/title>/);
    assert.match(html, /<h1 class="root-code">404<\/h1>/);
  });

  it('is kept out of search engines', () => {
    assert.match(html, /<meta name="robots" content="noindex">/);
  });

  it('has only the theme script, allowed by its hash', () => {
    assert.equal((html.match(/<script>/g) ?? []).length, 1);
    assert.ok(html.includes(`<script>${themeScript()}</script>`));
    assert.ok(html.includes(scriptHash(themeScript())));
    assert.doesNotMatch(html, /<script[^>]* src=/);
  });

  it('uses root-absolute addresses, for an address of any depth', () => {
    assert.match(html, /<link rel="stylesheet" href="\/assets\/style\.css">/);
    assert.match(html, /<link rel="icon" href="\/favicon\.svg"/);
    assert.match(html, /<img class="root-mark" src="\/favicon\.svg"/);
    assert.match(html, /<a href="\/pl\/"/);
    assert.match(html, /<a href="\/en\/"/);
  });

  it('honours a base path of the site', () => {
    const under = renderNotFound({
      site: { ...site, basePath: '/pizza/' },
      source,
      languages,
      assets: { css: { path: 'assets/style.css', v: 'z' } },
    });
    assert.match(under, /href="\/pizza\/assets\/style\.css\?v=z"/);
    assert.match(under, /<a href="\/pizza\/pl\/"/);
    assert.match(under, /src="\/pizza\/favicon\.svg"/);
  });

  it('tells each language that the page was not found, in that language, escaped', () => {
    assert.match(
      html,
      /<span class="root-lang-detail">Nie ma tej strony\.<\/span>/,
    );
    assert.match(
      html,
      /<span class="root-lang-detail">Not found &amp; gone\.<\/span>/,
    );
  });

  it('has the theme colours and the colour scheme', () => {
    assert.match(
      html,
      /<meta name="theme-color" content="#000" media="\(prefers-color-scheme: dark\)">/,
    );
    assert.match(html, /<meta name="color-scheme" content="light dark">/);
  });
});
