import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkSite, loadSite } from '../scripts/lib/site-config.mjs';
import { capture, view } from './helpers/capture.mjs';
import { withRepo } from './helpers/repo.mjs';

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
    });
  });

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
