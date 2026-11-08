import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  checkSite,
  loadSite,
  pickDefaultLanguage,
} from '../scripts/lib/site-config.mjs';
import { capture, errorCodes, view } from './helpers/capture.mjs';
import { langJson, REAL_ROOT, withRepo } from './helpers/repo.mjs';

const valid = { siteUrl: 'https://example.com', ogImage: 'img/og.webp' };
const fields = (data) =>
  checkSite(data).problems.map((problem) => problem.field);

describe('checkSite', () => {
  it('accepts the minimal site and derives the base path', () => {
    const { site, problems } = checkSite(valid);
    assert.deepEqual(problems, []);
    assert.deepEqual(site, {
      siteUrl: 'https://example.com',
      basePath: '/',
      ogImage: 'img/og.webp',
      themeColors: [],
      defaultLanguage: null,
    });
  });

  it('keeps the default language it is given', () => {
    const { site } = checkSite({ ...valid, defaultLanguage: 'en' });
    assert.equal(site.defaultLanguage, 'en');
  });

  for (const defaultLanguage of [3, ['en'], { code: 'en' }]) {
    it(`refuses defaultLanguage ${JSON.stringify(defaultLanguage)}`, () => {
      assert.deepEqual(fields({ ...valid, defaultLanguage }), [
        'defaultLanguage',
      ]);
    });
  }

  it('keeps a sub-path with a trailing slash', () => {
    const { site } = checkSite({
      ...valid,
      siteUrl: 'https://example.com/a/b',
    });
    assert.equal(site.basePath, '/a/b/');
  });

  it('accepts one theme colour', () => {
    const { site } = checkSite({ ...valid, themeColor: '#aabbcc' });
    assert.deepEqual(site.themeColors, [{ content: '#aabbcc' }]);
  });

  it('accepts a light and a dark theme colour with media', () => {
    const { site } = checkSite({
      ...valid,
      themeColor: { light: '#aabbcc', dark: '#001122' },
    });
    assert.deepEqual(site.themeColors, [
      { content: '#aabbcc', media: '(prefers-color-scheme: light)' },
      { content: '#001122', media: '(prefers-color-scheme: dark)' },
    ]);
  });

  for (const data of [null, [], 'x', 3]) {
    it(`refuses ${JSON.stringify(data)} as a whole`, () => {
      const result = checkSite(data);
      assert.equal(result.site, null);
      assert.deepEqual(fields(data), ['site.json']);
    });
  }

  it('refuses unknown keys', () => {
    assert.deepEqual(fields({ ...valid, extra: 1 }), ['extra']);
  });

  it('requires ogImage to be a string', () => {
    assert.deepEqual(fields({ siteUrl: valid.siteUrl }), ['ogImage']);
    assert.deepEqual(fields({ ...valid, ogImage: 3 }), ['ogImage']);
  });

  it('requires siteUrl to be a string', () => {
    assert.deepEqual(fields({ ogImage: 'img/og.webp' }), ['siteUrl']);
    assert.deepEqual(fields({ ...valid, siteUrl: 5 }), ['siteUrl']);
  });

  const badUrls = {
    'not absolute': 'example.com',
    'http, not https': 'http://example.com',
    'with a query': 'https://example.com?a=1',
    'with a fragment': 'https://example.com#a',
    'with a user name': 'https://user@example.com',
    'with a password': 'https://user:pw@example.com',
    'with only a password': 'https://:pw@example.com',
    'with a trailing slash': 'https://example.com/',
    'in upper case': 'https://EXAMPLE.com',
    'with an ampersand': 'https://example.com/a&b',
    'with a quote': 'https://example.com/a"b',
    'with an angle bracket': 'https://example.com/a<b',
  };
  for (const [name, siteUrl] of Object.entries(badUrls)) {
    it(`refuses a siteUrl ${name}`, () => {
      const { site, problems } = checkSite({ ...valid, siteUrl });
      assert.equal(site, null);
      assert.deepEqual(
        problems.map((problem) => problem.field),
        ['siteUrl'],
      );
    });
  }

  for (const themeColor of [
    'red',
    'x#aabbcc',
    '#abc',
    '#gggggg',
    3,
    {},
    { light: '#aabbcc' },
    { light: '#aabbcc', dark: 'x' },
    ['#aabbcc'],
  ]) {
    it(`refuses themeColor ${JSON.stringify(themeColor)}`, () => {
      assert.deepEqual(fields({ ...valid, themeColor }), ['themeColor']);
    });
  }

  it('reports every problem at once', () => {
    assert.deepEqual(fields({ x: 1, themeColor: 'no' }), [
      'x',
      'ogImage',
      'siteUrl',
      'themeColor',
    ]);
  });
});

describe('loadSite', () => {
  it('reads site.json of a tree', async () => {
    await withRepo(async (repo) => {
      const reporter = capture();
      const site = loadSite({ root: repo.root, reporter });
      assert.equal(typeof site.siteUrl, 'string');
      assert.deepEqual(reporter.entries, []);
    });
  });

  it('reports E_SITE per problem with the field', async () => {
    await withRepo(
      { 'site.json': { siteUrl: 'x', ogImage: 3 } },
      async (repo) => {
        const reporter = capture();
        assert.equal(loadSite({ root: repo.root, reporter }), null);
        assert.deepEqual(view(reporter), [
          {
            level: 'error',
            code: 'E_SITE',
            file: 'site.json',
            field: 'ogImage',
          },
          {
            level: 'error',
            code: 'E_SITE',
            file: 'site.json',
            field: 'siteUrl',
          },
        ]);
      },
    );
  });

  it('returns null with only the read error when site.json is missing', async () => {
    await withRepo({ 'site.json': null }, async (repo) => {
      const reporter = capture();
      assert.equal(loadSite({ root: repo.root, reporter }), null);
      assert.deepEqual(view(reporter), [
        { level: 'error', code: 'E_READ', file: 'site.json' },
      ]);
    });
  });

  it('returns null with E_JSON when site.json is not JSON', async () => {
    await withRepo({ 'site.json': '{' }, async (repo) => {
      const reporter = capture();
      assert.equal(loadSite({ root: repo.root, reporter }), null);
      assert.equal(reporter.entries[0].code, 'E_JSON');
    });
  });
});

describe('pickDefaultLanguage', () => {
  const pl = { code: 'pl' };
  const en = { code: 'en' };
  const pick = (defaultLanguage, languages = [pl, en]) => {
    const reporter = capture();
    const lang = pickDefaultLanguage({
      site: { defaultLanguage },
      source: pl,
      languages,
      reporter,
    });
    return { lang, reporter };
  };

  it('is the language site.json names', () => {
    const { lang, reporter } = pick('en');
    assert.equal(lang, en);
    assert.deepEqual(reporter.entries, []);
  });

  it('is the source language when site.json names none', () => {
    const { lang, reporter } = pick(null);
    assert.equal(lang, pl);
    assert.deepEqual(reporter.entries, []);
  });

  for (const [name, code, languages] of [
    ['a language the site does not have', 'de', [pl, en]],
    ['a language that is not published', 'en', [pl]],
    ['the code in another case', 'EN', [pl, en]],
  ])
    it(`refuses ${name} with E_SITE, and the source stands in`, () => {
      const { lang, reporter } = pick(code, languages);
      assert.equal(lang, pl);
      assert.deepEqual(view(reporter), [
        {
          level: 'error',
          code: 'E_SITE',
          file: 'site.json',
          field: 'defaultLanguage',
        },
      ]);
    });

  it('is English on the real site', () => {
    const site = JSON.parse(
      readFileSync(path.join(REAL_ROOT, 'site.json'), 'utf8'),
    );
    assert.equal(checkSite(site).site.defaultLanguage, 'en');
  });
});

describe('the default language in a build', () => {
  const site = (defaultLanguage) => ({
    'site.json': {
      siteUrl: 'https://pizza.example',
      ogImage: 'img/og.webp',
      defaultLanguage,
    },
  });

  it('is the language of the root and 404 pages and where the root page sends the rest', async () => {
    await withRepo(site('en'), async (repo) => {
      const { ok, reporter } = repo.build();
      assert.deepEqual(errorCodes(reporter), []);
      assert.equal(ok, true);
      const root = readFileSync(path.join(repo.dist, 'index.html'), 'utf8');
      const missing = readFileSync(path.join(repo.dist, '404.html'), 'utf8');
      assert.match(root, /<html lang="en/);
      assert.match(root, /url=en\/"><\/noscript>/);
      assert.match(root, /\["pl","en"\], "en", "pizzacompendium-lang"/);
      assert.match(missing, /<html lang="en/);
    });
  });

  it('fails the build when it is no published language', async () => {
    await withRepo(
      {
        ...site('de'),
        'content/de/lang.json': langJson('de', { status: 'draft' }),
      },
      async (repo) => {
        const { ok, reporter } = repo.build();
        assert.equal(ok, false);
        assert.deepEqual(
          view(reporter).filter((entry) => entry.code === 'E_SITE'),
          [
            {
              level: 'error',
              code: 'E_SITE',
              file: 'site.json',
              field: 'defaultLanguage',
            },
          ],
        );
      },
    );
  });
});
