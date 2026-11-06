import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MANIFEST_ICONS } from '../scripts/lib/html/head.mjs';
import {
  renderManifest,
  renderRobots,
  renderSitemap,
} from '../scripts/lib/seo.mjs';

const site = { siteUrl: 'https://example.com/base', themeColors: [] };
const lang = (code, htmlLang = code) => ({
  code,
  htmlLang,
  title: `Title ${code}`,
  description: `Description ${code}`,
  dir: 'ltr',
  ui: { shortName: `Short ${code}` },
});

describe('renderSitemap', () => {
  const xml = renderSitemap(site, [lang('pl'), lang('pt-BR', 'pt-BR')]);

  it('is an XML document ending in a newline, without lastmod', () => {
    assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n'));
    assert.ok(xml.endsWith('</urlset>\n'));
    assert.doesNotMatch(xml, /lastmod/);
  });

  it('has one url per language', () => {
    assert.deepEqual(xml.match(/<loc>[^<]+<\/loc>/g), [
      '<loc>https://example.com/base/pl/</loc>',
      '<loc>https://example.com/base/pt-BR/</loc>',
    ]);
  });

  it('has the exact layout of a two-language sitemap', () => {
    const alternates =
      '    <xhtml:link rel="alternate" hreflang="pl" href="https://example.com/base/pl/"/>\n' +
      '    <xhtml:link rel="alternate" hreflang="pt-BR" href="https://example.com/base/pt-BR/"/>\n' +
      '    <xhtml:link rel="alternate" hreflang="x-default" href="https://example.com/base/"/>\n';
    assert.equal(
      xml,
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' +
        `  <url>\n    <loc>https://example.com/base/pl/</loc>\n${alternates}  </url>\n` +
        `  <url>\n    <loc>https://example.com/base/pt-BR/</loc>\n${alternates}  </url>\n` +
        '</urlset>\n',
    );
  });

  it('has the exact layout of a one-language sitemap', () => {
    assert.equal(
      renderSitemap(site, [lang('pl')]),
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' +
        '  <url>\n' +
        '    <loc>https://example.com/base/pl/</loc>\n' +
        '    <xhtml:link rel="alternate" hreflang="pl" href="https://example.com/base/pl/"/>\n' +
        '    <xhtml:link rel="alternate" hreflang="x-default" href="https://example.com/base/"/>\n' +
        '  </url>\n' +
        '</urlset>\n',
    );
  });

  it('lists every alternate and x-default in every url', () => {
    const block = xml.split('<url>')[1];
    assert.match(
      block,
      /hreflang="pl" href="https:\/\/example.com\/base\/pl\/"/,
    );
    assert.match(
      block,
      /hreflang="pt-BR" href="https:\/\/example.com\/base\/pt-BR\/"/,
    );
    assert.match(
      block,
      /hreflang="x-default" href="https:\/\/example.com\/base\/"/,
    );
    assert.equal(xml.match(/hreflang=/g).length, 6);
  });
});

describe('renderRobots', () => {
  it('allows everything and names the sitemap', () => {
    assert.equal(
      renderRobots(site),
      'User-agent: *\nAllow: /\n\nSitemap: https://example.com/base/sitemap.xml\n',
    );
  });
});

describe('renderManifest', () => {
  it('describes the language, start page, scope and icons', () => {
    const text = renderManifest(site, lang('pl'));
    assert.ok(text.endsWith('}\n'));
    const manifest = JSON.parse(text);
    assert.equal(manifest.name, 'Title pl');
    assert.equal(manifest.short_name, 'Short pl');
    assert.equal(manifest.description, 'Description pl');
    assert.equal(manifest.lang, 'pl');
    assert.equal(manifest.dir, 'ltr');
    assert.equal(manifest.start_url, '../');
    assert.equal(manifest.scope, '../');
    assert.equal(manifest.display, 'standalone');
    assert.deepEqual(
      manifest.icons,
      MANIFEST_ICONS.map((icon) => ({ ...icon, src: `../${icon.src}` })),
    );
    assert.ok(manifest.icons.length >= 3);
    for (const icon of manifest.icons)
      assert.match(icon.src, /^\.\.\/[\w-]+\.png$/);
  });

  it('has no colours without a theme colour', () => {
    const manifest = JSON.parse(renderManifest(site, lang('pl')));
    assert.equal('background_color' in manifest, false);
    assert.equal('theme_color' in manifest, false);
  });

  it('uses the first theme colour for both colours', () => {
    const manifest = JSON.parse(
      renderManifest(
        {
          ...site,
          themeColors: [{ content: '#aabbcc' }, { content: '#000000' }],
        },
        lang('pl'),
      ),
    );
    assert.equal(manifest.background_color, '#aabbcc');
    assert.equal(manifest.theme_color, '#aabbcc');
  });
});
