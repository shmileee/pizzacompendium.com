import assert from 'node:assert/strict';
import nodeFs from 'node:fs';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  byName,
  exists,
  isObject,
  MAX_TEXT_BYTES,
  normalise,
  readDir,
  readJson,
  readText,
} from '../scripts/lib/files.mjs';
import { capture, view } from './helpers/capture.mjs';
import { failing } from './helpers/fake-fs.mjs';
import { createTree } from './helpers/repo.mjs';

let tree;
let reporter;
beforeEach(() => {
  tree = createTree();
  reporter = capture();
});
afterEach(() => tree.cleanup());

const read = (rel, fs) => readText({ fs, root: tree.root, rel, reporter });

describe('isObject', () => {
  it('accepts plain objects only', () => {
    assert.equal(isObject({}), true);
    assert.equal(isObject(null), false);
    assert.equal(isObject([]), false);
    assert.equal(isObject('x'), false);
    assert.equal(isObject(1), false);
  });
});

describe('byName', () => {
  it('orders by name, independent of locale', () => {
    const names = ['b', 'B', 'a', 'é', 'Z'].map((name) => ({ name }));
    assert.deepEqual(
      names.sort(byName).map((entry) => entry.name),
      ['B', 'Z', 'a', 'b', 'é'],
    );
    assert.equal(byName({ name: 'a' }, { name: 'a' }), 0);
  });
});

describe('normalise', () => {
  it('drops a byte-order mark and unifies line endings', () => {
    assert.equal(normalise('﻿a\r\nb\rc\n'), 'a\nb\nc\n');
  });

  it('keeps a mark that is not at the start', () => {
    assert.equal(normalise('a﻿b'), 'a﻿b');
  });
});

describe('exists', () => {
  it('is true for a file and for a dangling link, false for nothing', () => {
    tree.write('f', 'x');
    tree.symlink('dangling', 'nowhere');
    assert.equal(exists(nodeFs, tree.path('f')), true);
    assert.equal(exists(nodeFs, tree.path('dangling')), true);
    assert.equal(exists(nodeFs, tree.path('none')), false);
  });
});

describe('MAX_TEXT_BYTES', () => {
  it('is one mebibyte', () => {
    assert.equal(MAX_TEXT_BYTES, 1048576);
  });
});

describe('readText', () => {
  it('reads a file as normalised text', () => {
    tree.write('a.txt', '﻿x\r\ny');
    assert.equal(read('a.txt'), 'x\ny');
    assert.deepEqual(reporter.entries, []);
  });

  it('strips one byte order mark, as the decoder keeps both', () => {
    tree.write('bom.txt', '\uFEFF\uFEFFa');
    assert.equal(read('bom.txt'), '\uFEFFa');
  });

  it('refuses a symbolic link, even to a good file', () => {
    tree.write('real.txt', 'x');
    tree.symlink('link.txt', 'real.txt');
    assert.equal(read('link.txt'), null);
    assert.deepEqual(view(reporter), [
      { level: 'error', code: 'E_NOT_REGULAR', file: 'link.txt' },
    ]);
  });

  it('refuses a folder', () => {
    tree.write('d/x', 'x');
    assert.equal(read('d'), null);
    assert.equal(reporter.entries[0].code, 'E_NOT_REGULAR');
  });

  it('refuses a FIFO without opening it', () => {
    const fs = {
      ...nodeFs,
      lstatSync: () => ({ isFile: () => false, size: 0 }),
      readFileSync: () => assert.fail('must not read'),
    };
    assert.equal(read('pipe', fs), null);
    assert.equal(reporter.entries[0].code, 'E_NOT_REGULAR');
  });

  it('refuses a file over the limit before reading it', () => {
    const fs = {
      ...nodeFs,
      lstatSync: () => ({ isFile: () => true, size: MAX_TEXT_BYTES + 1 }),
      readFileSync: () => assert.fail('must not read'),
    };
    assert.equal(read('big', fs), null);
    assert.equal(reporter.entries[0].code, 'E_TOO_LARGE');
  });

  it('accepts a file of exactly the limit', () => {
    tree.write('max.txt', 'a'.repeat(MAX_TEXT_BYTES));
    assert.equal(read('max.txt').length, MAX_TEXT_BYTES);
  });

  it('reports invalid UTF-8', () => {
    tree.write('bad.txt', Buffer.from([0x61, 0xff, 0xfe]));
    assert.equal(read('bad.txt'), null);
    assert.equal(reporter.entries[0].code, 'E_ENCODING');
  });

  for (const code of ['ENOENT', 'EACCES', 'EISDIR', 'EMFILE']) {
    it(`reports E_READ, not an exception, for ${code} on read`, () => {
      tree.write('a.txt', 'x');
      const fs = failing(nodeFs, { op: 'readFileSync', code });
      assert.equal(read('a.txt', fs), null);
      assert.deepEqual(view(reporter), [
        { level: 'error', code: 'E_READ', file: 'a.txt' },
      ]);
      assert.match(reporter.entries[0].message, new RegExp(code));
    });
  }

  it('reports E_READ for a file that does not exist', () => {
    assert.equal(read('none.txt'), null);
    assert.equal(reporter.entries[0].code, 'E_READ');
  });

  it('reports E_READ when lstat fails', () => {
    tree.write('a.txt', 'x');
    const fs = failing(nodeFs, { op: 'lstatSync', code: 'EACCES' });
    assert.equal(read('a.txt', fs), null);
    assert.equal(reporter.entries[0].code, 'E_READ');
  });
});

describe('readJson', () => {
  const json = (rel, fs) => readJson({ fs, root: tree.root, rel, reporter });

  it('parses JSON, including null', () => {
    tree.write('a.json', { a: 1 });
    tree.write('n.json', 'null');
    assert.deepEqual(json('a.json'), { a: 1 });
    assert.equal(json('n.json'), null);
  });

  it('reports E_JSON for invalid JSON and returns undefined', () => {
    tree.write('a.json', '{ nope');
    assert.equal(json('a.json'), undefined);
    assert.deepEqual(view(reporter), [
      { level: 'error', code: 'E_JSON', file: 'a.json' },
    ]);
  });

  it('returns undefined with the read error when unreadable', () => {
    assert.equal(json('missing.json'), undefined);
    assert.deepEqual(codesOf(reporter), ['E_READ']);
  });
});

const codesOf = (r) => r.entries.map((entry) => entry.code);

describe('readDir', () => {
  const dir = (rel, fs) => readDir({ fs, root: tree.root, rel, reporter });

  it('lists entries sorted by name', () => {
    tree.write('d/b', '');
    tree.write('d/a', '');
    tree.write('d/c/x', '');
    const entries = dir('d');
    assert.deepEqual(
      entries.map((entry) => entry.name),
      ['a', 'b', 'c'],
    );
    assert.equal(entries[2].isDirectory(), true);
  });

  it('refuses a folder that is a symbolic link', () => {
    tree.write('real/x', '');
    tree.symlink('link', 'real');
    assert.equal(dir('link'), null);
    assert.deepEqual(view(reporter), [
      { level: 'error', code: 'E_SYMLINK', file: 'link' },
    ]);
  });

  it('reports E_READ for a missing folder', () => {
    assert.equal(dir('none'), null);
    assert.deepEqual(view(reporter), [
      { level: 'error', code: 'E_READ', file: 'none' },
    ]);
  });

  it('reports E_READ when listing fails', () => {
    tree.write('d/x', '');
    const fs = failing(nodeFs, { op: 'readdirSync', code: 'EMFILE' });
    assert.equal(dir('d', fs), null);
    assert.match(reporter.entries[0].message, /EMFILE/);
  });
});
