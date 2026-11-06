import assert from 'node:assert/strict';
import nodeFs from 'node:fs';
import { describe, it } from 'node:test';
import { nextSteps, scaffoldLanguage } from '../scripts/lib/new-language.mjs';
import { lintProject, loadProject } from '../scripts/lib/project.mjs';
import { capture, codes, errorCodes, view } from './helpers/capture.mjs';
import { failing } from './helpers/fake-fs.mjs';
import { createRepo, langJson, withRepo } from './helpers/repo.mjs';

const make = (repo, code, name, extra = {}) => {
  const reporter = capture();
  const result = scaffoldLanguage({
    root: repo.root,
    code,
    name,
    reporter,
    ...extra,
  });
  return { result, reporter };
};

describe('scaffoldLanguage', () => {
  it('creates a draft: the source sections and a lang.json under content/<code>', () =>
    withRepo((repo) => {
      const { result, reporter } = make(repo, 'de', 'Deutsch');
      assert.deepEqual(reporter.entries, []);
      assert.deepEqual(result.files, ['01-intro.md', 'lang.json']);
      assert.equal(result.source.code, 'pl');
      assert.deepEqual(
        repo.list('content/de'),
        ['content/de/01-intro.md', 'content/de/lang.json'].map((p) =>
          p.slice('content/de/'.length),
        ),
      );
      assert.equal(
        repo.read('content/de/01-intro.md'),
        repo.read('content/pl/01-intro.md'),
      );
    }));

  it('writes a lang.json with the code, the name, the source title and ui', () =>
    withRepo((repo) => {
      make(repo, 'de', '  Deutsch  ');
      const meta = repo.readJson('content/de/lang.json');
      const source = repo.readJson('content/pl/lang.json');
      assert.equal(meta.code, 'de');
      assert.equal(meta.name, 'Deutsch');
      assert.equal(meta.htmlLang, 'de');
      assert.equal(meta.status, 'draft');
      assert.equal(meta.order, 3);
      assert.equal(meta.title, source.title);
      assert.equal(meta.description, source.description);
      assert.deepEqual(meta.ui, source.ui);
      assert.equal('ogImageAlt' in meta, false);
      assert.equal('source' in meta, false);
      assert.ok(repo.read('content/de/lang.json').endsWith('}\n'));
    }));

  it('takes the next order after the highest one', () =>
    withRepo((repo) => {
      repo.editJson('content/en/lang.json', (l) => {
        l.order = 40;
      });
      make(repo, 'de', 'Deutsch');
      assert.equal(repo.readJson('content/de/lang.json').order, 41);
    }));

  it('copies ogImageAlt when the source has one', () =>
    withRepo((repo) => {
      repo.editJson('content/pl/lang.json', (l) => {
        l.ogImageAlt = 'Alt text';
      });
      make(repo, 'de', 'Deutsch');
      assert.equal(
        repo.readJson('content/de/lang.json').ogImageAlt,
        'Alt text',
      );
    }));

  it('does not copy local blocks of the source', () =>
    withRepo((repo) => {
      repo.write(
        'content/pl/01-intro.md',
        '## Intro {#intro}\n\nA.\n\n::: local lang=pl Uwaga\nlokalnie\n:::\n\nB.\n',
      );
      make(repo, 'de', 'Deutsch');
      assert.equal(
        repo.read('content/de/01-intro.md'),
        '## Intro {#intro}\n\nA.\n\nB.\n',
      );
    }));

  it('accepts codes with a territory, a script and three letters', () => {
    for (const code of ['de', 'pt-BR', 'fil', 'zh-Hant', 'es-419'])
      withRepo((repo) => {
        const { result, reporter } = make(repo, code, 'Name');
        assert.deepEqual(reporter.entries, [], code);
        assert.ok(result, code);
        assert.equal(repo.readJson(`content/${code}/lang.json`).code, code);
      });
  });

  it('leaves a project that loads, lints clean and has the new draft', () =>
    withRepo((repo) => {
      make(repo, 'de', 'Deutsch');
      const reporter = capture();
      const project = loadProject({ root: repo.root, reporter });
      assert.deepEqual(reporter.entries, []);
      const de = project.languages.find((l) => l.code === 'de');
      assert.equal(de.status, 'draft');
      lintProject({ root: repo.root, reporter });
      assert.deepEqual(reporter.entries, []);
    }));

  it('removes a leftover .new-<code> folder from an earlier failure', () =>
    withRepo((repo) => {
      repo.write('content/.new-de/stale.md', 'x');
      const { result } = make(repo, 'de', 'Deutsch');
      assert.ok(result);
      assert.equal(repo.exists('content/.new-de'), false);
      assert.equal(repo.exists('content/de/stale.md'), false);
    }));

  for (const code of [
    '',
    'd',
    'DE',
    'de_DE',
    'de-',
    '-de',
    'deutsch',
    'de-B',
    'img',
    '1a',
    'de DE',
    '../x',
  ])
    it(`rejects the code ${JSON.stringify(code)} as E_LANG_CODE and writes nothing`, () =>
      withRepo((repo) => {
        const before = repo.list('.');
        const { result, reporter } = make(repo, code, 'Name');
        assert.equal(result, null);
        assert.deepEqual(codes(reporter), ['E_LANG_CODE']);
        assert.deepEqual(repo.list('.'), before);
      }));

  for (const name of ['', '   ', '\t\n'])
    it(`rejects the name ${JSON.stringify(name)} as E_LANG_NAME`, () =>
      withRepo((repo) => {
        const { result, reporter } = make(repo, 'de', name);
        assert.equal(result, null);
        assert.deepEqual(codes(reporter), ['E_LANG_NAME']);
        assert.equal(repo.exists('content/de'), false);
      }));

  it('reports the code before the name when both are wrong', () =>
    withRepo((repo) => {
      assert.deepEqual(codes(make(repo, 'X', '').reporter), ['E_LANG_CODE']);
    }));

  it('does not load the project for a bad code or name', () =>
    withRepo((repo) => {
      repo.write('content/pl/lang.json', '{');
      assert.deepEqual(codes(make(repo, 'X', 'n').reporter), ['E_LANG_CODE']);
      assert.deepEqual(codes(make(repo, 'de', ' ').reporter), ['E_LANG_NAME']);
    }));

  it('reports an existing language as E_LANG_EXISTS and keeps it', () =>
    withRepo((repo) => {
      const before = repo.read('content/en/lang.json');
      const { result, reporter } = make(repo, 'en', 'English again');
      assert.equal(result, null);
      assert.deepEqual(codes(reporter), ['E_LANG_EXISTS']);
      assert.equal(repo.read('content/en/lang.json'), before);
    }));

  it('compares the code without regard to case (pt-br is pt-BR)', () =>
    withRepo(
      { 'content/pt-BR/lang.json': langJson('pt-BR', { status: 'draft' }) },
      (repo) => {
        const before = repo.list('content');
        const { reporter } = make(repo, 'pt-br', 'Portugues');
        assert.deepEqual(codes(reporter), ['E_LANG_EXISTS']);
        assert.deepEqual(repo.list('content'), before);
      },
    ));

  it('compares the code without regard to case on a case-sensitive disk', () =>
    withRepo(
      { 'content/pt-BR/lang.json': langJson('pt-BR', { status: 'draft' }) },
      (repo) => {
        // on a disk that keeps case apart, content/pt-br is not found
        const fs = failing(nodeFs, {
          op: 'lstatSync',
          match: /content\/pt-br$/,
          code: 'ENOENT',
        });
        const { result, reporter } = make(repo, 'pt-br', 'Portugues', { fs });
        assert.equal(result, null);
        assert.deepEqual(codes(reporter), ['E_LANG_EXISTS']);
      },
    ));

  it('reports a folder that exists without a lang.json as E_LANG_EXISTS', () =>
    withRepo((repo) => {
      repo.write('content/de/notes.txt', 'x');
      const { result, reporter } = make(repo, 'de', 'Deutsch');
      assert.equal(result, null);
      assert.deepEqual(errorCodes(reporter), ['E_LANG_EXISTS']);
      assert.equal(repo.exists('content/de/notes.txt'), true);
    }));

  it('returns null with the project errors when the project does not load', () => {
    const repo = createRepo({ 'content/pl/lang.json': '{' });
    try {
      const { result, reporter } = make(repo, 'de', 'Deutsch');
      assert.equal(result, null);
      assert.ok(codes(reporter).includes('E_JSON'));
      assert.equal(repo.exists('content/de'), false);
    } finally {
      repo.cleanup();
    }
  });

  it('returns null when the project loads but has an error', () =>
    withRepo((repo) => {
      // an error that does not stop loading: a reporter that already has one
      const reporter = capture();
      reporter.error('E_BEFORE', 'earlier problem');
      const result = scaffoldLanguage({
        root: repo.root,
        code: 'de',
        name: 'Deutsch',
        reporter,
      });
      assert.equal(result, null);
      assert.equal(repo.exists('content/de'), false);
    }));

  for (const op of ['writeFileSync', 'mkdirSync', 'renameSync'])
    it(`reports a failing ${op} as E_WRITE and leaves no folder behind`, () =>
      withRepo((repo) => {
        const fs = failing(nodeFs, {
          op,
          code: 'EACCES',
          match: /\.new-de|\/de$/,
        });
        const { result, reporter } = make(repo, 'de', 'Deutsch', { fs });
        assert.equal(result, null);
        assert.deepEqual(view(reporter), [{ level: 'error', code: 'E_WRITE' }]);
        assert.ok(reporter.entries[0].message.includes('EACCES'));
        assert.equal(repo.exists('content/de'), false);
        assert.equal(repo.exists('content/.new-de'), false);
      }));
});

describe('nextSteps', () => {
  const text = nextSteps('de', { name: 'Polski', code: 'pl' });

  it('names the folder, the source and the commands to run', () => {
    assert.ok(text.includes('content/de/'));
    assert.ok(text.includes('Polski (pl)'));
    assert.ok(text.includes('mise run i18n:sync de'));
    assert.ok(text.includes('mise run serve'));
    assert.ok(text.includes('/de/'));
  });

  it('says that a draft stays out of the picker and search engines', () => {
    assert.ok(text.includes('noindex'));
    assert.ok(text.includes('"status": "published"'));
  });

  it('mentions ogLocale and rtl for the translator', () => {
    assert.ok(text.includes('ogLocale'));
    assert.ok(text.includes('rtl'));
  });
});
