import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { LANG_KEY as INLINE_LANG_KEY } from '../../scripts/lib/inline-scripts.mjs';
import {
  byFragment,
  debounce,
  foldText,
  fragmentId,
  LANG_KEY,
  query,
  queryAll,
  storage,
  THEME_KEY,
} from '../../src/js/util.js';
import { fakeStorage } from '../helpers/browser.mjs';

describe('storage keys', () => {
  it('uses the key the inline scripts read', () => {
    assert.equal(LANG_KEY, INLINE_LANG_KEY);
    assert.notEqual(THEME_KEY, LANG_KEY);
  });
});

describe('query and queryAll', () => {
  const root = {
    querySelector: (selector) => (selector === '.a' ? 'one' : null),
    querySelectorAll: (selector) => new Set([selector, 'two']),
  };

  it('returns the first match or null', () => {
    assert.equal(query('.a', root), 'one');
    assert.equal(query('.b', root), null);
  });

  it('returns every match as a real array', () => {
    const all = queryAll('.a', root);
    assert.ok(Array.isArray(all));
    assert.deepEqual(all, ['.a', 'two']);
  });

  it('searches the document when no root is given', () => {
    const before = globalThis.document;
    globalThis.document = root;
    try {
      assert.equal(query('.a'), 'one');
      assert.deepEqual(queryAll('.x'), ['.x', 'two']);
    } finally {
      globalThis.document = before;
    }
  });
});

describe('storage', () => {
  let before;
  beforeEach(() => {
    before = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  });
  afterEach(() => {
    if (before) Object.defineProperty(globalThis, 'localStorage', before);
    else delete globalThis.localStorage;
  });
  const use = (value) =>
    Object.defineProperty(globalThis, 'localStorage', {
      value,
      configurable: true,
      writable: true,
    });

  it('reads and writes localStorage', () => {
    const fake = fakeStorage();
    use(fake);
    assert.equal(storage.get('k'), null);
    storage.set('k', 'v');
    assert.equal(storage.get('k'), 'v');
    assert.deepEqual(fake.dump(), { k: 'v' });
  });

  it('reads null and keeps quiet where storage is blocked', () => {
    use(fakeStorage({ throws: true }));
    assert.equal(storage.get('k'), null);
    assert.doesNotThrow(() => storage.set('k', 'v'));
  });

  it('survives a missing localStorage', () => {
    use(undefined);
    assert.equal(storage.get('k'), null);
    assert.doesNotThrow(() => storage.set('k', 'v'));
  });
});

describe('debounce', () => {
  beforeEach(() => mock.timers.enable({ apis: ['setTimeout'] }));
  afterEach(() => mock.timers.reset());

  it('runs once, ms after the last call, with the last arguments', () => {
    const calls = [];
    const run = debounce((...args) => calls.push(args), 100);
    run(1);
    mock.timers.tick(99);
    run(2, 'x');
    mock.timers.tick(99);
    assert.deepEqual(calls, []);
    mock.timers.tick(1);
    assert.deepEqual(calls, [[2, 'x']]);
    mock.timers.tick(1000);
    assert.equal(calls.length, 1);
  });

  it('runs again for a call after the quiet time', () => {
    const calls = [];
    const run = debounce((n) => calls.push(n), 10);
    run(1);
    mock.timers.tick(10);
    run(2);
    mock.timers.tick(10);
    assert.deepEqual(calls, [1, 2]);
  });
});

describe('fragmentId', () => {
  it('drops the hash and decodes it', () => {
    assert.equal(fragmentId('#faq-stone'), 'faq-stone');
    assert.equal(fragmentId('#m%C4%85ka'), 'mąka');
  });

  it('is empty for no fragment or broken encoding', () => {
    assert.equal(fragmentId(''), '');
    assert.equal(fragmentId('#'), '');
    assert.equal(fragmentId('#%E0%A4%A'), '');
  });
});

describe('byFragment', () => {
  it('looks the decoded id up', () => {
    const root = { getElementById: (id) => ({ id }) };
    assert.deepEqual(byFragment(root, '#a%20b'), { id: 'a b' });
  });

  it('asks for an empty id when the hash is broken', () => {
    const asked = [];
    const root = { getElementById: (id) => (asked.push(id), null) };
    assert.equal(byFragment(root, '#%zz'), null);
    assert.deepEqual(asked, ['']);
  });
});

describe('foldText', () => {
  it('lower-cases and strips accents of Latin letters', () => {
    assert.equal(foldText('Mąka Żytnia'), 'maka zytnia');
    assert.equal(foldText('Crème Brûlée'), 'creme brulee');
  });

  it('maps letters that have no decomposition', () => {
    assert.equal(foldText('Łódź'), 'lodz');
    assert.equal(foldText('Øl đ ß æ œ'), 'ol d ss ae oe');
  });

  it('keeps the marks of Cyrillic letters', () => {
    assert.equal(foldText('Йод'), 'йод');
    assert.equal(foldText('Їжа'), 'їжа');
  });

  it('makes every apostrophe a typewriter one', () => {
    assert.equal(foldText('м’ясо ʼ ‘ ` ´'), "м'ясо ' ' ' '");
  });

  it('collapses white space, no-break spaces included, and trims', () => {
    assert.equal(foldText('  a  \n\tb  '), 'a b');
    assert.equal(foldText(''), '');
  });

  it('gives the same result for composed and decomposed input', () => {
    assert.equal(foldText('ą'), foldText('ą'));
  });
});
