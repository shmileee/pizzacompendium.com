import assert from 'node:assert/strict';
import nodeFs from 'node:fs';
import { describe, it } from 'node:test';
import {
  checkLanguage,
  LANG_CODE,
  loadLanguages,
  mergedUi,
  published,
  RESERVED_CODES,
} from '../scripts/lib/languages.mjs';
import { capture, codes, find, findAll, view } from './helpers/capture.mjs';
import { failing } from './helpers/fake-fs.mjs';
import { langJson, withRepo, withTree } from './helpers/repo.mjs';

/** As the file would be read: `undefined` fields and ui keys are gone. */
const lj = (code, patch) => JSON.parse(JSON.stringify(langJson(code, patch)));
const check = (code, patch) => checkLanguage(code, lj(code, patch));
const fieldsOf = (code, data) =>
  checkLanguage(code, data).problems.map((problem) => problem.field);
const REQUIRED = [
  'toc',
  'language',
  'skip',
  'top',
  'expandAll',
  'collapseAll',
  'tip',
  'warning',
  'credit',
];

describe('checkLanguage', () => {
  it('accepts a source language and fills the defaults', () => {
    const { language, problems } = check('pl');
    assert.deepEqual(problems, []);
    assert.equal(language.code, 'pl');
    assert.equal(language.folder, 'content/pl');
    assert.equal(language.file, 'content/pl/lang.json');
    assert.equal(language.dir, 'ltr');
    assert.equal(language.source, true);
    assert.equal(language.status, 'published');
    assert.equal(language.ogLocale, 'pl_PL');
    assert.deepEqual(language.typography, {});
    assert.equal(language.order, 1);
  });

  it('keeps what the file says', () => {
    const { language } = check('de', {
      dir: 'rtl',
      order: 7,
      status: 'draft',
      ogLocale: 'de_AT',
      ogImageAlt: 'alt',
      typography: { nbspAfter: ['a', 'w.'], units: ['°C'] },
    });
    assert.equal(language.dir, 'rtl');
    assert.equal(language.order, 7);
    assert.equal(language.status, 'draft');
    assert.equal(language.source, false);
    assert.equal(language.ogLocale, 'de_AT');
    assert.equal(language.ogImageAlt, 'alt');
    assert.deepEqual(language.typography, {
      nbspAfter: ['a', 'w.'],
      units: ['°C'],
    });
  });

  it('defaults the order to 999', () => {
    assert.equal(check('de', { order: undefined }).language.order, 999);
  });

  it('derives the Open Graph locale from the tag', () => {
    assert.equal(check('en').language.ogLocale, 'en_US');
    assert.equal(check('uk').language.ogLocale, 'uk_UA');
    assert.equal(
      check('pt-BR', { htmlLang: 'pt-BR' }).language.ogLocale,
      'pt_BR',
    );
  });

  for (const data of [null, [], 'x', 4]) {
    it(`refuses ${JSON.stringify(data)} as a whole`, () => {
      assert.deepEqual(fieldsOf('pl', data), ['lang.json']);
      assert.equal(checkLanguage('pl', data).language, null);
    });
  }

  for (const code of [
    'PL',
    'p',
    'plxx',
    'pl_',
    'pl-',
    'pl x',
    'img',
    '1a',
    '',
  ]) {
    it(`refuses the folder name ${JSON.stringify(code)}`, () => {
      assert.ok(fieldsOf(code, { ...lj('pl'), code }).includes('code'));
    });
  }

  it('accepts folder names with a region', () => {
    assert.deepEqual(check('pt-BR', { htmlLang: 'pt-BR' }).problems, []);
    assert.ok(LANG_CODE.test('zh-Hans-CN'));
    assert.ok(RESERVED_CODES.has('img'));
  });

  it('refuses unknown keys', () => {
    assert.deepEqual(fieldsOf('pl', { ...lj('pl'), colour: 'x' }), ['colour']);
  });

  it('wants "code" to match the folder', () => {
    assert.deepEqual(
      fieldsOf('en', lj('pl')).filter((f) => f === 'code'),
      ['code'],
    );
    assert.deepEqual(fieldsOf('en', { ...lj('en'), code: undefined }), [
      'code',
    ]);
  });

  for (const key of ['name', 'title', 'description']) {
    for (const value of [undefined, '', '  ', 5, null]) {
      it(`wants ${key} to be a non-empty string (not ${JSON.stringify(value)})`, () => {
        assert.deepEqual(fieldsOf('pl', { ...lj('pl'), [key]: value }), [key]);
      });
    }
  }

  it('validates dir, order, source and status', () => {
    assert.deepEqual(fieldsOf('de', lj('de', { dir: 'up' })), ['dir']);
    assert.deepEqual(fieldsOf('de', lj('de', { order: 'x' })), ['order']);
    assert.deepEqual(fieldsOf('de', lj('de', { order: Number.NaN })), [
      'order',
    ]);
    assert.deepEqual(fieldsOf('de', lj('de', { order: Infinity })), ['order']);
    assert.deepEqual(fieldsOf('de', lj('de', { source: false })), ['source']);
    assert.deepEqual(fieldsOf('de', lj('de', { source: 1 })), ['source']);
    assert.deepEqual(fieldsOf('de', lj('de', { status: 'live' })), ['status']);
  });

  it('accepts order 0 and negative orders', () => {
    assert.deepEqual(check('de', { order: 0 }).problems, []);
    assert.deepEqual(check('de', { order: -1 }).problems, []);
  });

  it('refuses a source language that is a draft', () => {
    assert.deepEqual(fieldsOf('pl', lj('pl', { status: 'draft' })), ['status']);
  });

  it('validates ogImageAlt', () => {
    assert.deepEqual(fieldsOf('de', lj('de', { ogImageAlt: 3 })), [
      'ogImageAlt',
    ]);
  });

  describe('htmlLang and ogLocale', () => {
    it('wants a language tag', () => {
      for (const htmlLang of [undefined, 'e n', 'x', '1', 5, '', 'en_GB'])
        assert.deepEqual(
          fieldsOf('en', lj('en', { htmlLang })),
          ['htmlLang'],
          String(htmlLang),
        );
    });

    it('wants ogLocale to look like en_GB', () => {
      for (const ogLocale of ['en-GB', 'EN_GB', 'en_gb', 'en', 5, ''])
        assert.deepEqual(
          fieldsOf('en', lj('en', { ogLocale })),
          ['ogLocale'],
          String(ogLocale),
        );
      assert.deepEqual(check('en', { ogLocale: 'en_GB' }).problems, []);
    });

    it('wants ogLocale when none can be derived', () => {
      assert.deepEqual(fieldsOf('xx', lj('xx')), ['ogLocale']);
    });

    it('wants ogLocale for a tag that matches the pattern but is no valid locale', () => {
      assert.deepEqual(fieldsOf('en', lj('en', { htmlLang: 'en-12' })), [
        'ogLocale',
      ]);
      assert.deepEqual(
        check('en', { htmlLang: 'en-12', ogLocale: 'en_GB' }).problems,
        [],
      );
    });

    it('lets a draft go without one', () => {
      const { language, problems } = check('xx', { status: 'draft' });
      assert.deepEqual(problems, []);
      assert.equal(language.ogLocale, null);
    });

    it('an explicit ogLocale of a draft is still checked', () => {
      assert.deepEqual(
        fieldsOf('xx', lj('xx', { status: 'draft', ogLocale: 'x' })),
        ['ogLocale'],
      );
    });
  });

  describe('ui', () => {
    it('must be an object', () => {
      for (const ui of [undefined, null, [], 'x'])
        assert.deepEqual(fieldsOf('pl', { ...lj('pl'), ui }), ['ui']);
    });

    it('must hold non-empty strings', () => {
      for (const value of ['', '  ', 3, null, {}])
        assert.deepEqual(fieldsOf('de', lj('de', { ui: { toc: value } })), [
          'ui.toc',
        ]);
    });

    it('requires every key of the templates from the source language', () => {
      for (const key of REQUIRED)
        assert.deepEqual(
          fieldsOf('pl', lj('pl', { ui: { [key]: undefined } })),
          [`ui.${key}`],
          key,
        );
    });

    it('does not require any of them from another language', () => {
      assert.deepEqual(check('de', { ui: { toc: undefined } }).problems, []);
    });

    it('wants the filter status to hold both placeholders, one problem for each missing', () => {
      const fields = (text) =>
        fieldsOf('de', lj('de', { ui: { filterStatus: text } }));
      assert.deepEqual(fields('{shown} of {total}'), []);
      assert.deepEqual(fields('{shown} of many'), ['ui.filterStatus']);
      assert.deepEqual(fields('of {total}'), ['ui.filterStatus']);
      assert.deepEqual(fields('none at all'), [
        'ui.filterStatus',
        'ui.filterStatus',
      ]);
    });

    it('does not ask for the placeholders of an empty text as well', () => {
      assert.deepEqual(fieldsOf('de', lj('de', { ui: { filterStatus: '' } })), [
        'ui.filterStatus',
      ]);
    });

    it('keeps the short name of the app to 12 characters, counted as characters', () => {
      for (const ok of ['Pizza', '123456789012', 'Піца', '🍕'.repeat(12)])
        assert.deepEqual(
          fieldsOf('de', lj('de', { ui: { shortName: ok } })),
          [],
          ok,
        );
      for (const long of ['1234567890123', '🍕'.repeat(13)])
        assert.deepEqual(
          fieldsOf('de', lj('de', { ui: { shortName: long } })),
          ['ui.shortName'],
          long,
        );
      assert.deepEqual(fieldsOf('de', lj('de', { ui: { shortName: '' } })), [
        'ui.shortName',
      ]);
    });

    it('reports a bad and a missing key once each', () => {
      assert.deepEqual(
        fieldsOf('pl', lj('pl', { ui: { toc: undefined, top: '' } })),
        ['ui.top', 'ui.toc'],
      );
    });
  });

  describe('typography', () => {
    it('must be an object', () => {
      for (const typography of [null, [], 'x', 3])
        assert.deepEqual(fieldsOf('de', lj('de', { typography })), [
          'typography',
        ]);
    });

    it('refuses unknown lists', () => {
      assert.deepEqual(
        fieldsOf('de', lj('de', { typography: { other: [] } })),
        ['typography.other'],
      );
    });

    for (const list of ['nbspAfter', 'units']) {
      it(`wants ${list} to be a list of words without spaces`, () => {
        for (const value of [
          'a',
          [1],
          ['a b'],
          [''],
          ['a;'],
          {},
          ['ok', 'a b'],
        ])
          assert.deepEqual(
            fieldsOf('de', lj('de', { typography: { [list]: value } })),
            [`typography.${list}`],
            JSON.stringify(value),
          );
      });

      it(`accepts letters, digits, dots, degrees and slashes in ${list}`, () => {
        assert.deepEqual(
          check('de', {
            typography: { [list]: ['w.', 'ł', 'm/s', '°C', '5g', 'я'] },
          }).problems,
          [],
        );
        assert.deepEqual(
          check('de', { typography: { [list]: [] } }).problems,
          [],
        );
      });
    }
  });

  it('reports every problem at once', () => {
    assert.ok(fieldsOf('pl', {}).length >= 5);
  });
});

describe('mergedUi', () => {
  it('lets the language override the source, which fills the gaps', () => {
    assert.deepEqual(
      mergedUi({ ui: { a: '1', b: '2' } }, { ui: { b: 'x', c: 'y' } }),
      {
        a: '1',
        b: 'x',
        c: 'y',
      },
    );
  });
});

describe('published', () => {
  it('keeps the published ones only, in order', () => {
    const list = [
      { code: 'a', status: 'published' },
      { code: 'b', status: 'draft' },
      { code: 'c', status: 'published' },
    ];
    assert.deepEqual(
      published(list).map((l) => l.code),
      ['a', 'c'],
    );
  });
});

describe('loadLanguages', () => {
  const load = (repo, fs) => {
    const reporter = capture();
    const loaded = loadLanguages({ fs, root: repo.root, reporter });
    return { loaded, reporter };
  };

  it('loads the default compendium: source first, by order', async () => {
    await withRepo((repo) => {
      repo.addLanguage('de', {});
      const { loaded, reporter } = load(repo);
      assert.deepEqual(reporter.entries, []);
      assert.deepEqual(
        loaded.languages.map((l) => l.code),
        ['pl', 'en', 'de'],
      );
      assert.equal(loaded.source.code, 'pl');
    });
  });

  it('sorts by order, then by folder name', async () => {
    await withRepo(
      {
        'content/en/lang.json': lj('en', { order: 5 }),
        'content/de/lang.json': lj('de', { order: 5 }),
        'content/fr/lang.json': lj('fr', { order: 2 }),
      },
      (repo) => {
        const { loaded } = load(repo);
        assert.deepEqual(
          loaded.languages.map((l) => l.code),
          ['pl', 'fr', 'de', 'en'],
        );
      },
    );
  });

  it('skips loose files and dot folders silently', async () => {
    await withRepo((repo) => {
      repo.write('content/.hidden/x', '');
      repo.write('content/notes.txt', '');
      const { loaded, reporter } = load(repo);
      assert.equal(loaded.languages.length, 2);
      assert.deepEqual(reporter.entries, []);
    });
  });

  it('warns about a folder without lang.json and skips it', async () => {
    await withRepo({ 'content/de/01-intro.md': 'x' }, (repo) => {
      const { loaded, reporter } = load(repo);
      assert.equal(loaded.languages.length, 2);
      assert.deepEqual(view(reporter), [
        { level: 'warning', code: 'W_NO_LANG_JSON', file: 'content/de' },
      ]);
    });
  });

  it('fails when content/ is missing', async () => {
    await withTree((tree) => {
      const reporter = capture();
      assert.equal(loadLanguages({ root: tree.root, reporter }), null);
      assert.deepEqual(codes(reporter), ['E_READ']);
    });
  });

  it('refuses content/ as a link and a language folder as a link', async () => {
    await withRepo((repo) => {
      repo.write('other/de/lang.json', lj('de'));
      repo.symlink('content/de', '../other/de');
      const { loaded, reporter } = load(repo);
      assert.equal(loaded, null);
      assert.deepEqual(codes(reporter), ['E_SYMLINK']);
    });
  });

  it('refuses a symlinked folder without trying to follow it', async () => {
    await withRepo((repo) => {
      repo.symlink('content2', 'content');
      repo.remove('content');
      repo.symlink('content', 'content2');
      const { loaded, reporter } = load(repo);
      assert.equal(loaded, null);
      assert.equal(find(reporter, 'E_SYMLINK').file, 'content');
    });
  });

  it('refuses a language folder it cannot list', async () => {
    await withRepo((repo) => {
      const fs = failing(nodeFs, {
        op: 'readdirSync',
        match: /content\/en$/,
        code: 'EACCES',
      });
      const { loaded, reporter } = load(repo, fs);
      assert.equal(loaded, null);
      assert.deepEqual(codes(reporter), ['E_READ']);
    });
  });

  it('refuses a lang.json that is not JSON, once, without a second complaint about sources', async () => {
    await withRepo({ 'content/pl/lang.json': '{' }, (repo) => {
      const { loaded, reporter } = load(repo);
      assert.equal(loaded, null);
      assert.deepEqual(codes(reporter), ['E_JSON']);
    });
  });

  it('refuses an unreadable lang.json', async () => {
    await withRepo((repo) => {
      const fs = failing(nodeFs, {
        op: 'readFileSync',
        match: 'content/en/lang.json',
        code: 'EACCES',
      });
      const { loaded, reporter } = load(repo, fs);
      assert.equal(loaded, null);
      assert.deepEqual(codes(reporter), ['E_READ']);
    });
  });

  it('reports every unreadable lang.json, not just the first', async () => {
    await withRepo({ 'content/de/lang.json': lj('de') }, (repo) => {
      const fs = failing(nodeFs, [
        { op: 'readFileSync', match: 'content/de/lang.json', code: 'EACCES' },
        { op: 'readFileSync', match: 'content/en/lang.json', code: 'EACCES' },
      ]);
      const { loaded, reporter } = load(repo, fs);
      assert.equal(loaded, null);
      assert.deepEqual(
        findAll(reporter, 'E_READ').map((e) => e.file),
        ['content/de/lang.json', 'content/en/lang.json'],
      );
    });
  });

  it('reports E_LANG_META with file and field', async () => {
    await withRepo(
      { 'content/en/lang.json': lj('en', { dir: 'up' }) },
      (repo) => {
        const { loaded, reporter } = load(repo);
        assert.equal(loaded, null);
        assert.deepEqual(view(reporter), [
          {
            level: 'error',
            code: 'E_LANG_META',
            file: 'content/en/lang.json',
            field: 'dir',
          },
        ]);
      },
    );
  });

  it('reports a broken language and still checks the others', async () => {
    await withRepo(
      {
        'content/en/lang.json': lj('en', { dir: 'up' }),
        'content/de/lang.json': lj('de', { status: 'x' }),
      },
      (repo) => {
        const { reporter } = load(repo);
        assert.deepEqual(
          findAll(reporter, 'E_LANG_META').map((e) => e.file),
          ['content/de/lang.json', 'content/en/lang.json'],
        );
      },
    );
  });

  it('wants exactly one source: none', async () => {
    await withRepo(
      { 'content/pl/lang.json': lj('pl', { source: undefined }) },
      (repo) => {
        const { loaded, reporter } = load(repo);
        assert.equal(loaded, null);
        assert.deepEqual(view(reporter), [
          { level: 'error', code: 'E_LANG_SOURCES', file: 'content' },
        ]);
      },
    );
  });

  it('wants exactly one source: two', async () => {
    await withRepo(
      { 'content/en/lang.json': lj('en', { source: true }) },
      (repo) => {
        const { loaded, reporter } = load(repo);
        assert.equal(loaded, null);
        assert.deepEqual(codes(reporter), ['E_LANG_SOURCES']);
      },
    );
  });

  it('counts a source whose lang.json is otherwise invalid', async () => {
    await withRepo(
      {
        'content/pl/lang.json': lj('pl', { dir: 'up' }),
        'content/en/lang.json': lj('en', { source: true }),
      },
      (repo) => {
        const { reporter } = load(repo);
        assert.deepEqual(codes(reporter), ['E_LANG_META', 'E_LANG_SOURCES']);
      },
    );
  });

  it('does not complain about a missing source when the only lang.json is unreadable', async () => {
    await withRepo({ 'content/pl/lang.json': 'null' }, (repo) => {
      const { reporter } = load(repo);
      assert.deepEqual(codes(reporter), ['E_LANG_META']);
    });
  });

  it('refuses two languages with the same htmlLang or the same code in another case', async () => {
    await withRepo(
      {
        'content/en/lang.json': lj('en', { htmlLang: 'PL', ogLocale: 'en_GB' }),
      },
      (repo) => {
        const { loaded, reporter } = load(repo);
        assert.equal(loaded, null);
        assert.deepEqual(view(reporter), [
          {
            level: 'error',
            code: 'E_LANG_META',
            file: 'content/pl/lang.json',
            field: 'htmlLang',
          },
        ]);
      },
    );
  });

  it('refuses codes that differ only in case', async () => {
    await withRepo(
      {
        'content/pt-BR/lang.json': lj('pt-BR', { htmlLang: 'pt-BR' }),
        'content/pt-br/lang.json': lj('pt-br', {
          htmlLang: 'pt-PT',
          ogLocale: 'pt_PT',
        }),
      },
      (repo) => {
        const { reporter } = load(repo);
        assert.ok(
          findAll(reporter, 'E_LANG_META').some((e) => e.field === 'code'),
        );
      },
    );
  });

  it('wants a published language to define every ui key of the source', async () => {
    await withRepo(
      { 'content/en/lang.json': lj('en', { ui: { toc: undefined } }) },
      (repo) => {
        const { loaded, reporter } = load(repo);
        assert.equal(loaded, null);
        assert.deepEqual(view(reporter), [
          {
            level: 'error',
            code: 'E_LANG_UI_MISSING',
            file: 'content/en/lang.json',
            field: 'ui.toc',
          },
        ]);
      },
    );
  });

  it('lets a draft leave ui keys out', async () => {
    await withRepo((repo) => {
      repo.addLanguage('de', { status: 'draft' });
      repo.editJson('content/de/lang.json', (data) => {
        delete data.ui.toc;
      });
      const { loaded, reporter } = load(repo);
      assert.ok(loaded);
      assert.deepEqual(reporter.entries, []);
    });
  });

  it('warns about a ui key the source does not define, an error when strict', async () => {
    await withRepo(
      { 'content/en/lang.json': lj('en', { ui: { bogus: 'x' } }) },
      (repo) => {
        const { loaded, reporter } = load(repo);
        assert.ok(loaded);
        assert.deepEqual(view(reporter), [
          {
            level: 'warning',
            code: 'W_LANG_UI_EXTRA',
            file: 'content/en/lang.json',
            field: 'ui.bogus',
          },
        ]);
        const strict = capture({ strict: true });
        loadLanguages({ root: repo.root, reporter: strict });
        assert.equal(strict.hasErrors(), true);
        assert.equal(find(strict, 'W_LANG_UI_EXTRA').level, 'error');
      },
    );
  });

  it('does not check ui keys against a source that failed', async () => {
    await withRepo(
      { 'content/pl/lang.json': lj('pl', { dir: 'up' }) },
      (repo) => {
        const { reporter } = load(repo);
        assert.deepEqual(codes(reporter), ['E_LANG_META']);
      },
    );
  });
});
