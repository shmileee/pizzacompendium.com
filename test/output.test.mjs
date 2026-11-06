import assert from 'node:assert/strict';
import nodeFs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { checkOutDir, writeOutput } from '../scripts/lib/output.mjs';
import { capture, codes, view } from './helpers/capture.mjs';
import { failing } from './helpers/fake-fs.mjs';
import { createTree } from './helpers/repo.mjs';

let tree;
let reporter;
let root;
beforeEach(() => {
  tree = createTree();
  tree.write('repo/content/x', '');
  root = tree.path('repo');
  reporter = capture();
});
afterEach(() => tree.cleanup());

const check = (out, fs = nodeFs) =>
  checkOutDir({ fs, root, out: path.resolve(root, out), reporter });

describe('checkOutDir', () => {
  it('accepts a folder that does not exist yet', () => {
    assert.equal(check('dist'), true);
    assert.deepEqual(reporter.entries, []);
  });

  it('accepts an empty folder and a previous build', () => {
    tree.write('repo/empty/.keep', '');
    tree.remove('repo/empty/.keep');
    tree.write('repo/dist/.nojekyll', '');
    tree.write('repo/dist/index.html', 'x');
    assert.equal(check('empty'), true);
    assert.equal(check('dist'), true);
  });

  it('accepts a folder outside the repository', () => {
    assert.equal(check('../elsewhere'), true);
  });

  for (const [name, out] of [
    ['the repository itself', '.'],
    ['the repository with a trailing path', './'],
    ['a folder around the repository', '..'],
    ['the filesystem root', '/'],
    ['content', 'content'],
    ['inside content', 'content/pl'],
    ['static', 'static'],
    ['src', 'src'],
    ['scripts', 'scripts/out'],
    ['node_modules', 'node_modules'],
    ['.git', '.git'],
  ]) {
    it(`refuses ${name}`, () => {
      assert.equal(check(out), false);
      assert.deepEqual(codes(reporter), ['E_OUT_DIR']);
    });
  }

  it('accepts a folder whose name only starts like a kept one', () => {
    assert.equal(check('content-out'), true);
    assert.equal(check('srcs'), true);
  });

  it('refuses a folder that is not empty and not a build output', () => {
    tree.write('repo/mine/notes.txt', 'x');
    assert.equal(check('mine'), false);
    assert.deepEqual(codes(reporter), ['E_OUT_DIR']);
  });

  it('refuses a Git checkout even if it has .nojekyll', () => {
    tree.write('repo/pages/.nojekyll', '');
    tree.write('repo/pages/.git/HEAD', '');
    assert.equal(check('pages'), false);
    assert.deepEqual(codes(reporter), ['E_OUT_DIR']);
  });

  it('refuses a file where a folder should be', () => {
    tree.write('repo/file', 'x');
    assert.equal(check('file'), false);
    assert.deepEqual(codes(reporter), ['E_OUT_DIR']);
  });

  for (const code of ['EACCES', 'EMFILE']) {
    it(`refuses a folder it cannot list (${code})`, () => {
      tree.write('repo/dist/.nojekyll', '');
      const fs = failing(nodeFs, { op: 'readdirSync', code });
      assert.equal(check('dist', fs), false);
      assert.deepEqual(view(reporter), [{ level: 'error', code: 'E_OUT_DIR' }]);
    });
  }
});

describe('writeOutput', () => {
  const write = (
    fs,
    files = [
      ['a.txt', 'A'],
      ['d/b.txt', 'B'],
    ],
    copies = [],
  ) =>
    writeOutput({
      fs,
      out: tree.path('out'),
      files: new Map(files),
      copies,
      reporter,
    });

  it('writes files and copies into a new folder', () => {
    tree.write('src.bin', Buffer.from([1, 2, 3]));
    const ok = write(nodeFs, undefined, [
      { from: tree.path('src.bin'), to: 'img/c.bin' },
    ]);
    assert.equal(ok, true);
    assert.deepEqual(tree.list('out'), ['a.txt', 'd/b.txt', 'img/c.bin']);
    assert.deepEqual(
      [...nodeFs.readFileSync(tree.path('out/img/c.bin'))],
      [1, 2, 3],
    );
    assert.deepEqual(reporter.entries, []);
  });

  it('writes a Buffer as it is', () => {
    write(nodeFs, [['x.bin', Buffer.from([0xff, 0x00])]]);
    assert.deepEqual(
      [...nodeFs.readFileSync(tree.path('out/x.bin'))],
      [0xff, 0],
    );
  });

  it('replaces the previous output and leaves no .tmp or .old', () => {
    tree.write('out/old.txt', 'old');
    assert.equal(write(nodeFs), true);
    assert.deepEqual(tree.list('out'), ['a.txt', 'd/b.txt']);
    assert.equal(tree.exists('out.tmp'), false);
    assert.equal(tree.exists('out.old'), false);
  });

  it('starts from clean .tmp and .old left by a crashed build', () => {
    tree.write('out.tmp/stale', 'x');
    tree.write('out.old/stale', 'x');
    assert.equal(write(nodeFs), true);
    assert.deepEqual(tree.list('out'), ['a.txt', 'd/b.txt']);
    assert.equal(tree.exists('out.tmp'), false);
    assert.equal(tree.exists('out.old'), false);
  });

  const failures = [
    ['writing a file', { op: 'writeFileSync', match: 'b.txt' }],
    ['creating a folder', { op: 'mkdirSync', match: '/d' }],
    ['copying', { op: 'copyFileSync' }],
  ];
  for (const [name, rule] of failures) {
    it(`leaves the previous output intact when ${name} fails`, () => {
      tree.write('src.bin', 'x');
      tree.write('out/old.txt', 'old');
      const fs = failing(nodeFs, { ...rule, code: 'ENOSPC' });
      const ok = write(fs, undefined, [
        { from: tree.path('src.bin'), to: 'c.bin' },
      ]);
      assert.equal(ok, false);
      assert.deepEqual(view(reporter), [
        { level: 'error', code: 'E_WRITE', file: tree.path('out') },
      ]);
      assert.deepEqual(tree.list('out'), ['old.txt']);
      assert.equal(tree.read('out/old.txt'), 'old');
      assert.equal(tree.exists('out.tmp'), false);
    });
  }

  it('fails cleanly when there was no previous output', () => {
    const fs = failing(nodeFs, { op: 'writeFileSync', code: 'EACCES' });
    assert.equal(write(fs), false);
    assert.equal(tree.exists('out'), false);
    assert.equal(tree.exists('out.tmp'), false);
  });

  it('puts the old output back when the final rename fails', () => {
    tree.write('out/old.txt', 'old');
    const fs = failing(nodeFs, {
      op: 'renameSync',
      match: (from) => from.endsWith('out.tmp'),
    });
    assert.equal(write(fs), false);
    assert.equal(tree.read('out/old.txt'), 'old');
    assert.equal(tree.exists('out.old'), false);
    assert.equal(tree.exists('out.tmp'), false);
  });

  it('does not move anything back when moving the old output aside fails', () => {
    tree.write('out/old.txt', 'old');
    const fs = failing(nodeFs, {
      op: 'renameSync',
      match: (from) => from.endsWith('/out'),
    });
    assert.equal(write(fs), false);
    assert.equal(tree.read('out/old.txt'), 'old');
    assert.equal(tree.exists('out.tmp'), false);
    assert.equal(tree.exists('out.old'), false);
  });

  it('reports that the previous output is in .old when it cannot be put back', () => {
    tree.write('out/old.txt', 'old');
    const fs = failing(nodeFs, [
      { op: 'renameSync', match: (from) => from.endsWith('out.tmp') },
      {
        op: 'renameSync',
        match: (from) => from.endsWith('out.old'),
        code: 'EBUSY',
      },
    ]);
    assert.equal(write(fs), false);
    assert.deepEqual(codes(reporter), ['E_WRITE', 'E_WRITE']);
    assert.match(reporter.entries[1].message, /out\.old/);
    assert.match(reporter.entries[1].message, /EBUSY/);
    assert.equal(tree.read('out.old/old.txt'), 'old');
  });

  it('reports when the temporary folder cannot be removed after a failure', () => {
    const fs = failing(nodeFs, [
      { op: 'writeFileSync', match: 'a.txt' },
      { op: 'rmSync', after: 2 },
    ]);
    assert.equal(write(fs), false);
    assert.deepEqual(codes(reporter), ['E_WRITE', 'E_WRITE']);
  });
});
