import assert from 'node:assert/strict';
import nodeFs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { imageSize } from 'image-size';
import { build } from '../scripts/lib/build.mjs';
import { checkPolicy } from '../scripts/lib/csp.mjs';
import { MAX_TEXT_BYTES } from '../scripts/lib/files.mjs';
import { fakeWindow, runInline } from './helpers/browser.mjs';
import {
  codes,
  errorCodes,
  find,
  view,
  warningCodes,
} from './helpers/capture.mjs';
import { failing } from './helpers/fake-fs.mjs';
import { hashTree, introText, readTree, withRepo } from './helpers/repo.mjs';

/** The working folders of builds left beside `dist/` (none, normally). */
const leftovers = (repo) =>
  nodeFs.readdirSync(repo.root).filter((name) => name.startsWith('.dist.'));

const pageOf = (repo, rel) => repo.read(`dist/${rel}`);
const inlineScripts = (html) =>
  [...html.matchAll(/<script>(.*?)<\/script>/gs)].map((match) => match[1]);

describe('build: a valid site', () => {
  it('builds with no diagnostics, strict', async () => {
    await withRepo((repo) => {
      const { ok, files, languages, reporter } = repo.build({ strict: true });
      assert.equal(ok, true);
      assert.deepEqual(reporter.entries, []);
      assert.deepEqual(languages, ['pl', 'en']);
      assert.deepEqual(files, [...files].sort());
      for (const file of [
        '.nojekyll',
        '404.html',
        'index.html',
        'robots.txt',
        'sitemap.xml',
        'pl/index.html',
        'en/index.html',
        'pl/manifest.webmanifest',
        'en/manifest.webmanifest',
        'assets/app.js',
        'assets/style.css',
        'favicon.svg',
        'img/og.webp',
      ])
        assert.ok(files.includes(file), file);
      assert.deepEqual(files, repo.list('dist'));
      assert.equal(repo.read('dist/.nojekyll'), '');
    });
  });

  it('writes the language pages with the right <html lang> and a policy', async () => {
    await withRepo((repo) => {
      repo.build();
      assert.match(
        pageOf(repo, 'pl/index.html'),
        /^<!doctype html>\n<html lang="pl"/,
      );
      assert.match(
        pageOf(repo, 'en/index.html'),
        /^<!doctype html>\n<html lang="en"/,
      );
      for (const file of [
        'index.html',
        '404.html',
        'pl/index.html',
        'en/index.html',
      ])
        assert.deepEqual(checkPolicy(pageOf(repo, file)), [], file);
    });
  });

  it('uses the default folder dist and the given folder otherwise', async () => {
    await withRepo((repo) => {
      repo.build();
      repo.build({ outDir: 'elsewhere/out' });
      assert.ok(repo.exists('dist/index.html'));
      assert.ok(repo.exists('elsewhere/out/index.html'));
    });
  });

  it('creates its own reporter, honouring strict, when none is given', async () => {
    await withRepo((repo) => {
      repo.remove('content/en/01-intro.md');
      const loose = build({ root: repo.root, imageSize });
      assert.equal(loose.ok, true);
      assert.deepEqual(warningCodes(loose.reporter), ['W_FALLBACK']);
      const strict = build({ root: repo.root, imageSize, strict: true });
      assert.equal(strict.ok, false);
      assert.deepEqual(errorCodes(strict.reporter), ['W_FALLBACK']);
    });
  });

  it('is deterministic: two builds are byte for byte the same', async () => {
    await withRepo((repo) => {
      repo.build({ outDir: 'one' });
      repo.build({ outDir: 'two' });
      repo.build({ outDir: 'one' });
      assert.deepEqual(hashTree(repo.path('one')), hashTree(repo.path('two')));
    });
  });

  it('copies static files into the output as they are', async () => {
    await withRepo((repo) => {
      repo.build();
      assert.deepEqual(
        readTree(repo.path('dist/img'))['og.webp'],
        readTree(repo.path('static/img'))['og.webp'],
      );
    });
  });

  it('writes the sitemap, robots and manifests for the site', async () => {
    await withRepo((repo) => {
      repo.build();
      assert.match(
        pageOf(repo, 'sitemap.xml'),
        /<loc>https:\/\/[^<]+\/pl\/<\/loc>/,
      );
      assert.match(
        pageOf(repo, 'robots.txt'),
        /^User-agent: \*\nAllow: \/\n\nSitemap: https:\/\/[^\n]+\/sitemap\.xml\n$/,
      );
      assert.equal(
        JSON.parse(pageOf(repo, 'en/manifest.webmanifest')).lang,
        'en',
      );
    });
  });
});

describe('build: fingerprints', () => {
  const files = {
    'src/app.js':
      "import { a } from './util.js';\nexport const LANG_KEY = 'pizzacompendium-lang';\nexport const THEME_KEY = 'pizzacompendium-theme';\n",
    'src/util.js': 'export const a = 1;\n',
  };

  it('asks for ?v= assets and rewrites the relative imports', async () => {
    await withRepo(files, (repo) => {
      repo.build();
      const app = pageOf(repo, 'assets/app.js');
      assert.match(app, /from '\.\/util\.js\?v=[0-9a-f]{8}'/);
      assert.match(
        pageOf(repo, 'en/index.html'),
        /assets\/style\.css\?v=[0-9a-f]{8}/,
      );
      assert.match(
        pageOf(repo, 'en/index.html'),
        /assets\/app\.js\?v=[0-9a-f]{8}/,
      );
    });
  });

  it('--no-fingerprint: no ?v= anywhere and assets are byte for byte src/', async () => {
    await withRepo(files, (repo) => {
      repo.build({ fingerprint: false });
      assert.equal(pageOf(repo, 'assets/app.js'), repo.read('src/app.js'));
      assert.equal(pageOf(repo, 'assets/util.js'), repo.read('src/util.js'));
      assert.equal(pageOf(repo, 'favicon.svg'), repo.read('src/favicon.svg'));
      for (const file of [
        'en/index.html',
        'pl/index.html',
        'index.html',
        '404.html',
      ])
        assert.doesNotMatch(pageOf(repo, file), /\?v=/, file);
    });
  });

  it('the fingerprint changes when a script changes', async () => {
    await withRepo(files, (repo) => {
      repo.build();
      const before = pageOf(repo, 'en/index.html');
      repo.write('src/util.js', 'export const a = 2;\n');
      repo.build();
      assert.notEqual(pageOf(repo, 'en/index.html'), before);
    });
  });
});

describe('build: language status', () => {
  it('builds a draft but keeps it out of the site: noindex, picker, hreflang, sitemap, root', async () => {
    await withRepo((repo) => {
      repo.addLanguage('de', { status: 'draft', name: 'Deutsch' });
      const { ok, reporter } = repo.build({ strict: true });
      assert.equal(ok, true, JSON.stringify(reporter.entries));
      assert.deepEqual(reporter.entries, []);
      assert.ok(repo.exists('dist/de/index.html'));
      assert.ok(repo.exists('dist/de/manifest.webmanifest'));
      assert.match(
        pageOf(repo, 'de/index.html'),
        /<meta name="robots" content="noindex">/,
      );
      for (const published of ['pl', 'en'])
        assert.doesNotMatch(pageOf(repo, `${published}/index.html`), /noindex/);
      for (const file of [
        'pl/index.html',
        'en/index.html',
        'index.html',
        '404.html',
      ]) {
        const html = pageOf(repo, file);
        assert.doesNotMatch(html, /Deutsch/, file);
        assert.doesNotMatch(html, /hreflang="de"/, file);
        assert.doesNotMatch(html, /\/de\//, file);
      }
      assert.doesNotMatch(pageOf(repo, 'sitemap.xml'), /\/de\//);
      assert.doesNotMatch(pageOf(repo, 'sitemap.xml'), /hreflang="de"/);
      const [script] = inlineScripts(pageOf(repo, 'index.html')).filter(
        (text) => text.includes('replace'),
      );
      assert.doesNotMatch(script, /"de"/);
    });
  });

  it('a published language appears everywhere', async () => {
    await withRepo((repo) => {
      repo.addLanguage('de', { name: 'Deutsch', ogLocale: 'de_DE' });
      assert.equal(repo.build({ strict: true }).ok, true);
      assert.match(pageOf(repo, 'en/index.html'), /hreflang="de"/);
      assert.match(pageOf(repo, 'en/index.html'), /Deutsch/);
      assert.match(pageOf(repo, 'sitemap.xml'), /<loc>[^<]*\/de\/<\/loc>/);
      assert.match(pageOf(repo, 'index.html'), /de\//);
      assert.doesNotMatch(pageOf(repo, 'de/index.html'), /noindex/);
    });
  });

  it('a draft stays quiet about missing and extra sections', async () => {
    await withRepo((repo) => {
      repo.addLanguage('de', { status: 'draft' });
      repo.remove('content/de/01-intro.md');
      repo.write('content/de/09-extra.md', '## Extra {#extra}\n\nText.\n');
      const { ok, reporter } = repo.build({ strict: true });
      assert.equal(ok, true, JSON.stringify(reporter.entries));
      assert.deepEqual(reporter.entries, []);
    });
  });

  it('shows the source text of a missing section, with a warning', async () => {
    await withRepo((repo) => {
      repo.remove('content/en/01-intro.md');
      const { ok, reporter } = repo.build();
      assert.equal(ok, true);
      assert.ok(find(reporter, 'W_FALLBACK'));
      assert.match(pageOf(repo, 'en/index.html'), /Wprowadzenie/);
    });
  });

  it('ignores an extra section of a translation, with a warning', async () => {
    await withRepo(
      { 'content/en/09-extra.md': '## Extra {#extra}\n\nText.\n' },
      (repo) => {
        const { ok, reporter } = repo.build();
        assert.equal(ok, true);
        assert.deepEqual(warningCodes(reporter), ['W_EXTRA_FILE']);
        assert.doesNotMatch(pageOf(repo, 'en/index.html'), /id="extra"/);
      },
    );
  });

  it('strict mode fails on every warning and writes nothing', async () => {
    await withRepo(
      { 'content/en/09-extra.md': '## Extra {#extra}\n\nText.\n' },
      (repo) => {
        const { ok, files, reporter } = repo.build({ strict: true });
        assert.equal(ok, false);
        assert.deepEqual(files, []);
        assert.deepEqual(errorCodes(reporter), ['W_EXTRA_FILE']);
        assert.equal(repo.exists('dist'), false);
      },
    );
  });
});

describe('build: the root page', () => {
  it('has a redirect script that the page policy allows and that redirects', async () => {
    await withRepo((repo) => {
      repo.build();
      const html = pageOf(repo, 'index.html');
      assert.deepEqual(checkPolicy(html), []);
      const script = inlineScripts(html).find((text) =>
        text.includes('replace'),
      );
      for (const [languages, want] of [
        [['en-GB'], 'en/'],
        [['pl'], 'pl/'],
        [['ja'], 'pl/'],
      ]) {
        const win = fakeWindow({ languages, hash: '#x' });
        runInline(script, { window: win });
        assert.deepEqual(win.replaced, [`${want}#x`]);
      }
      const saved = fakeWindow({ languages: ['pl'], saved: 'en' });
      runInline(script, { window: saved });
      assert.deepEqual(saved.replaced, ['en/']);
    });
  });
});

/** Every read of the generator through the fs seam, failing in turn. */
describe('build: every read boundary gives a diagnostic, never an exception', () => {
  const reads = [
    ['site.json', 'site.json'],
    ['content/rules.json', 'content/rules.json'],
    ['a lang.json', 'content/en/lang.json'],
    ['a section of the source', 'content/pl/01-intro.md'],
    ['a section of a translation', 'content/en/01-intro.md'],
    ['the entry script', 'src/app.js'],
    ['the stylesheet', 'src/css/00-test.css'],
    ['the favicon', 'src/favicon.svg'],
  ];
  for (const [what, file] of reads)
    for (const code of ['ENOENT', 'EACCES', 'EISDIR', 'EMFILE'])
      it(`${what} fails with ${code}`, async () => {
        await withRepo((repo) => {
          const fs = failing(nodeFs, { op: 'readFileSync', match: file, code });
          const { ok, files, reporter } = repo.build({ fs });
          assert.equal(ok, false);
          assert.deepEqual(files, []);
          assert.ok(
            errorCodes(reporter).includes('E_READ'),
            codes(reporter).join(),
          );
          assert.equal(repo.exists('dist'), false);
        });
      });

  const listings = ['content', 'content/pl', 'static', 'src', 'static/img'];
  for (const dir of listings)
    it(`listing ${dir} fails with EACCES`, async () => {
      await withRepo((repo) => {
        const fs = failing(nodeFs, {
          op: 'readdirSync',
          match: new RegExp(`${dir}$`),
          code: 'EACCES',
        });
        const { ok, reporter } = repo.build({ fs });
        assert.equal(ok, false);
        assert.ok(errorCodes(reporter).length > 0);
        assert.equal(repo.exists('dist'), false);
      });
    });

  for (const file of [
    'site.json',
    'content/pl/01-intro.md',
    'content/pl/lang.json',
    'content/rules.json',
  ])
    it(`lstat of ${file} fails with EACCES`, async () => {
      await withRepo((repo) => {
        const fs = failing(nodeFs, {
          op: 'lstatSync',
          match: new RegExp(`${file}$`),
          code: 'EACCES',
        });
        const { ok, reporter } = repo.build({ fs });
        assert.equal(ok, false);
        assert.ok(errorCodes(reporter).length > 0, file);
      });
    });
});

describe('build: symbolic links and special files are refused', () => {
  for (const file of [
    'site.json',
    'content/rules.json',
    'content/pl/lang.json',
    'content/pl/01-intro.md',
    'content/en/01-intro.md',
  ]) {
    it(`a link in place of ${file}`, async () => {
      await withRepo((repo) => {
        repo.write('target.txt', repo.read(file));
        repo.remove(file);
        repo.symlink(
          file,
          path.relative(path.dirname(repo.path(file)), repo.path('target.txt')),
        );
        const { ok, reporter } = repo.build();
        assert.equal(ok, false);
        assert.equal(repo.exists('dist'), false);
        assert.ok(
          errorCodes(reporter).some((c) =>
            ['E_NOT_REGULAR', 'E_SECTION_NAME'].includes(c),
          ),
          codes(reporter).join(),
        );
      });
    });
  }

  for (const dir of ['content', 'content/pl', 'static', 'src']) {
    it(`a link in place of the folder ${dir}`, async () => {
      await withRepo((repo) => {
        const copy = `${dir}-real`;
        nodeFs.renameSync(repo.path(dir), repo.path(copy));
        repo.symlink(
          dir,
          path.relative(path.dirname(repo.path(dir)), repo.path(copy)),
        );
        const { ok, reporter } = repo.build();
        assert.equal(ok, false);
        assert.ok(
          codes(reporter).includes('E_SYMLINK'),
          codes(reporter).join(),
        );
      });
    });
  }

  it('a link inside static/ or src/', async () => {
    for (const dir of ['static/img', 'src/css']) {
      await withRepo((repo) => {
        repo.write('outside.txt', 'x');
        repo.symlink(`${dir}/link.txt`, '../../outside.txt');
        const { ok, reporter } = repo.build();
        assert.equal(ok, false);
        assert.ok(codes(reporter).includes('E_SYMLINK'));
      });
    }
  });

  it('a link in place of the preview image', async () => {
    await withRepo((repo) => {
      repo.symlink('static/img/og-link.webp', 'og.webp');
      repo.write('site.json', {
        siteUrl: 'https://example.com',
        ogImage: 'img/og-link.webp',
      });
      const { ok, reporter } = repo.build();
      assert.equal(ok, false);
      assert.deepEqual(view(reporter), [
        { level: 'error', code: 'E_IMG_UNREADABLE', file: 'site.json' },
      ]);
    });
  });

  it('a special file where a section should be', async () => {
    await withRepo((repo) => {
      const fs = {
        ...nodeFs,
        lstatSync: (file, ...rest) =>
          file.endsWith('content/en/01-intro.md')
            ? { isFile: () => false, size: 0 }
            : nodeFs.lstatSync(file, ...rest),
      };
      const { ok, reporter } = repo.build({ fs });
      assert.equal(ok, false);
      assert.deepEqual(errorCodes(reporter), ['E_NOT_REGULAR']);
    });
  });
});

describe('build: size limits', () => {
  it('refuses a section over the limit', async () => {
    await withRepo((repo) => {
      repo.write(
        'content/en/01-intro.md',
        `## Intro {#intro}\n\n${'a '.repeat(MAX_TEXT_BYTES / 2)}\n`,
      );
      const { ok, reporter } = repo.build();
      assert.equal(ok, false);
      assert.ok(codes(reporter).includes('E_TOO_LARGE'));
    });
  });

  it('refuses a line that is too long', async () => {
    await withRepo((repo) => {
      repo.write(
        'content/en/01-intro.md',
        `## Intro {#intro}\n\n${'a'.repeat(10001)}\n`,
      );
      const { ok, reporter } = repo.build();
      assert.equal(ok, false);
      assert.deepEqual(
        view(reporter).filter((e) => e.code === 'E_LINE_TOO_LONG'),
        [
          {
            level: 'error',
            code: 'E_LINE_TOO_LONG',
            file: 'content/en/01-intro.md',
            line: 3,
          },
        ],
      );
    });
  });
});

describe('build: what breaks it, and that nothing is half done', () => {
  it('reports a bad site.json', async () => {
    await withRepo(
      { 'site.json': { siteUrl: 'http://x.test', ogImage: 'img/og.webp' } },
      (repo) => {
        const { ok, files, reporter } = repo.build();
        assert.equal(ok, false);
        assert.deepEqual(files, []);
        assert.deepEqual(view(reporter), [
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

  it('reports bad language metadata', async () => {
    await withRepo(
      { 'content/en/lang.json': { code: 'en', name: '' } },
      (repo) => {
        const { ok, reporter } = repo.build();
        assert.equal(ok, false);
        assert.ok(codes(reporter).includes('E_LANG_META'));
      },
    );
  });

  it('reports bad rules', async () => {
    await withRepo({ 'content/rules.json': '[' }, (repo) => {
      const { ok, reporter } = repo.build();
      assert.equal(ok, false);
      assert.deepEqual(codes(reporter), ['E_JSON']);
    });
  });

  it('reports every kind of problem of the three loaders in one go', async () => {
    await withRepo(
      {
        'site.json': '{',
        'content/rules.json': '{',
        'content/en/lang.json': '{',
      },
      (repo) => {
        const { reporter } = repo.build();
        assert.deepEqual(codes(reporter), ['E_JSON', 'E_JSON', 'E_JSON']);
      },
    );
  });

  for (const [code, image, file] of [
    ['E_IMG_PATH', 'og.webp', 'site.json'],
    ['E_IMG_MISSING', 'img/none.webp', 'site.json'],
    ['E_IMG_CASE', 'img/OG.webp', 'site.json'],
  ]) {
    it(`reports ${code} for the preview image on site.json`, async () => {
      await withRepo(
        { 'site.json': { siteUrl: 'https://example.com', ogImage: image } },
        (repo) => {
          const { ok, files, reporter } = repo.build();
          assert.equal(ok, false);
          assert.deepEqual(files, []);
          assert.deepEqual(view(reporter), [{ level: 'error', code, file }]);
        },
      );
    });
  }

  it('reports E_IMG_UNREADABLE for a preview image that is not an image', async () => {
    await withRepo({ 'static/img/og.webp': 'nope' }, (repo) => {
      const { ok, reporter } = repo.build();
      assert.equal(ok, false);
      assert.deepEqual(view(reporter), [
        { level: 'error', code: 'E_IMG_UNREADABLE', file: 'site.json' },
      ]);
    });
  });

  it('reports E_LANG_KEY when no script defines the storage keys', async () => {
    await withRepo({ 'src/app.js': 'export {};\n' }, (repo) => {
      const { ok, reporter } = repo.build();
      assert.equal(ok, false);
      assert.deepEqual(view(reporter), [
        { level: 'error', code: 'E_LANG_KEY', file: 'src' },
        { level: 'error', code: 'E_LANG_KEY', file: 'src' },
      ]);
    });
  });

  it('reports E_LANG_KEY when a key has another value', async () => {
    await withRepo(
      {
        'src/app.js':
          "export const LANG_KEY = 'x';\nexport const THEME_KEY = 'pizzacompendium-theme';\n",
      },
      (repo) => {
        const { reporter } = repo.build();
        assert.deepEqual(codes(reporter), ['E_LANG_KEY']);
        assert.match(find(reporter, 'E_LANG_KEY').message, /LANG_KEY/);
      },
    );
  });

  it('reports E_ASSET for a missing entry script', async () => {
    await withRepo({ 'src/app.js': null }, (repo) => {
      const { ok, reporter } = repo.build();
      assert.equal(ok, false);
      assert.ok(codes(reporter).includes('E_ASSET'));
    });
  });

  it('refuses static files that would replace generated ones (E_STATIC_CONFLICT)', async () => {
    await withRepo({ 'static/robots.txt': 'x' }, (repo) => {
      const { ok, reporter } = repo.build();
      assert.equal(ok, false);
      assert.deepEqual(view(reporter), [
        {
          level: 'error',
          code: 'E_STATIC_CONFLICT',
          file: 'static/robots.txt',
        },
      ]);
    });
  });

  it('refuses a static file that would replace a script of the site', async () => {
    await withRepo({ 'static/assets/app.js': 'x' }, (repo) => {
      assert.ok(codes(repo.build().reporter).includes('E_STATIC_TYPE'));
    });
  });

  it('refuses types the allowlist does not know (E_STATIC_TYPE)', async () => {
    await withRepo(
      { 'static/page.html': '<p>x</p>', 'static/x.svg': '<svg/>' },
      (repo) => {
        const { ok, reporter } = repo.build();
        assert.equal(ok, false);
        assert.deepEqual(codes(reporter), ['E_STATIC_TYPE', 'E_STATIC_TYPE']);
        assert.equal(repo.exists('dist'), false);
      },
    );
  });

  it('reports a missing home screen icon (E_STATIC_ICON)', async () => {
    await withRepo({ 'static/icon-192.png': null }, (repo) => {
      const { ok, reporter } = repo.build();
      assert.equal(ok, false);
      assert.deepEqual(view(reporter), [
        { level: 'error', code: 'E_STATIC_ICON', file: 'static/icon-192.png' },
      ]);
    });
  });

  it('reports content-rule errors (an outside link) and writes nothing', async () => {
    await withRepo(
      {
        'content/en/01-intro.md':
          '## Introduction {#intro}\n\nSee [x](https://example.org/).\n',
      },
      (repo) => {
        const { ok, reporter } = repo.build();
        assert.equal(ok, false);
        assert.ok(codes(reporter).length > 0);
        assert.equal(repo.exists('dist'), false);
      },
    );
  });

  it('reports a link that points at nothing once, however it is written', async () => {
    const both = (body) => ({
      'content/pl/01-intro.md': `${introText('pl')}\n${body}\n`,
      'content/en/01-intro.md': `${introText('en')}\n${body}\n`,
    });
    await withRepo(both('See [x](#nowhere).'), (repo) => {
      const { ok, reporter } = repo.build();
      assert.equal(ok, false);
      assert.deepEqual(
        view(reporter).map(({ code, file, line }) => `${code} ${file}:${line}`),
        [
          'E_BROKEN_ANCHOR content/pl/01-intro.md:13',
          'E_BROKEN_ANCHOR content/en/01-intro.md:13',
        ],
      );
    });
    await withRepo(both('See [x][r].\n\n[r]: #nowhere'), (repo) => {
      const { reporter } = repo.build();
      assert.deepEqual(codes(reporter), [
        'E_MARKDOWN_FORM',
        'E_MARKDOWN_FORM',
        'E_BROKEN_ANCHOR',
        'E_BROKEN_ANCHOR',
      ]);
    });
  });

  it('a failed build leaves the previous output untouched', async () => {
    await withRepo((repo) => {
      assert.equal(repo.build().ok, true);
      const before = hashTree(repo.dist);
      repo.write('site.json', '{');
      assert.equal(repo.build().ok, false);
      repo.write('site.json', {
        siteUrl: 'https://example.com',
        ogImage: 'img/og.webp',
      });
      repo.write('static/bad.html', 'x');
      assert.equal(repo.build().ok, false);
      assert.deepEqual(hashTree(repo.dist), before);
      assert.deepEqual(leftovers(repo), []);
    });
  });

  it('a failure while writing leaves the previous output and no leftovers', async () => {
    await withRepo((repo) => {
      repo.build();
      const before = hashTree(repo.dist);
      repo.write(
        'src/css/00-test.css',
        `${repo.read('src/css/00-test.css')}changed{}`,
      );
      for (const rule of [
        { op: 'writeFileSync', match: 'sitemap.xml' },
        { op: 'copyFileSync' },
        { op: 'renameSync', match: (from) => from.endsWith(`${path.sep}new`) },
      ]) {
        const fs = failing(nodeFs, { ...rule, code: 'ENOSPC' });
        const { ok, files, reporter } = repo.build({ fs });
        assert.equal(ok, false);
        assert.deepEqual(files, []);
        assert.deepEqual(codes(reporter), ['E_WRITE']);
        assert.deepEqual(hashTree(repo.dist), before);
        assert.deepEqual(leftovers(repo), []);
      }
    });
  });

  it('reports when the previous output cannot be put back, and keeps it in the working folder', async () => {
    await withRepo((repo) => {
      repo.build();
      const fs = failing(nodeFs, [
        { op: 'renameSync', match: (from) => from.endsWith(`${path.sep}new`) },
        {
          op: 'renameSync',
          match: (from) => from.endsWith(`${path.sep}old`),
          code: 'EBUSY',
        },
      ]);
      const { ok, reporter } = repo.build({ fs });
      assert.equal(ok, false);
      assert.deepEqual(codes(reporter), ['E_WRITE', 'E_WRITE']);
      const [work] = leftovers(repo);
      assert.ok(repo.exists(`${work}/old/index.html`));
    });
  });
});

describe('build: --out refuses folders that are not build output', () => {
  for (const outDir of [
    '.',
    '..',
    'content',
    'content/pl',
    'static',
    'src',
    'scripts',
    'node_modules',
    '.git',
  ]) {
    it(`refuses ${outDir} and touches nothing`, async () => {
      await withRepo((repo) => {
        const before = hashTree(repo.root);
        const { ok, files, reporter } = repo.build({ outDir });
        assert.equal(ok, false);
        assert.deepEqual(files, []);
        assert.deepEqual(codes(reporter), ['E_OUT_DIR']);
        assert.deepEqual(hashTree(repo.root), before);
      });
    });
  }

  it('refuses a folder with files that is not a build output', async () => {
    await withRepo({ 'mine/notes.txt': 'precious' }, (repo) => {
      const { ok, reporter } = repo.build({ outDir: 'mine' });
      assert.equal(ok, false);
      assert.deepEqual(codes(reporter), ['E_OUT_DIR']);
      assert.equal(repo.read('mine/notes.txt'), 'precious');
    });
  });

  it('refuses a Git checkout', async () => {
    await withRepo(
      { 'pages/.nojekyll': '', 'pages/.git/HEAD': 'ref' },
      (repo) => {
        const { ok, reporter } = repo.build({ outDir: 'pages' });
        assert.equal(ok, false);
        assert.deepEqual(codes(reporter), ['E_OUT_DIR']);
        assert.equal(repo.read('pages/.git/HEAD'), 'ref');
      },
    );
  });

  it('replaces a previous build', async () => {
    await withRepo({ 'out/.nojekyll': '', 'out/old.html': 'x' }, (repo) => {
      assert.equal(repo.build({ outDir: 'out' }).ok, true);
      assert.equal(repo.exists('out/old.html'), false);
      assert.ok(repo.exists('out/index.html'));
    });
  });

  it('replaces a link to a build with a real folder, never writing through it', async () => {
    await withRepo(
      { 'victim/.nojekyll': '', 'victim/keep.txt': 'keep' },
      (repo) => {
        repo.symlink('dist', 'victim');
        const { ok } = repo.build();
        assert.equal(ok, true);
        assert.equal(repo.read('victim/keep.txt'), 'keep');
        assert.equal(repo.exists('victim/index.html'), false);
        assert.ok(repo.exists('dist/index.html'));
      },
    );
  });

  it('is refused for a folder it cannot list', async () => {
    await withRepo((repo) => {
      repo.build();
      const fs = failing(nodeFs, {
        op: 'readdirSync',
        match: /dist$/,
        code: 'EACCES',
      });
      const { ok, reporter } = repo.build({ fs });
      assert.equal(ok, false);
      assert.deepEqual(codes(reporter), ['E_OUT_DIR']);
    });
  });

  it('accepts an absolute folder outside the repository', async () => {
    await withRepo((repo) => {
      const out = path.join(
        path.dirname(repo.root),
        `${path.basename(repo.root)}-out`,
      );
      try {
        assert.equal(
          build({ root: repo.root, outDir: out, imageSize }).ok,
          true,
        );
        assert.ok(nodeFs.existsSync(path.join(out, 'index.html')));
      } finally {
        nodeFs.rmSync(out, { recursive: true, force: true });
      }
    });
  });
});

describe('build: what it writes for programs that read the guide', () => {
  /** A git whose history gives every language the same two commits. */
  const git = (args) =>
    args[0] === 'rev-parse'
      ? 'false\n'
      : '2026-11-06T22:18:37+01:00\n2026-01-02T03:04:05Z\n';

  it('writes a Markdown copy of every published page and llms.txt', async () => {
    await withRepo((repo) => {
      const { ok, files } = repo.build({ strict: true });
      assert.equal(ok, true);
      for (const file of ['pl/index.md', 'en/index.md', 'llms.txt'])
        assert.ok(files.includes(file), file);
      assert.match(pageOf(repo, 'en/index.md'), /^# Pizza Compendium\n/);
      assert.match(pageOf(repo, 'en/index.md'), /\n## Quick start\n/);
      const llms = pageOf(repo, 'llms.txt');
      assert.match(llms, /^# Kompendium pizzy\n/);
      assert.match(llms, /\(https:\/\/[^)]+\/en\/index\.md\)/);
      assert.match(
        llms,
        /\[Quick start\]\(https:\/\/[^)]+\/en\/#quick-start\)/,
      );
      assert.match(
        pageOf(repo, 'en/index.html'),
        /<script type="application\/ld\+json">/,
      );
    });
  });

  it('writes no Markdown copy of a draft and leaves it out of llms.txt', async () => {
    await withRepo((repo) => {
      repo.addLanguage('de', { status: 'draft', name: 'Deutsch' });
      const { ok } = repo.build({ strict: true });
      assert.equal(ok, true);
      assert.ok(!repo.exists('dist/de/index.md'));
      assert.doesNotMatch(pageOf(repo, 'llms.txt'), /Deutsch|\/de\//);
    });
  });

  it('dates the pages, the copies and the sitemap from the history git gives', async () => {
    await withRepo((repo) => {
      const { ok, reporter } = repo.build({ strict: true, git });
      assert.deepEqual(codes(reporter), []);
      assert.equal(ok, true);
      const html = pageOf(repo, 'en/index.html');
      assert.match(html, /<time datetime="2026-11-06">/);
      assert.match(html, /"dateModified":"2026-11-06T22:18:37\+01:00"/);
      assert.match(
        pageOf(repo, 'en/index.md'),
        /\nupdated November 6, 2026 \(en\)\n/,
      );
      const lastmods = pageOf(repo, 'sitemap.xml').match(
        /<lastmod>2026-11-06T22:18:37\+01:00<\/lastmod>/g,
      );
      assert.equal(lastmods.length, 2);
    });
  });

  it('carries no dates without git', async () => {
    await withRepo((repo) => {
      repo.build();
      assert.doesNotMatch(pageOf(repo, 'en/index.html'), /<time |dateModified/);
      assert.doesNotMatch(pageOf(repo, 'sitemap.xml'), /lastmod/);
    });
  });

  it('warns about a shallow history and carries no dates from it', async () => {
    await withRepo((repo) => {
      const shallow = (args) =>
        args[0] === 'rev-parse' ? 'true\n' : git(args);
      const { reporter } = repo.build({ git: shallow });
      assert.deepEqual(view(reporter), [
        { level: 'warning', code: 'W_HISTORY_SHALLOW', file: 'content' },
      ]);
      assert.doesNotMatch(pageOf(repo, 'en/index.html'), /dateModified/);
      assert.equal(repo.build({ git: shallow, strict: true }).ok, false);
    });
  });
});
