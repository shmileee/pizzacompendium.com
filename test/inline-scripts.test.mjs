import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyTheme,
  inlineScript,
  LANG_KEY,
  markScripted,
  redirect,
  THEME_KEY,
  themeScript,
} from '../scripts/lib/inline-scripts.mjs';
import {
  fakeDocument,
  fakeStorage,
  fakeWindow,
  runInline,
} from './helpers/browser.mjs';

const CODES = ['pl', 'en', 'uk', 'pt-BR'];

describe('storage keys', () => {
  it('are the names the client code uses', () => {
    assert.equal(LANG_KEY, 'pizzacompendium-lang');
    assert.equal(THEME_KEY, 'pizzacompendium-theme');
  });
});

describe('inlineScript', () => {
  it('calls the function with JSON arguments and then the globals', () => {
    function f(_a, _b, _w) {}
    assert.equal(
      inlineScript(f, [['x', 'y'], 'q"'], ['window']),
      `(${f})(["x","y"], "q\\"", window)`,
    );
  });

  it('separates two arguments and two globals with a comma and a space', () => {
    function f(_a, _b, _c, _d) {}
    assert.equal(
      inlineScript(f, [1, 'a'], ['window', 'document']),
      `(${f})(1, "a", window, document)`,
    );
  });

  it('defaults to no arguments', () => {
    assert.match(
      inlineScript(function f() {}),
      /\)\(\)$/,
    );
  });

  it('has \\n line endings whatever the function source has', () => {
    const f = Object.assign(() => {}, {
      toString: () => 'function f() {\r\n  return 1;\r\r}',
    });
    assert.equal(inlineScript(f), '(function f() {\n  return 1;\n\n})()');
  });

  it('never holds what could end an inline script', () => {
    for (const script of [
      inlineScript(redirect, [CODES, 'pl', LANG_KEY], ['window']),
      inlineScript(markScripted, [], ['document']),
      themeScript(),
    ])
      assert.doesNotMatch(script, /<\/script|<!--/i);
  });
});

describe('markScripted', () => {
  it('adds the js class to <html>', () => {
    const doc = fakeDocument();
    markScripted(doc);
    assert.deepEqual(doc.documentElement.classList.names(), ['js']);
  });

  it('does the same as its emitted text', () => {
    const doc = fakeDocument();
    runInline(inlineScript(markScripted, [], ['document']), { document: doc });
    assert.equal(doc.documentElement.classList.contains('js'), true);
  });
});

describe('applyTheme', () => {
  const apply = (saved, throwStorage = false) => {
    const dataset = {};
    const win = {
      localStorage: fakeStorage({
        items: saved === null ? {} : { [THEME_KEY]: saved },
        throws: throwStorage,
      }),
      document: { documentElement: { dataset } },
    };
    applyTheme(THEME_KEY, win);
    return dataset.theme;
  };

  it('sets data-theme for light and dark', () => {
    assert.equal(apply('light'), 'light');
    assert.equal(apply('dark'), 'dark');
  });

  it('leaves the system in charge for anything else', () => {
    assert.equal(apply(null), undefined);
    assert.equal(apply('auto'), undefined);
    assert.equal(apply('<b>'), undefined);
  });

  it('survives blocked storage', () => {
    assert.equal(apply(null, true), undefined);
  });

  it('reads the key it is given', () => {
    const win = {
      localStorage: fakeStorage({ items: { other: 'dark' } }),
      document: { documentElement: { dataset: {} } },
    };
    applyTheme('other', win);
    assert.equal(win.document.documentElement.dataset.theme, 'dark');
  });
});

describe('themeScript', () => {
  it('applies the stored theme when run as text', () => {
    const win = fakeWindow({});
    win.localStorage.setItem(THEME_KEY, 'dark');
    win.document = { documentElement: { dataset: {} } };
    runInline(themeScript(), { window: win });
    assert.equal(win.document.documentElement.dataset.theme, 'dark');
  });
});

describe('redirect with capitals in subtags', () => {
  it('picks the exact script subtag, not the first of the base', () => {
    const win = fakeWindow({ languages: ['zh-hant'] });
    redirect(['zh-Hans', 'zh-Hant'], 'zh-Hans', LANG_KEY, win);
    assert.deepEqual(win.replaced, ['zh-Hant/']);
  });
});

describe('redirect', () => {
  const direct = (options) => {
    const win = fakeWindow(options);
    redirect(CODES, 'pl', LANG_KEY, win);
    return win.replaced;
  };
  const emitted = (options) => {
    const win = fakeWindow(options);
    runInline(inlineScript(redirect, [CODES, 'pl', LANG_KEY], ['window']), {
      window: win,
    });
    return win.replaced;
  };
  const cases = [
    ['pl-PL', { languages: ['pl-PL'] }, 'pl/'],
    ['en-GB then en', { languages: ['en-GB', 'en'] }, 'en/'],
    [
      'the first browser language with a page',
      { languages: ['de', 'uk-UA'] },
      'uk/',
    ],
    ['pt-BR exactly', { languages: ['pt-BR'] }, 'pt-BR/'],
    ['pt-br in lower case', { languages: ['pt-br'] }, 'pt-BR/'],
    [
      'pt-PT falls to the only Portuguese page',
      { languages: ['pt-PT'] },
      'pt-BR/',
    ],
    ['a saved language wins', { languages: ['en'], saved: 'pt-BR' }, 'pt-BR/'],
    [
      'an unknown saved language is ignored',
      { languages: ['en'], saved: 'xx' },
      'en/',
    ],
    [
      'a saved language in the wrong case is ignored',
      { languages: ['en'], saved: 'PL' },
      'en/',
    ],
    ['blocked storage', { languages: ['uk'], throwStorage: true }, 'uk/'],
    ['no languages at all', { languages: null }, 'pl/'],
    ['navigator.language only', { languages: null, language: 'uk' }, 'uk/'],
    ['no language of any kind and empty tag', { languages: [] }, 'pl/'],
    ['nothing matches: the fallback', { languages: ['ja', 'zh-CN'] }, 'pl/'],
    [
      'the hash comes along',
      { languages: ['en'], hash: '#faq-stone' },
      'en/#faq-stone',
    ],
    [
      'query and hash come along',
      { languages: ['en'], search: '?u=1', hash: '#a' },
      'en/?u=1#a',
    ],
  ];
  for (const [name, options, want] of cases) {
    it(`${name}: ${want}`, () => {
      assert.deepEqual(direct(options), [want]);
      assert.deepEqual(emitted(options), [want], 'the emitted text agrees');
    });
  }

  it('redirects exactly once', () => {
    assert.equal(direct({ languages: ['en', 'uk'] }).length, 1);
  });

  it('falls back when navigator has neither languages nor language', () => {
    const win = fakeWindow({ languages: null });
    redirect(CODES, 'en', LANG_KEY, win);
    assert.deepEqual(win.replaced, ['en/']);
  });
});
