import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import nodeFs from 'node:fs';
import { describe, it } from 'node:test';
import {
  assetUrl,
  buildAssets,
  collectStatic,
  fontsFor,
  storageKeyMismatches,
} from '../scripts/lib/assets.mjs';
import { capture, codes, view } from './helpers/capture.mjs';
import { failing } from './helpers/fake-fs.mjs';
import { withRepo, withTree } from './helpers/repo.mjs';

const sha8 = (text) =>
  createHash('sha256').update(text).digest('hex').slice(0, 8);

describe('fontsFor', () => {
  it('picks the font of the script of the text', () => {
    assert.deepEqual(fontsFor('Pizza'), ['fonts/vollkorn-latin.woff2']);
    assert.deepEqual(fontsFor('Піца'), ['fonts/vollkorn-cyrillic.woff2']);
    assert.deepEqual(fontsFor('Піца Pizza'), [
      'fonts/vollkorn-latin.woff2',
      'fonts/vollkorn-cyrillic.woff2',
    ]);
  });

  it('picks none for text of another script', () => {
    assert.deepEqual(fontsFor('ピザ 123'), []);
  });
});

describe('storageKeyMismatches', () => {
  const keys = { LANG_KEY: 'a-lang', THEME_KEY: 'a-theme' };

  it('is empty when a script defines each key, in either quote', () => {
    assert.deepEqual(
      storageKeyMismatches(
        ["export const LANG_KEY = 'a-lang';", 'const THEME_KEY = "a-theme";'],
        keys,
      ),
      [],
    );
  });

  it('names a key no script defines', () => {
    assert.deepEqual(
      storageKeyMismatches(["const LANG_KEY = 'a-lang';"], keys),
      ['THEME_KEY'],
    );
    assert.deepEqual(storageKeyMismatches([], keys), ['LANG_KEY', 'THEME_KEY']);
  });

  it('names a key defined with another value', () => {
    assert.deepEqual(
      storageKeyMismatches(
        ["const LANG_KEY = 'other';", "const THEME_KEY = 'a-theme';"],
        keys,
      ),
      ['LANG_KEY'],
    );
  });

  it('does not take a mixed-quote definition', () => {
    assert.deepEqual(
      storageKeyMismatches(['const LANG_KEY = \'a-lang";'], {
        LANG_KEY: 'a-lang',
      }),
      ['LANG_KEY'],
    );
  });
});

describe('assetUrl', () => {
  it('adds the fingerprint when there is one', () => {
    assert.equal(
      assetUrl('../', { path: 'assets/a.js', v: 'abc' }),
      '../assets/a.js?v=abc',
    );
  });

  it('adds nothing when there is none', () => {
    assert.equal(assetUrl('', { path: 'assets/a.js', v: null }), 'assets/a.js');
  });
});

describe('collectStatic', () => {
  const collect = (tree, fs) => {
    const reporter = capture();
    const copies = collectStatic({ fs, root: tree.root, reporter });
    return { copies, reporter };
  };

  it('lists allowed files, sorted, with source and target', async () => {
    await withTree((tree) => {
      for (const file of [
        'img/b.WEBP',
        'img/a.png',
        'img/c.jpeg',
        'img/d.jpg',
        'img/e.gif',
        'img/f.avif',
        'fonts/x.woff2',
        'fonts/LICENSE.txt',
        'favicon.ico',
        'CNAME',
        'sub/CNAME',
        'm.webmanifest',
      ])
        tree.write(`static/${file}`, 'x');
      const { copies, reporter } = collect(tree);
      assert.deepEqual(reporter.entries, []);
      assert.deepEqual(
        copies.map((c) => c.to),
        [
          'CNAME',
          'favicon.ico',
          'fonts/LICENSE.txt',
          'fonts/x.woff2',
          'img/a.png',
          'img/b.WEBP',
          'img/c.jpeg',
          'img/d.jpg',
          'img/e.gif',
          'img/f.avif',
          'm.webmanifest',
          'sub/CNAME',
        ],
      );
      assert.equal(copies[0].from, tree.path('static/CNAME'));
    });
  });

  for (const file of [
    'x.html',
    'x.htm',
    'x.svg',
    'x.js',
    'x.mjs',
    'x.css',
    'x.xml',
    'x.json',
    'x.pdf',
    'noext',
    'MYCNAME',
    'x.webp.html',
    'img/x.SVG',
  ]) {
    it(`refuses ${file} with E_STATIC_TYPE`, async () => {
      await withTree((tree) => {
        tree.write(`static/${file}`, 'x');
        const { reporter } = collect(tree);
        assert.deepEqual(view(reporter), [
          { level: 'error', code: 'E_STATIC_TYPE', file: `static/${file}` },
        ]);
      });
    });
  }

  it('skips dotfiles, junk and editor leftovers', async () => {
    await withTree((tree) => {
      for (const file of [
        '.DS_Store',
        '.hidden/a.png',
        'Thumbs.db',
        'desktop.ini',
        'img/a.png~',
        'img/.x',
      ])
        tree.write(`static/${file}`, 'x');
      tree.write('static/img/ok.png', 'x');
      const { copies, reporter } = collect(tree);
      assert.deepEqual(
        copies.map((c) => c.to),
        ['img/ok.png'],
      );
      assert.deepEqual(reporter.entries, []);
    });
  });

  it('refuses a symbolic link, to a file and to a folder', async () => {
    await withTree((tree) => {
      tree.write('outside/a.png', 'x');
      tree.write('static/ok.png', 'x');
      tree.symlink('static/link.png', '../outside/a.png');
      tree.symlink('static/linkdir', '../outside');
      const { reporter } = collect(tree);
      assert.deepEqual(view(reporter), [
        { level: 'error', code: 'E_SYMLINK', file: 'static/link.png' },
        { level: 'error', code: 'E_SYMLINK', file: 'static/linkdir' },
      ]);
    });
  });

  it('refuses a static folder that is itself a link', async () => {
    await withTree((tree) => {
      tree.write('elsewhere/a.png', 'x');
      tree.symlink('static', 'elsewhere');
      const { copies, reporter } = collect(tree);
      assert.deepEqual(copies, []);
      assert.deepEqual(codes(reporter), ['E_SYMLINK']);
    });
  });

  it('refuses a special file', async () => {
    await withTree((tree) => {
      tree.write('static/ok.png', 'x');
      const fs = {
        ...nodeFs,
        readdirSync: (dir, options) => {
          const entries = nodeFs.readdirSync(dir, options);
          return entries.map((entry) =>
            entry.name === 'ok.png'
              ? Object.assign(Object.create(entry), {
                  isFile: () => false,
                  isDirectory: () => false,
                  isSymbolicLink: () => false,
                })
              : entry,
          );
        },
      };
      const { reporter } = collect(tree, fs);
      assert.deepEqual(view(reporter), [
        { level: 'error', code: 'E_NOT_REGULAR', file: 'static/ok.png' },
      ]);
    });
  });

  it('reports an unreadable sub-folder and goes on', async () => {
    await withTree((tree) => {
      tree.write('static/a/x.png', 'x');
      tree.write('static/b.png', 'x');
      const fs = failing(nodeFs, {
        op: 'readdirSync',
        match: /static\/a$/,
        code: 'EACCES',
      });
      const { copies, reporter } = collect(tree, fs);
      assert.deepEqual(
        copies.map((c) => c.to),
        ['b.png'],
      );
      assert.deepEqual(codes(reporter), ['E_READ']);
    });
  });

  it('reports a missing static folder', async () => {
    await withTree((tree) => {
      const { copies, reporter } = collect(tree);
      assert.deepEqual(copies, []);
      assert.deepEqual(codes(reporter), ['E_READ']);
    });
  });
});

describe('buildAssets', () => {
  const build = (repo, { fingerprint = true, fs } = {}) => {
    const reporter = capture();
    const assets = buildAssets({ fs, root: repo.root, fingerprint, reporter });
    return { assets, reporter };
  };
  const files = {
    'src/app.js':
      "import { a } from './util.js';\nexport const LANG_KEY = 'k';\n",
    'src/util.js': 'export const a = 1;\n',
    'src/css/10-b.css': 'b{}',
    'src/css/05-a.css': 'a{}',
    'src/favicon.svg': '<svg></svg>',
  };
  const fresh = () => ({
    'src/app.js': null,
    'src/css/00-test.css': null,
    ...files,
  });

  it('concatenates the stylesheets in file name order', async () => {
    await withRepo(fresh(), (repo) => {
      const { assets, reporter } = build(repo);
      assert.deepEqual(reporter.entries, []);
      assert.equal(assets.files.get('assets/style.css'), 'a{}\nb{}');
    });
  });

  it('copies scripts with their paths and the favicon', async () => {
    await withRepo(fresh(), (repo) => {
      const { assets } = build(repo, { fingerprint: false });
      assert.deepEqual([...assets.files.keys()].sort(), [
        'assets/app.js',
        'assets/style.css',
        'assets/util.js',
        'favicon.svg',
      ]);
      assert.equal(assets.files.get('favicon.svg').toString(), '<svg></svg>');
    });
  });

  it('without fingerprint keeps scripts byte for byte and has no versions', async () => {
    await withRepo(fresh(), (repo) => {
      const { assets } = build(repo, { fingerprint: false });
      assert.equal(assets.files.get('assets/app.js'), files['src/app.js']);
      assert.deepEqual(assets.css, { path: 'assets/style.css', v: null });
      assert.deepEqual(assets.js, { path: 'assets/app.js', v: null });
      assert.deepEqual(assets.modules, [{ path: 'assets/util.js', v: null }]);
    });
  });

  it('fingerprints: versions are 8 hex chars of the content', async () => {
    await withRepo(fresh(), (repo) => {
      const { assets } = build(repo);
      const v = sha8(files['src/app.js'] + files['src/util.js']);
      assert.deepEqual(assets.css, {
        path: 'assets/style.css',
        v: sha8('a{}\nb{}'),
      });
      assert.deepEqual(assets.js, { path: 'assets/app.js', v });
      assert.deepEqual(assets.modules, [{ path: 'assets/util.js', v }]);
    });
  });

  it('fingerprints the relative imports so modules are fetched again', async () => {
    const source = [
      "import { a } from './a.js';",
      'import b from "../b.js";',
      "import './side.js';",
      "export { c } from './c.js';",
      "export * from './d.js';",
      "import { e,\n  f } from './multi.js';",
      "const lazy = import('./lazy.js');",
      "import x from 'https://x.test/a.js';",
      "import y from 'bare';",
      "import z from '/abs.js';",
      "const s = 'from ./not.js';",
    ].join('\n');
    await withRepo({ ...fresh(), 'src/app.js': source }, (repo) => {
      const { assets } = build(repo);
      const v = assets.js.v;
      const out = assets.files.get('assets/app.js');
      for (const path of [
        './a.js',
        '../b.js',
        './side.js',
        './c.js',
        './d.js',
        './multi.js',
        './lazy.js',
      ])
        assert.ok(out.includes(`${path}?v=${v}`), path);
      assert.ok(out.includes("'https://x.test/a.js'"));
      assert.ok(out.includes("'bare'"));
      assert.ok(out.includes("'/abs.js'"));
      assert.ok(out.includes("'from ./not.js'"));
      assert.equal(out.match(/\?v=/g).length, 7);
      assert.equal(v, sha8(source + files['src/util.js']));
    });
  });

  it('keeps the quote style of an import', async () => {
    await withRepo(
      {
        ...fresh(),
        'src/app.js': 'import a from "./a.js";\nimport b from \'./b.js\';',
      },
      (repo) => {
        const out = build(repo).assets.files.get('assets/app.js');
        assert.match(out, /"\.\/a\.js\?v=[0-9a-f]{8}"/);
        assert.match(out, /'\.\/b\.js\?v=[0-9a-f]{8}'/);
      },
    );
  });

  it('changes the version when a module changes', async () => {
    await withRepo(fresh(), (repo) => {
      const before = build(repo).assets.js.v;
      repo.write('src/util.js', 'export const a = 2;\n');
      assert.notEqual(build(repo).assets.js.v, before);
    });
  });

  it('walks nested folders', async () => {
    await withRepo(
      { ...fresh(), 'src/js/deep/m.js': 'export {};\n' },
      (repo) => {
        const { assets } = build(repo, { fingerprint: false });
        assert.ok(assets.files.has('assets/js/deep/m.js'));
        assert.ok(assets.modules.some((m) => m.path === 'assets/js/deep/m.js'));
      },
    );
  });

  it('ignores dotfiles and files of other types', async () => {
    await withRepo(
      { ...fresh(), 'src/.hidden.js': 'x', 'src/notes.txt': 'x' },
      (repo) => {
        const { assets } = build(repo, { fingerprint: false });
        assert.equal(assets.files.has('assets/.hidden.js'), false);
        assert.equal(assets.files.size, 4);
      },
    );
  });

  for (const [missing, what] of [
    ['src/app.js', 'the entry script'],
    ['src/favicon.svg', 'the favicon'],
    ['src/css/05-a.css', undefined],
  ]) {
    it(`reports E_ASSET when ${what ?? 'one stylesheet'} is missing`, async () => {
      await withRepo({ ...fresh(), [missing]: null }, (repo) => {
        if (what === undefined) repo.remove('src/css/10-b.css');
        const { reporter } = build(repo);
        assert.deepEqual(view(reporter), [
          { level: 'error', code: 'E_ASSET', file: 'src' },
        ]);
      });
    });
  }

  it('reports E_ASSET once per missing piece', async () => {
    await withRepo(
      { ...fresh(), 'src/app.js': null, 'src/favicon.svg': null },
      (repo) => {
        assert.deepEqual(codes(build(repo).reporter), ['E_ASSET', 'E_ASSET']);
      },
    );
  });

  it('does not take an entry script from a sub-folder as the entry', async () => {
    await withRepo(
      { ...fresh(), 'src/app.js': null, 'src/x/app.js': '' },
      (repo) => {
        assert.deepEqual(codes(build(repo).reporter), ['E_ASSET']);
      },
    );
  });

  it('reports E_READ, not an exception, for an unreadable source', async () => {
    await withRepo(fresh(), (repo) => {
      for (const file of [
        'src/css/05-a.css',
        'src/util.js',
        'src/favicon.svg',
      ]) {
        const fs = failing(nodeFs, {
          op: 'readFileSync',
          match: file,
          code: 'EACCES',
        });
        const { reporter } = build(repo, { fs });
        assert.deepEqual(view(reporter), [
          { level: 'error', code: 'E_READ', file },
        ]);
      }
    });
  });

  it('reports a symbolic link in src', async () => {
    await withRepo(fresh(), (repo) => {
      repo.write('outside.js', 'x');
      repo.symlink('src/link.js', '../outside.js');
      assert.deepEqual(view(build(repo).reporter), [
        { level: 'error', code: 'E_SYMLINK', file: 'src/link.js' },
      ]);
    });
  });
});
