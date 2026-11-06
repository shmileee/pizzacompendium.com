// The test helpers (test/helpers/) tested on their own: they are what every
// other test stands on, so a helper that quietly stopped doing its job (a
// default site that is no longer valid, a fake fs that never fails) would turn
// hundreds of tests into tests of nothing. They also show how each is used.

import assert from 'node:assert/strict';
import { once } from 'node:events';
import nodeFs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { describe, it } from 'node:test';
import { pathToFileURL } from 'node:url';
import { imageSize } from 'image-size';
import {
  inlineScript,
  LANG_KEY,
  markScripted,
  redirect,
} from '../scripts/lib/inline-scripts.mjs';
import { loadRules } from '../scripts/lib/rules.mjs';
import { createHandler } from '../scripts/lib/serve.mjs';
import { loadSite } from '../scripts/lib/site-config.mjs';
import {
  fakeDocument,
  fakeStorage,
  fakeWindow,
  runInline,
} from './helpers/browser.mjs';
import {
  capture,
  codes,
  errorCodes,
  find,
  findAll,
  view,
  warningCodes,
} from './helpers/capture.mjs';
import { runCli, startCli, withCli } from './helpers/cli.mjs';
import { counting, failing } from './helpers/fake-fs.mjs';
import {
  call,
  fakeResponse,
  rawRequest,
  startServer,
  withServer,
} from './helpers/http.mjs';
import {
  createRealRepo,
  createRepo,
  hashTree,
  introText,
  langJson,
  listFiles,
  REAL_ROOT,
  readTree,
  rulesJson,
  uiKeys,
  webp,
  withRealRepo,
  withRepo,
  withTree,
} from './helpers/repo.mjs';

/** Sets environment variables for the length of `fn`, then puts them back. */
async function withEnv(vars, fn) {
  const before = Object.fromEntries(
    Object.keys(vars).map((name) => [name, process.env[name]]),
  );
  Object.assign(process.env, vars);
  try {
    return await fn();
  } finally {
    for (const [name, value] of Object.entries(before))
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
  }
}

describe('the default compendium', () => {
  it('builds in strict mode without a single diagnostic', async () => {
    await withRepo((repo) => {
      const result = repo.build({ strict: true });
      assert.deepEqual(view(result.reporter), []);
      assert.equal(result.ok, true);
      assert.deepEqual(result.languages, ['pl', 'en']);
    });
  });

  it('holds the files it documents, and no others', async () => {
    await withRepo((repo) => {
      assert.deepEqual(repo.list(), [
        'content/en/01-intro.md',
        'content/en/lang.json',
        'content/pl/01-intro.md',
        'content/pl/lang.json',
        'content/rules.json',
        'site.json',
        'src/app.js',
        'src/css/00-test.css',
        'src/favicon.svg',
        'static/apple-touch-icon.png',
        'static/favicon-32.png',
        'static/icon-192.png',
        'static/icon-512.png',
        'static/icon-maskable-512.png',
        'static/img/hero-mobile.webp',
        'static/img/hero.webp',
        'static/img/og.webp',
      ]);
    });
  });

  it('is the same site in two builds, to the byte', async () => {
    await withRepo((repo) => {
      assert.equal(repo.build().ok, true);
      assert.equal(repo.build({ outDir: 'again' }).ok, true);
      assert.ok(Object.hasOwn(hashTree(repo.dist), 'pl/index.html'));
      assert.deepEqual(hashTree(repo.dist), hashTree(repo.path('again')));
      assert.deepEqual(readTree(repo.dist), readTree(repo.path('again')));
    });
  });

  it('gives another hash to a page that changed and the same to one that did not', async () => {
    await withRepo((repo) => {
      repo.build();
      repo.write(
        'content/en/01-intro.md',
        introText('en').replace('A short text', 'Other words'),
      );
      repo.build({ outDir: 'other' });
      const [before, after] = [
        hashTree(repo.dist),
        hashTree(repo.path('other')),
      ];
      assert.notEqual(before['en/index.html'], after['en/index.html']);
      assert.equal(before['pl/index.html'], after['pl/index.html']);
    });
  });

  it('keeps its rules and its language files in the shape the generator reads', async () => {
    await withRepo((repo) => {
      const reporter = capture();
      const rules = loadRules({ root: repo.root, reporter });
      assert.deepEqual(codes(reporter), []);
      assert.equal(rules.rules.length, rulesJson().rules.length);
      assert.equal(repo.readJson('content/pl/lang.json').source, true);
      assert.equal(repo.readJson('content/en/lang.json').source, undefined);
    });
  });

  it('knows the ui keys the generator requires, with or without the real language file', async () => {
    await withTree((tree) => {
      tree.write('lang.json', { ui: { zzExtra: 'x', toc: 'y' } });
      tree.write('broken.json', '{ not json');
      tree.write('no-ui.json', {});
      const required = uiKeys(tree.path('missing.json'));
      assert.ok(required.includes('toc'));
      assert.ok(required.length > 0);
      assert.deepEqual(uiKeys(tree.path('broken.json')), required);
      assert.deepEqual(uiKeys(tree.path('no-ui.json')), required);
      assert.deepEqual(uiKeys(tree.path('lang.json')), [
        ...required,
        'zzExtra',
      ]);
      assert.equal(langJson('pl').ui.toc, 'toc (pl)');
    });
  });

  it('shares nothing between two callers', () => {
    const lang = langJson('en');
    lang.ui.toc = 'changed';
    assert.notEqual(langJson('en').ui.toc, 'changed');
    const rules = rulesJson();
    rules.rules.length = 0;
    assert.notEqual(rulesJson().rules.length, 0);
  });
});

describe('createRepo', () => {
  it('makes a folder of its own for every compendium and removes only that one', () => {
    const first = createRepo();
    const second = createRepo();
    try {
      assert.notEqual(first.root, second.root);
      assert.equal(first.root, nodeFs.realpathSync(first.root));
      first.cleanup();
      assert.equal(nodeFs.existsSync(first.root), false);
      assert.equal(nodeFs.existsSync(second.root), true);
    } finally {
      first.cleanup();
      second.cleanup();
    }
  });

  it('lets overrides replace, add and delete files', async () => {
    await withRepo(
      {
        'content/en/01-intro.md': 'Replaced.\n',
        'extra/new.txt': 'added',
        'extra/bytes.bin': Buffer.from([1, 2, 3]),
        'extra/data.json': { a: 1 },
        'content/en/lang.json': null,
      },
      (repo) => {
        assert.equal(repo.read('content/en/01-intro.md'), 'Replaced.\n');
        assert.equal(repo.read('extra/new.txt'), 'added');
        assert.deepEqual(
          [...nodeFs.readFileSync(repo.path('extra/bytes.bin'))],
          [1, 2, 3],
        );
        assert.equal(repo.read('extra/data.json'), '{\n  "a": 1\n}\n');
        assert.equal(repo.exists('content/en/lang.json'), false);
        assert.equal(repo.exists('content/pl/lang.json'), true);
      },
    );
  });

  it('refuses an override that leads out of its folder', () => {
    assert.throws(() => createRepo({ '../outside.txt': 'x' }), RangeError);
    assert.throws(() => createRepo({ '/etc/outside.txt': 'x' }), RangeError);
  });

  it('makes its folders in the system temp folder and leaves none behind when it fails', async () => {
    await withTree((outer) =>
      withEnv({ TMPDIR: outer.root }, () => {
        assert.throws(() => createRepo({ '../outside.txt': 'x' }), RangeError);
        assert.deepEqual(nodeFs.readdirSync(outer.root), []);
        const repo = createRepo();
        try {
          assert.equal(path.dirname(repo.root), outer.root);
        } finally {
          repo.cleanup();
        }
      }),
    );
  });

  it('removes the folder when the callback of withRepo throws', async () => {
    let root;
    await assert.rejects(
      withRepo((repo) => {
        root = repo.root;
        throw new Error('boom');
      }),
      /boom/,
    );
    assert.equal(nodeFs.existsSync(root), false);
  });

  it('passes the options of the build on: strict makes a warning fail it', async () => {
    await withRepo((repo) => {
      repo.remove('content/en/01-intro.md');
      const lenient = repo.build();
      assert.equal(lenient.ok, true);
      assert.deepEqual(view(lenient.reporter), [
        {
          level: 'warning',
          code: 'W_FALLBACK',
          file: 'content/en/01-intro.md',
        },
      ]);
      const strict = repo.build({ strict: true });
      assert.equal(strict.ok, false);
      assert.deepEqual(errorCodes(strict.reporter), ['W_FALLBACK']);
    });
  });

  it('writes an image and its narrower copies, and the build uses them', async () => {
    await withRepo((repo) => {
      repo.image('img/photo.webp', {
        width: 960,
        height: 640,
        variants: [480],
      });
      for (const code of ['pl', 'en'])
        repo.write(
          `content/${code}/01-intro.md`,
          `${introText(code)}\n![Pizza](img/photo.webp)\n`,
        );
      const size = (rel) =>
        imageSize(nodeFs.readFileSync(repo.path(`static/${rel}`)));
      assert.deepEqual(
        [size('img/photo.webp').width, size('img/photo-480w.webp').height],
        [960, 320],
      );
      const result = repo.build({ strict: true });
      assert.deepEqual(codes(result.reporter), []);
      const html = repo.read('dist/en/index.html');
      assert.match(html, /photo-480w\.webp 480w/);
      assert.match(html, /photo\.webp 960w/);
    });
  });

  it('needs a file extension to name the narrower copies', async () => {
    await withRepo((repo) => {
      assert.throws(() => repo.image('img/photo'), TypeError);
    });
  });

  it('adds languages that build like the others, and a draft that stays out of the sitemap', async () => {
    await withRepo((repo) => {
      repo.addLanguage('de', { name: 'Deutsch' });
      repo.addLanguage('fr', { status: 'draft' });
      // A section that the languages added so far do not have.
      repo.write('content/pl/02-more.md', '## Więcej {#more}\n\nTekst.\n');
      repo.addLanguage('es');
      const result = repo.build();
      // In the order of the languages: en has order 2, de the default.
      assert.deepEqual(view(result.reporter), [
        { level: 'warning', code: 'W_FALLBACK', file: 'content/en/02-more.md' },
        { level: 'warning', code: 'W_FALLBACK', file: 'content/de/02-more.md' },
      ]);
      assert.deepEqual(result.languages.sort(), ['de', 'en', 'es', 'fr', 'pl']);
      assert.deepEqual(repo.list('content/es'), [
        '01-intro.md',
        '02-more.md',
        'lang.json',
      ]);
      assert.match(repo.read('content/es/02-more.md'), /Translation es\./);
      const sitemap = repo.read('dist/sitemap.xml');
      assert.match(sitemap, /\/de\//);
      assert.doesNotMatch(sitemap, /\/fr\//);
      assert.match(repo.read('dist/fr/index.html'), /noindex/);
    });
  });

  it('lets a patch drop a field of a lang.json and a key of its ui', () => {
    const lang = JSON.parse(
      JSON.stringify(
        langJson('en', { name: undefined, ui: { toc: undefined } }),
      ),
    );
    assert.equal(lang.name, undefined);
    assert.equal(lang.ui.toc, undefined);
    assert.equal(lang.htmlLang, 'en');
    assert.match(introText('de'), /\{#intro\}/);
  });
});

describe('createRealRepo', () => {
  it('copies the real content, images, scripts and settings and leaves the real files alone', async () => {
    await withRealRepo((repo) => {
      // Files that do not change while the repository is being worked on.
      for (const rel of ['content/rules.json', 'src/app.js'])
        assert.equal(
          repo.read(rel),
          nodeFs.readFileSync(path.join(REAL_ROOT, rel), 'utf8'),
        );
      for (const rel of ['content/pl/lang.json', 'site.json', 'static/img'])
        assert.equal(repo.exists(rel), true);
      assert.equal(repo.exists('dist'), false);
      assert.equal(repo.exists('scripts'), false);
      assert.equal(typeof repo.build, 'function');
      // Bending the copy does not touch the original.
      repo.write('content/zz-bent.md', 'x');
      repo.remove('src');
      const real = (rel) => nodeFs.existsSync(path.join(REAL_ROOT, rel));
      assert.equal(real('content/zz-bent.md'), false);
      assert.equal(real('src/app.js'), true);
    });
  });

  it('removes its copy when the callback of withRealRepo throws', async () => {
    let root;
    await assert.rejects(
      withRealRepo((repo) => {
        root = repo.root;
        throw new Error('boom');
      }),
      /boom/,
    );
    assert.equal(nodeFs.existsSync(root), false);
  });

  it('copies only what it is asked to, and cleans up when something is missing', async () => {
    await withTree((outer) =>
      withEnv({ TMPDIR: outer.root }, () => {
        const repo = createRealRepo(['site.json']);
        try {
          assert.deepEqual(repo.list(), ['site.json']);
        } finally {
          repo.cleanup();
        }
        assert.throws(() => createRealRepo(['no-such-file']), {
          code: 'ENOENT',
        });
        assert.deepEqual(nodeFs.readdirSync(outer.root), []);
      }),
    );
  });
});

describe('the tree helpers', () => {
  it('writes, reads, edits, lists and removes files', async () => {
    await withTree((tree) => {
      tree.write('a/b/one.txt', 'one');
      tree.write('two.json', { n: 2 });
      tree.edit('a/b/one.txt', (text) => `${text}!`);
      tree.editJson('two.json', (data) => {
        data.n = 3;
      });
      tree.editJson('two.json', (data) => ({ ...data, m: 4 }));
      assert.equal(tree.read('a/b/one.txt'), 'one!');
      assert.deepEqual(tree.readJson('two.json'), { n: 3, m: 4 });
      assert.deepEqual(tree.list(), ['a/b/one.txt', 'two.json']);
      assert.deepEqual(tree.list('a'), ['b/one.txt']);
      tree.remove('a');
      tree.remove('a');
      assert.equal(tree.exists('a/b/one.txt'), false);
      assert.deepEqual(Object.keys(readTree(tree.root)), ['two.json']);
      assert.deepEqual(listFiles(tree.root), ['two.json']);
    });
  });

  it('knows a symbolic link, even one that points at nothing', async () => {
    await withTree((tree) => {
      tree.symlink('dangling', 'nowhere');
      tree.symlink('deep/link', '../two.txt');
      assert.equal(tree.exists('dangling'), true);
      assert.deepEqual(tree.list(), ['dangling', 'deep/link']);
    });
  });

  it('refuses a path that leads out of the folder', async () => {
    await withTree((tree) => {
      assert.throws(() => tree.write('../x', 'x'), RangeError);
      assert.throws(() => tree.read('a/../../x'), RangeError);
      assert.throws(() => tree.path('..'), RangeError);
      assert.equal(tree.path('.'), tree.root);
      assert.equal(tree.path('a/../b'), path.join(tree.root, 'b'));
    });
  });

  it('removes the folder when the callback of withTree throws', async () => {
    let root;
    await assert.rejects(
      withTree((tree) => {
        root = tree.root;
        throw new Error('boom');
      }),
      /boom/,
    );
    assert.equal(nodeFs.existsSync(root), false);
  });
});

describe('webp', () => {
  it('writes a decodable image of any size in 34 bytes', () => {
    for (const [width, height] of [
      [1, 1],
      [480, 320],
      [16384, 16384],
    ]) {
      const bytes = webp(width, height);
      assert.equal(bytes.length, 34);
      assert.deepEqual(imageSize(bytes), { width, height, type: 'webp' });
    }
  });

  it('refuses a side that no WebP can have', () => {
    for (const size of [0, 16385, 1.5, -1, Number.NaN])
      assert.throws(() => webp(size, 1), RangeError);
    assert.throws(() => webp(1, 0), RangeError);
  });
});

describe('capture', () => {
  it('reads what a reporter collected by code, level and place, never by message', () => {
    const reporter = capture();
    reporter.error('E_ONE', 'first', { file: 'a.md', line: 3 });
    reporter.warn('W_TWO', 'second', { file: 'b.md' });
    reporter.error('E_ONE', 'third', { field: 'ui.toc' });
    assert.deepEqual(codes(reporter), ['E_ONE', 'W_TWO', 'E_ONE']);
    assert.deepEqual(errorCodes(reporter), ['E_ONE', 'E_ONE']);
    assert.deepEqual(warningCodes(reporter), ['W_TWO']);
    assert.equal(find(reporter, 'E_ONE').line, 3);
    assert.equal(find(reporter, 'E_NONE'), undefined);
    assert.equal(findAll(reporter, 'E_ONE').length, 2);
    assert.deepEqual(view(reporter), [
      { level: 'error', code: 'E_ONE', file: 'a.md', line: 3 },
      { level: 'warning', code: 'W_TWO', file: 'b.md' },
      { level: 'error', code: 'E_ONE', field: 'ui.toc' },
    ]);
  });

  it('is the real reporter: strict turns a warning into an error and keeps its code', () => {
    const reporter = capture({ strict: true });
    reporter.warn('W_TWO', 'second');
    assert.deepEqual(errorCodes(reporter), ['W_TWO']);
    assert.deepEqual(warningCodes(reporter), []);
  });
});

describe('failing', () => {
  it('makes one operation fail with the chosen code, on the matching paths only', async () => {
    await withRepo((repo) => {
      const fs = failing(nodeFs, {
        op: 'lstatSync',
        match: /site\.json$/,
        code: 'EACCES',
      });
      const reporter = capture();
      assert.equal(loadSite({ fs, root: repo.root, reporter }), null);
      assert.deepEqual(view(reporter), [
        { level: 'error', code: 'E_READ', file: 'site.json' },
      ]);
      assert.deepEqual(
        fs.failures.map(({ op, code }) => [op, code]),
        [['lstatSync', 'EACCES']],
      );
      // Everything else reaches the real disk.
      const other = capture();
      assert.ok(loadRules({ fs, root: repo.root, reporter: other }));
      assert.deepEqual(codes(other), []);
    });
  });

  it('carries the code on the error, as the errors of node:fs do', async () => {
    await withRepo((repo) => {
      const file = repo.path('site.json');
      const fs = failing(nodeFs, { op: 'readFileSync', code: 'EMFILE' });
      assert.throws(() => fs.readFileSync(file), {
        code: 'EMFILE',
        syscall: 'readFile',
        path: file,
      });
      const plain = failing(nodeFs, { op: 'readFileSync' });
      assert.throws(() => plain.readFileSync(file), { code: 'EIO' });
    });
  });

  it('counts the calls it lets through and the calls it fails', async () => {
    await withRepo((repo) => {
      const fs = failing(nodeFs, {
        op: 'readFileSync',
        match: 'rules.json',
        code: 'ENOENT',
      });
      fs.readFileSync(repo.path('site.json'));
      fs.readFileSync(repo.path('site.json'));
      assert.throws(() => fs.readFileSync(repo.path('content/rules.json')));
      assert.equal(fs.count('readFileSync'), 3);
      assert.equal(fs.count('readFileSync', 'site.json'), 2);
      assert.equal(fs.count('readFileSync', /rules\.json$/), 1);
      assert.equal(
        fs.count('readFileSync', (file) => file.endsWith('.md')),
        0,
      );
      assert.equal(fs.count('lstatSync'), 0);
      assert.equal(fs.failures.length, 1);
      assert.equal(fs.calls[0].op, 'readFileSync');
    });
  });

  it('can let the first calls through and stop failing after a few', async () => {
    await withRepo((repo) => {
      const fs = failing(nodeFs, { op: 'readFileSync', after: 1, times: 2 });
      const read = () => fs.readFileSync(repo.path('site.json'), 'utf8');
      assert.ok(read());
      assert.throws(read, { code: 'EIO' });
      assert.throws(read, { code: 'EIO' });
      assert.ok(read());
      assert.equal(fs.failures.length, 2);
    });
  });

  it('judges both paths of a rename, and a list of rules fails each operation its own way', async () => {
    await withRepo((repo) => {
      const fs = failing(nodeFs, [
        {
          op: 'renameSync',
          match: (_from, to) => to.endsWith('.new'),
          code: 'EXDEV',
        },
        { op: 'rmSync', match: 'gone', code: 'EBUSY' },
      ]);
      repo.write('a.txt', 'a');
      assert.throws(
        () => fs.renameSync(repo.path('a.txt'), repo.path('b.new')),
        { code: 'EXDEV' },
      );
      fs.renameSync(repo.path('a.txt'), repo.path('b.txt'));
      assert.equal(repo.exists('b.txt'), true);
      assert.throws(() => fs.rmSync(repo.path('gone')), { code: 'EBUSY' });
      fs.rmSync(repo.path('b.txt'));
      assert.equal(repo.exists('b.txt'), false);
    });
  });

  it('reaches the native realpath and leaves what it does not wrap alone', async () => {
    await withRepo((repo) => {
      const fs = failing(nodeFs, {
        op: 'realpathSync.native',
        match: 'site.json',
        code: 'ENOENT',
      });
      assert.equal(fs.realpathSync.native(repo.root), repo.root);
      assert.throws(() => fs.realpathSync.native(repo.path('site.json')), {
        code: 'ENOENT',
      });
      assert.equal(fs.constants, nodeFs.constants);
      assert.equal(fs.count('realpathSync.native'), 2);
    });
  });

  it('judges every call by the same rule, also with a global regular expression', async () => {
    await withRepo((repo) => {
      const file = repo.path('site.json');
      const fs = failing(nodeFs, { op: 'readFileSync', match: /site\.json$/g });
      for (let call = 0; call < 3; call++)
        assert.throws(() => fs.readFileSync(file), { code: 'EIO' });
    });
  });

  it('matches a path that is given as a URL or as bytes, and never looks at data', async () => {
    await withRepo((repo) => {
      const file = repo.path('site.json');
      const fs = failing(nodeFs, { op: 'readFileSync', match: 'site.json' });
      assert.throws(() => fs.readFileSync(pathToFileURL(file)), {
        code: 'EIO',
      });
      assert.throws(() => fs.readFileSync(Buffer.from(file)), { code: 'EIO' });
      assert.ok(fs.readFileSync(repo.path('content/rules.json')));
      // The second argument of a write is data, not a path.
      const writing = failing(nodeFs, {
        op: 'writeFileSync',
        match: 'site.json',
      });
      writing.writeFileSync(repo.path('other.txt'), 'site.json');
      assert.equal(repo.read('other.txt'), 'site.json');
      // A file descriptor is no path: only a rule without `match` fails it.
      const descriptor = nodeFs.openSync(file, 'r');
      try {
        assert.ok(fs.readFileSync(descriptor));
        const anything = failing(nodeFs, { op: 'readFileSync' });
        assert.throws(() => anything.readFileSync(descriptor), {
          code: 'EIO',
          path: undefined,
        });
      } finally {
        nodeFs.closeSync(descriptor);
      }
    });
  });

  it('refuses a rule that could never fire', () => {
    assert.throws(() => failing(nodeFs, { op: 'readFileSinc' }), TypeError);
    assert.throws(() => failing(nodeFs, { op: 'readFile' }), TypeError);
    assert.throws(() => failing(nodeFs, { op: 'constants' }), TypeError);
  });

  it('only counts when it has no rule', async () => {
    await withRepo((repo) => {
      const fs = counting(nodeFs);
      assert.equal(repo.build({ fs }).ok, true);
      assert.ok(fs.count('writeFileSync') > 0);
      assert.equal(fs.failures.length, 0);
    });
  });
});

describe('the fake request and response', () => {
  it('runs a handler and reports status, headers (in lower case) and body', async () => {
    await withRepo((repo) => {
      repo.build();
      const handler = createHandler({ distDir: repo.dist });
      const page = call(handler, '/en/');
      assert.equal(page.status, 200);
      assert.equal(page.headers['content-type'], 'text/html; charset=utf-8');
      assert.match(page.text, /<html lang="en"/);
      assert.ok(Buffer.isBuffer(page.body));
      const head = call(handler, '/en/', { method: 'HEAD' });
      assert.equal(head.body, undefined);
      assert.equal(head.text, '');
      assert.equal(call(handler, '/nothing-here').status, 404);
      assert.equal(call(handler, '/en/', { method: 'POST' }).status, 405);
    });
  });

  it('refuses to call a handler that does not answer exactly once', () => {
    assert.throws(() => call(() => {}, '/'), /one writeHead and one end/);
    assert.throws(
      () =>
        call((_req, res) => {
          res.writeHead(200, {});
          res.end('a');
          res.end('b');
        }, '/'),
      /one writeHead and one end/,
    );
    const res = fakeResponse();
    res.writeHead(204, { 'X-Name': 'v' });
    res.end();
    assert.deepEqual(res.result(), {
      status: 204,
      headers: { 'x-name': 'v' },
      body: undefined,
      text: '',
    });
  });
});

describe('the real server', () => {
  it('serves a built site on a free port and sends the request target as written', async () => {
    await withRepo(async (repo) => {
      repo.build();
      repo.write('secret.txt', 'outside the site');
      repo.write('dist/secret.txt', 'inside the site');
      await withServer(repo.dist, async ({ url, port }) => {
        assert.match(url, /^http:\/\/127\.0\.0\.1:\d+$/);
        assert.ok(port > 0);
        const page = await rawRequest(url, '/en/');
        assert.equal(page.status, 200);
        assert.match(page.body, /<html lang="en"/);
        const sitemap = await rawRequest(url, '/sitemap.xml', {
          method: 'HEAD',
        });
        assert.equal(sitemap.headers['content-type'], 'application/xml');
        assert.equal(sitemap.body, '');
        const image = await rawRequest(url, '/img/og.webp');
        assert.equal(image.headers['content-type'], 'image/webp');
        assert.equal(image.buffer.length, 34);
        // The target reaches the server untouched and is refused ...
        const dotted = await rawRequest(url, '/../secret.txt');
        assert.equal(dotted.status, 404);
        assert.match(dotted.body, /<title>404\b/);
        // ... where a client that tidies the path asks for another file.
        const tidied = await fetch(`${url}/../secret.txt`);
        assert.equal(await tidied.text(), 'inside the site');
      });
    });
  });

  it('stops listening when it is closed', async () => {
    await withRepo(async (repo) => {
      repo.build();
      const { url, close } = await startServer(repo.dist);
      assert.equal((await rawRequest(url, '/en/')).status, 200);
      await close();
      await assert.rejects(rawRequest(url, '/en/'), { code: 'ECONNREFUSED' });
    });
  });

  it('serves every request on a connection of its own', async () => {
    await withRepo(async (repo) => {
      repo.build();
      const { server, url, close } = await startServer(repo.dist);
      let connections = 0;
      server.on('connection', () => {
        connections += 1;
      });
      try {
        for (let request = 0; request < 3; request++)
          await rawRequest(url, '/en/');
        assert.equal(connections, 3);
      } finally {
        await close();
      }
    });
  });

  it('closes even when a client has a request open that it never finishes', async () => {
    await withRepo(async (repo) => {
      repo.build();
      const { server, port, close } = await startServer(repo.dist);
      const accepted = once(server, 'connection');
      const socket = net.connect(port, '127.0.0.1');
      try {
        socket.write('GET /en/ HTTP/1.1\r\nHost: localhost\r\n');
        await accepted;
        let timer;
        const outcome = await Promise.race([
          close().then(() => 'closed'),
          new Promise((resolve) => {
            timer = setTimeout(() => resolve('still open'), 3000);
          }),
        ]);
        clearTimeout(timer);
        assert.equal(outcome, 'closed');
      } finally {
        socket.destroy();
      }
    });
  });

  it('closes the server when the callback of withServer throws', async () => {
    await withRepo(async (repo) => {
      repo.build();
      let origin;
      await assert.rejects(
        withServer(repo.dist, ({ url }) => {
          origin = url;
          throw new Error('boom');
        }),
        /boom/,
      );
      await assert.rejects(rawRequest(origin, '/'), { code: 'ECONNREFUSED' });
    });
  });
});

describe('runCli', () => {
  const PROBE =
    'console.log(JSON.stringify({ env: process.env, cwd: process.cwd() }));\n';

  it('runs a script on a temp tree and gives status, output and JSON', async () => {
    await withRepo((repo) => {
      const args = ['--format', 'json'];
      const clean = runCli('lint-content.mjs', args, { root: repo.root });
      assert.equal(clean.status, 0);
      assert.equal(clean.signal, null);
      assert.deepEqual(clean.json(), []);
      assert.match(clean.stderr, /content rules: 0 error\(s\), 0 warning\(s\)/);

      repo.write(
        'content/en/01-intro.md',
        introText('en').replace('A short text about pizza', 'A Polish text'),
      );
      const dirty = runCli('lint-content.mjs', args, { root: repo.root });
      assert.equal(dirty.status, 1);
      assert.deepEqual(
        dirty.json().map(({ code, file, line }) => [code, file, line]),
        [['E_COUNTRY_REMARK', 'content/en/01-intro.md', 3]],
      );
    });
  });

  it('builds in the tree, from the working directory it is given', async () => {
    await withRepo((repo) => {
      repo.write('sub/keep.txt', '');
      const built = runCli('build.mjs', ['--out', 'site'], {
        root: repo.root,
        cwd: repo.path('sub'),
      });
      assert.equal(built.status, 0);
      assert.match(built.stderr, /Built pl, en → site\//);
      assert.equal(repo.exists('sub/site/pl/index.html'), true);

      const refused = runCli('build.mjs', ['--out', repo.path('content')], {
        root: repo.root,
      });
      assert.equal(refused.status, 1);
      assert.match(refused.stderr, /\[E_OUT_DIR\]/);
    });
  });

  it('does not pass the environment of the machine on to the script, but Node hands on the coverage directory', async () => {
    await withTree((tree) =>
      withEnv(
        {
          GITHUB_ACTIONS: 'true',
          CI: 'true',
          PORT: 'not a port',
          HOST: 'example.test',
          COMPENDIUM_ROOT: '/not/this',
          NODE_V8_COVERAGE: tree.path('coverage'),
        },
        () => {
          tree.write('probe.mjs', PROBE);
          const probe = runCli(tree.path('probe.mjs'), [], { root: tree.root });
          const { env, cwd } = probe.json();
          // macOS adds __CF_USER_TEXT_ENCODING to every process by itself.
          const names = Object.keys(env).filter(
            (name) => !name.startsWith('__CF'),
          );
          assert.deepEqual(names.sort(), [
            'COMPENDIUM_ROOT',
            'LC_ALL',
            'NODE_V8_COVERAGE',
            'PATH',
            'TZ',
          ]);
          assert.equal(env.COMPENDIUM_ROOT, tree.root);
          assert.equal(env.TZ, 'UTC');
          assert.equal(cwd, tree.root);
          // The script ran under the coverage directory it was handed.
          assert.ok(
            tree.list('coverage').some((file) => file.endsWith('.json')),
          );
        },
      ),
    );
  });

  it('adds the environment it is given, and removes what it is told to', async () => {
    await withTree((tree) => {
      tree.write('probe.mjs', PROBE);
      const { env } = runCli(tree.path('probe.mjs'), [], {
        root: tree.root,
        env: { PORT: 0, TZ: undefined, GITHUB_ACTIONS: 'true' },
      }).json();
      assert.equal(env.PORT, '0');
      assert.equal(env.GITHUB_ACTIONS, 'true');
      assert.equal(env.TZ, undefined);
    });
  });

  it('runs on the repository the script is in when the root is null', async () => {
    await withTree((tree) => {
      tree.write('probe.mjs', PROBE);
      const { env } = runCli(tree.path('probe.mjs'), [], { root: null }).json();
      assert.equal(env.COMPENDIUM_ROOT, undefined);
    });
  });

  it('prints in the default format of a machine that is not GitHub Actions', async () => {
    await withEnv({ GITHUB_ACTIONS: 'true' }, () =>
      withRepo((repo) => {
        repo.write(
          'content/en/01-intro.md',
          '## Introduction {#intro}\n\nA Polish text.\n',
        );
        const text = runCli('lint-content.mjs', [], { root: repo.root });
        assert.equal(text.stdout, '');
        assert.match(text.stderr, /\[E_COUNTRY_REMARK\]/);
        const github = runCli('lint-content.mjs', [], {
          root: repo.root,
          env: { GITHUB_ACTIONS: 'true' },
        });
        assert.match(
          github.stdout,
          /^::error file=content\/en\/01-intro\.md,line=3,title=E_COUNTRY_REMARK::/,
        );
      }),
    );
  });

  it('refuses to run without saying which tree it works on', () => {
    assert.throws(() => runCli('build.mjs', []), TypeError);
    assert.throws(() => startCli('serve.mjs', [], {}), TypeError);
  });

  it('gives up on a script that does not end', async () => {
    await withTree((tree) => {
      tree.write('hang.mjs', 'setInterval(() => {}, 1000);\n');
      assert.throws(
        () =>
          runCli(tree.path('hang.mjs'), [], { root: tree.root, timeout: 200 }),
        { code: 'ETIMEDOUT' },
      );
    });
  });
});

describe('startCli', () => {
  it('starts the preview server, tells when it is up and stops it with a signal', async () => {
    await withRepo(async (repo) => {
      repo.build();
      const cli = startCli('serve.mjs', [], {
        root: repo.root,
        env: { PORT: 0 },
      });
      const [, port] = await cli.waitFor(
        /Serving dist\/ on http:\/\/localhost:(\d+)\//,
      );
      const page = await rawRequest(`http://127.0.0.1:${port}`, '/pl/');
      assert.equal(page.status, 200);
      assert.match(cli.output().stdout, /Serving dist\//);
      // Output that is already there is found at once.
      assert.ok(await cli.waitFor(/Serving/));
      assert.deepEqual(await cli.stop(), { code: 0, signal: null });
      assert.deepEqual(await cli.stop(), { code: 0, signal: null });
    });
  });

  it('says what the script printed when it ends before the awaited output', async () => {
    await withRepo(async (repo) => {
      const cli = startCli('serve.mjs', [], {
        root: repo.root,
        env: { PORT: 'abc' },
      });
      await assert.rejects(
        cli.waitFor(/never printed/),
        /the script ended[\s\S]*PORT must be a number/,
      );
      await assert.rejects(
        cli.waitFor(/never printed/, { stream: 'stderr' }),
        /the script ended/,
      );
      assert.deepEqual(await cli.exited, { code: 1, signal: null });
    });
  });

  it('times out when the output does not come', async () => {
    await withRepo(async (repo) => {
      repo.build();
      const options = { root: repo.root, env: { PORT: 0 } };
      await withCli('serve.mjs', [], options, async (cli) => {
        await assert.rejects(
          cli.waitFor(/never printed/, { timeout: 100 }),
          /timed out/,
        );
      });
    });
  });

  it('kills a script that ignores the signal instead of hanging', async () => {
    await withTree(async (tree) => {
      tree.write(
        'stubborn.mjs',
        "process.on('SIGTERM', () => {});\nconsole.log('up');\nsetInterval(() => {}, 1000);\n",
      );
      const cli = startCli(tree.path('stubborn.mjs'), [], { root: tree.root });
      await cli.waitFor(/up/);
      assert.deepEqual(await cli.stop('SIGTERM', 200), {
        code: null,
        signal: 'SIGKILL',
      });
    });
  });

  it('stops the script even when the test throws', async () => {
    await withRepo(async (repo) => {
      repo.build();
      const options = { root: repo.root, env: { PORT: 0 } };
      let child;
      await assert.rejects(
        withCli('serve.mjs', [], options, async (cli) => {
          child = cli.child;
          await cli.waitFor(/Serving/);
          throw new Error('boom');
        }),
        /boom/,
      );
      assert.equal(child.exitCode, 0);
    });
  });
});

describe('the browser fakes', () => {
  it('remembers items like a Storage and refuses everything when it is told to', () => {
    const storage = fakeStorage({ items: { a: '1' } });
    storage.setItem('b', 2);
    assert.equal(storage.getItem('a'), '1');
    assert.equal(storage.getItem('b'), '2');
    assert.equal(storage.getItem('c'), null);
    assert.equal(storage.length, 2);
    assert.equal(storage.key(1), 'b');
    assert.equal(storage.key(5), null);
    storage.removeItem('a');
    assert.deepEqual(storage.dump(), { b: '2' });
    storage.clear();
    assert.equal(storage.length, 0);

    const blocked = fakeStorage({ throws: true });
    for (const use of [
      () => blocked.getItem('a'),
      () => blocked.setItem('a', 'b'),
      () => blocked.removeItem('a'),
      () => blocked.clear(),
      () => blocked.key(0),
      () => blocked.length,
    ])
      assert.throws(use, { name: 'SecurityError' });
  });

  it('is enough window for the redirect script, called directly', () => {
    const to = (options) => {
      const win = fakeWindow(options);
      redirect(['pl', 'en', 'uk'], 'pl', LANG_KEY, win);
      return win.replaced;
    };
    assert.deepEqual(to({ languages: ['de', 'uk-UA'] }), ['uk/']);
    assert.deepEqual(to({ languages: ['en'], saved: 'uk' }), ['uk/']);
    assert.deepEqual(to({ languages: ['en'], saved: 'xx' }), ['en/']);
    assert.deepEqual(to({ languages: ['uk'], throwStorage: true }), ['uk/']);
    assert.deepEqual(to({ languages: null, language: 'en' }), ['en/']);
    assert.deepEqual(to({ languages: null }), ['pl/']);
    assert.deepEqual(to({ languages: ['ja'], search: '?a=1', hash: '#b' }), [
      'pl/?a=1#b',
    ]);
  });

  it('runs the text of an inline script as the page gets it, with the same result', () => {
    const script = inlineScript(
      redirect,
      [['pl', 'en'], 'pl', LANG_KEY],
      ['window'],
    );
    const win = fakeWindow({ languages: ['en-GB'] });
    runInline(script, { window: win });
    assert.deepEqual(win.replaced, ['en/']);

    const doc = fakeDocument();
    assert.equal(doc.documentElement.classList.contains('js'), false);
    runInline(inlineScript(markScripted, [], ['document']), { document: doc });
    assert.equal(doc.documentElement.classList.contains('js'), true);
    assert.deepEqual(doc.documentElement.classList.names(), ['js']);
  });
});
