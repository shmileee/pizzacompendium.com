import assert from 'node:assert/strict';
import nodeFs from 'node:fs';
import { describe, it } from 'node:test';
import {
  formatStatus,
  hashText,
  loadSync,
  recordSync,
  sectionStates,
  status,
  sync,
  warnAboutTranslations,
} from '../scripts/lib/i18n-sync.mjs';
import { loadProject } from '../scripts/lib/project.mjs';
import { capture, codes, errorCodes, view } from './helpers/capture.mjs';
import { failing } from './helpers/fake-fs.mjs';
import { createRepo, langJson, withRepo } from './helpers/repo.mjs';

const SRC = '## Wprowadzenie {#intro}\n\nTekst.\n';
const HASH = /^[0-9a-f]{64}$/;

/** pl with 3 sections; en: 01 translated, 02 a copy, 03 missing, 09 extra. */
const files = (over = {}) => ({
  'content/pl/01-intro.md': SRC,
  'content/pl/02-copy.md': '## Kopia {#copy}\n\nTekst kopii.\n',
  'content/pl/03-gone.md': '## Brak {#gone}\n\nBrak.\n',
  'content/en/01-intro.md': '## Introduction {#intro}\n\nText.\n',
  'content/en/02-copy.md': '## Kopia {#copy}\n\nTekst kopii.\n',
  'content/en/03-gone.md': null,
  'content/en/09-extra.md': 'extra\n',
  ...over,
});

const load = (repo, reporter = capture()) => {
  const project = loadProject({ root: repo.root, reporter });
  assert.ok(project, 'the project loads');
  return project;
};
const stateOf = (repo, sync = new Map()) => {
  const { languages, source, content } = load(repo);
  const language = languages.find((l) => l.code === 'en');
  return sectionStates({ language, source, content, sync });
};
const confirm = (repo, args = {}) => {
  const reporter = args.reporter ?? capture();
  const { languages, source, content } = load(repo);
  const language = languages.find((l) => l.code === 'en');
  const result = recordSync({
    root: repo.root,
    language,
    source,
    content,
    files: [],
    reporter,
    ...args,
  });
  return { result, reporter };
};

describe('hashText', () => {
  it('has fixed values: sha256 of the UTF-8 bytes', () => {
    assert.equal(
      hashText('abc'),
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    assert.equal(
      hashText('zażółć'),
      '7eefe5e3046c86cec19ce1215e0a04724124d948468005a1ebc4adf2643bea13',
    );
  });

  it('is a sha256 in hex', () => {
    assert.match(hashText('a'), HASH);
    assert.notEqual(hashText('a'), hashText('b'));
  });

  it('ignores trailing spaces and blank lines at the end of the file', () => {
    assert.equal(hashText('a  \nb\t\n\n\n'), hashText('a\nb'));
  });

  it('does not ignore a change inside the text or leading spaces', () => {
    assert.notEqual(hashText('a\n\nb'), hashText('a\nb'));
    assert.notEqual(hashText(' a'), hashText('a'));
  });

  it('ignores local blocks: they have no counterpart in a translation', () => {
    assert.equal(
      hashText('a\n\n::: local lang=pl Note\nx\n:::\n\nb\n'),
      hashText('a\n\nb\n'),
    );
  });
});

describe('loadSync', () => {
  const read = (repo, sync) => {
    if (sync !== undefined) repo.write('content/en/.sync.json', sync);
    const reporter = capture();
    const { languages } = load(repo);
    const map = loadSync({
      root: repo.root,
      language: languages.find((l) => l.code === 'en'),
      reporter,
    });
    return { map, reporter };
  };

  it('is empty when there is no .sync.json', () =>
    withRepo((repo) => {
      const { map, reporter } = read(repo);
      assert.equal(map.size, 0);
      assert.deepEqual(reporter.entries, []);
    }));

  it('reads file names and hashes', () =>
    withRepo((repo) => {
      const hash = 'a'.repeat(64);
      const { map, reporter } = read(repo, { '01-intro.md': hash });
      assert.deepEqual([...map], [['01-intro.md', hash]]);
      assert.deepEqual(reporter.entries, []);
    }));

  for (const [name, data] of [
    ['a list', '[]'],
    ['a string', '"x"'],
    ['a short hash', '{"a.md":"abc"}'],
    ['an upper-case hash', `{"a.md":"${'A'.repeat(64)}"}`],
    ['a hash that is not a string', '{"a.md":1}'],
    [
      'one valid hash and one invalid',
      `{"a.md":"${'a'.repeat(64)}","b.md":"x"}`,
    ],
    ['a hash of 65 characters', `{"a.md":"${'a'.repeat(65)}"}`],
  ])
    it(`reports ${name} as E_SYNC and reads nothing`, () =>
      withRepo((repo) => {
        const { map, reporter } = read(repo, data);
        assert.equal(map.size, 0);
        assert.deepEqual(view(reporter), [
          { level: 'error', code: 'E_SYNC', file: 'content/en/.sync.json' },
        ]);
      }));

  it('reports a file that is not JSON as E_JSON and reads nothing', () =>
    withRepo((repo) => {
      const { map, reporter } = read(repo, '{');
      assert.equal(map.size, 0);
      assert.deepEqual(codes(reporter), ['E_JSON']);
    }));
});

describe('sectionStates', () => {
  it('tells every state, in source order, with the extra files last', () =>
    withRepo(files(), (repo) => {
      assert.deepEqual(stateOf(repo), [
        { file: '01-intro.md', state: 'ok' },
        { file: '02-copy.md', state: 'untranslated' },
        { file: '03-gone.md', state: 'missing' },
        { file: '09-extra.md', state: 'extra' },
      ]);
    }));

  it('is stale when the source changed after the confirmation', () =>
    withRepo(files(), (repo) => {
      const sync = new Map([['01-intro.md', hashText('old source')]]);
      assert.equal(stateOf(repo, sync)[0].state, 'stale');
    }));

  it('is ok when the confirmation is of the current source', () =>
    withRepo(files(), (repo) => {
      const sync = new Map([['01-intro.md', hashText(SRC)]]);
      assert.equal(stateOf(repo, sync)[0].state, 'ok');
    }));

  it('stays ok after the source only gains trailing blanks', () =>
    withRepo(files(), (repo) => {
      const sync = new Map([['01-intro.md', hashText(SRC)]]);
      repo.write('content/pl/01-intro.md', `${SRC.trimEnd()}   \n\n\n`);
      assert.equal(stateOf(repo, sync)[0].state, 'ok');
    }));

  it('is untranslated when the text is the source without its local blocks', () =>
    withRepo(
      files({
        'content/pl/01-intro.md': `${SRC}\n::: local lang=pl Uwaga\nx\n:::\n`,
      }),
      (repo) => {
        const text = repo.read('content/pl/01-intro.md');
        assert.ok(text.includes('::: local'));
        // the copy a scaffold makes: the source without its local blocks
        repo.write('content/en/01-intro.md', SRC);
        assert.equal(stateOf(repo)[0].state, 'untranslated');
      },
    ));

  it('is untranslated when the text is the source with its local blocks', () =>
    withRepo(
      files({
        'content/pl/01-intro.md': `${SRC}\n::: local lang=pl Uwaga\nx\n:::\n`,
      }),
      (repo) => {
        repo.write(
          'content/en/01-intro.md',
          repo.read('content/pl/01-intro.md'),
        );
        assert.equal(stateOf(repo)[0].state, 'untranslated');
      },
    ));

  it('takes untranslated over stale', () =>
    withRepo(files(), (repo) => {
      const sync = new Map([['02-copy.md', hashText('old')]]);
      assert.equal(stateOf(repo, sync)[1].state, 'untranslated');
    }));
});

describe('warnAboutTranslations', () => {
  const warn = (repo, extra = {}) => {
    const reporter = capture();
    const { languages, content } = load(repo);
    warnAboutTranslations({
      root: repo.root,
      languages,
      content,
      reporter,
      ...extra,
    });
    return reporter;
  };

  it('warns about an untranslated copy and a stale file, nothing else', () =>
    withRepo(files(), (repo) => {
      repo.write('content/en/.sync.json', {
        '01-intro.md': hashText('old source'),
      });
      assert.deepEqual(view(warn(repo)), [
        { level: 'warning', code: 'W_STALE', file: 'content/en/01-intro.md' },
        {
          level: 'warning',
          code: 'W_UNTRANSLATED_COPY',
          file: 'content/en/02-copy.md',
        },
      ]);
    }));

  it('says in the stale warning which command confirms the file', () =>
    withRepo(files(), (repo) => {
      repo.write('content/en/.sync.json', { '01-intro.md': hashText('x') });
      const [stale] = warn(repo).entries;
      assert.ok(stale.message.includes('mise run i18n:sync en 01-intro.md'));
    }));

  it('does not warn about a draft, or about the source language', () =>
    withRepo(files(), (repo) => {
      repo.editJson('content/en/lang.json', (l) => {
        l.status = 'draft';
      });
      assert.deepEqual(warn(repo).entries, []);
    }));

  it('turns warnings into errors in strict mode, keeping the code', () =>
    withRepo(files(), (repo) => {
      const reporter = capture({ strict: true });
      const { languages, content } = load(repo);
      warnAboutTranslations({ root: repo.root, languages, content, reporter });
      assert.deepEqual(view(reporter), [
        {
          level: 'error',
          code: 'W_UNTRANSLATED_COPY',
          file: 'content/en/02-copy.md',
        },
      ]);
    }));

  it('reports a broken .sync.json (E_SYNC) and goes on', () =>
    withRepo(files(), (repo) => {
      repo.write('content/en/.sync.json', '[]');
      assert.deepEqual(codes(warn(repo)), ['E_SYNC', 'W_UNTRANSLATED_COPY']);
    }));
});

describe('recordSync', () => {
  const syncFile = (repo) => repo.readJson('content/en/.sync.json');

  it('records every translated file and skips the rest, with the state', () =>
    withRepo(files(), (repo) => {
      const { result, reporter } = confirm(repo);
      assert.deepEqual(reporter.entries, []);
      assert.deepEqual(result.recorded, ['01-intro.md']);
      assert.deepEqual(result.skipped, [
        { file: '02-copy.md', state: 'untranslated' },
        { file: '03-gone.md', state: 'missing' },
      ]);
      assert.deepEqual(syncFile(repo), { '01-intro.md': hashText(SRC) });
      assert.equal(repo.read('content/en/.sync.json').endsWith('}\n'), true);
    }));

  it('makes the recorded file ok and then stale when the source changes', () =>
    withRepo(files(), (repo) => {
      confirm(repo);
      const sync = new Map(Object.entries(syncFile(repo)));
      assert.equal(stateOf(repo, sync)[0].state, 'ok');
      repo.write('content/pl/01-intro.md', `${SRC}\nNowy akapit.\n`);
      assert.equal(stateOf(repo, sync)[0].state, 'stale');
    }));

  it('records a stale file again with the new hash', () =>
    withRepo(files(), (repo) => {
      repo.write('content/en/.sync.json', { '01-intro.md': 'b'.repeat(64) });
      const { result } = confirm(repo);
      assert.deepEqual(result.recorded, ['01-intro.md']);
      assert.equal(syncFile(repo)['01-intro.md'], hashText(SRC));
    }));

  it('records only the files it is asked for and keeps the other entries', () =>
    withRepo(
      files({
        'content/en/02-copy.md': '## Copy {#copy}\n\nCopy text.\n',
        'content/en/.sync.json': { '02-copy.md': 'c'.repeat(64) },
      }),
      (repo) => {
        const { result } = confirm(repo, { files: ['01-intro.md'] });
        assert.deepEqual(result.recorded, ['01-intro.md']);
        assert.deepEqual(result.skipped, []);
        assert.deepEqual(syncFile(repo), {
          '01-intro.md': hashText(SRC),
          '02-copy.md': 'c'.repeat(64),
        });
      },
    ));

  it('keeps the entries in the order of the files', () =>
    withRepo(
      files({
        'content/en/03-gone.md': '## Gone {#gone}\n\nGone text.\n',
        'content/en/02-copy.md': '## Copy {#copy}\n\nCopy text.\n',
      }),
      (repo) => {
        confirm(repo);
        assert.deepEqual(Object.keys(syncFile(repo)), [
          '01-intro.md',
          '02-copy.md',
          '03-gone.md',
        ]);
      },
    ));

  it('drops the entry of a file the source no longer has', () =>
    withRepo(
      files({ 'content/en/.sync.json': { '77-old.md': 'd'.repeat(64) } }),
      (repo) => {
        confirm(repo);
        assert.deepEqual(Object.keys(syncFile(repo)), ['01-intro.md']);
      },
    ));

  it('does not record an entry for a skipped file that never had one', () =>
    withRepo(files(), (repo) => {
      confirm(repo, { files: ['02-copy.md'] });
      assert.deepEqual(syncFile(repo), {});
    }));

  it('reports a file that is not a section as E_SYNC_FILE and writes nothing', () =>
    withRepo(files(), (repo) => {
      const { result, reporter } = confirm(repo, {
        files: ['01-intro.md', 'nope.md', '09-extra.md'],
      });
      assert.equal(result, null);
      assert.deepEqual(view(reporter), [
        { level: 'error', code: 'E_SYNC_FILE', file: 'content/en' },
        { level: 'error', code: 'E_SYNC_FILE', file: 'content/en' },
      ]);
      assert.equal(repo.exists('content/en/.sync.json'), false);
    }));

  it('writes nothing when the sync file is broken', () =>
    withRepo(files(), (repo) => {
      repo.write('content/en/.sync.json', '[]');
      const { result, reporter } = confirm(repo);
      assert.equal(result, null);
      assert.deepEqual(codes(reporter), ['E_SYNC']);
      assert.equal(repo.read('content/en/.sync.json'), '[]');
    }));

  it('reports a write that fails as E_WRITE', () =>
    withRepo(files(), (repo) => {
      const fs = failing(nodeFs, {
        op: 'writeFileSync',
        match: /\.sync\.json$/,
        code: 'EACCES',
      });
      const { result, reporter } = confirm(repo, { fs });
      assert.equal(result, null);
      assert.deepEqual(view(reporter), [
        {
          level: 'error',
          code: 'E_WRITE',
          file: 'content/en/.sync.json',
        },
      ]);
      assert.ok(reporter.entries[0].message.includes('EACCES'));
    }));
});

describe('formatStatus', () => {
  const language = { code: 'en', status: 'published' };

  it('prints a summary and an aligned table per language', () => {
    assert.deepEqual(
      formatStatus([
        {
          language,
          rows: [
            { file: '01-a.md', state: 'ok' },
            { file: '02-long-name.md', state: 'stale' },
            { file: '03-b.md', state: 'ok' },
          ],
        },
        {
          language: { code: 'uk', status: 'draft' },
          rows: [{ file: 'x.md', state: 'missing' }],
        },
      ]),
      [
        'en (published): 2 ok, 1 stale',
        '  01-a.md          ok',
        '  02-long-name.md  stale',
        '  03-b.md          ok',
        'uk (draft): 1 missing',
        '  x.md  missing',
      ],
    );
  });

  it('prints nothing for no languages', () => {
    assert.deepEqual(formatStatus([]), []);
  });
});

describe('status', () => {
  it('lists every translation, not the source', () =>
    withRepo(files(), (repo) => {
      repo.write('content/de/lang.json', langJson('de', { status: 'draft' }));
      const reporter = capture();
      const lines = status({ root: repo.root, reporter });
      assert.equal(
        lines[0],
        'en (published): 1 ok, 1 untranslated, 1 missing, 1 extra',
      );
      assert.ok(lines.includes('  09-extra.md  extra'));
      assert.ok(lines.some((l) => l.startsWith('de (draft): 3 missing')));
      assert.ok(!lines.some((l) => l.startsWith('pl ')));
    }));

  it('uses what .sync.json says (a stale file)', () =>
    withRepo(files(), (repo) => {
      repo.write('content/en/.sync.json', { '01-intro.md': hashText('x') });
      const lines = status({ root: repo.root, reporter: capture() });
      assert.equal(
        lines[0],
        'en (published): 1 stale, 1 untranslated, 1 missing, 1 extra',
      );
    }));

  it('returns null after reporting when the project cannot be loaded', () => {
    const repo = createRepo({ 'content/pl/lang.json': '{' });
    try {
      const reporter = capture();
      assert.equal(status({ root: repo.root, reporter }), null);
      assert.ok(codes(reporter).includes('E_JSON'));
    } finally {
      repo.cleanup();
    }
  });
});

describe('sync', () => {
  const run = (repo, code, names = []) => {
    const reporter = capture();
    const lines = sync({ root: repo.root, reporter, code, files: names });
    return { lines, reporter };
  };

  it('confirms the files and says which were skipped and why', () =>
    withRepo(files(), (repo) => {
      const { lines, reporter } = run(repo, 'en');
      assert.deepEqual(errorCodes(reporter), []);
      assert.deepEqual(lines, [
        'en: confirmed 1 file(s) against the current pl text',
        '  skipped 02-copy.md: untranslated (nothing to confirm)',
        '  skipped 03-gone.md: missing (nothing to confirm)',
      ]);
      assert.deepEqual(Object.keys(repo.readJson('content/en/.sync.json')), [
        '01-intro.md',
      ]);
    }));

  it('confirms one named file', () =>
    withRepo(files(), (repo) => {
      const { lines } = run(repo, 'en', ['01-intro.md']);
      assert.deepEqual(lines, [
        'en: confirmed 1 file(s) against the current pl text',
      ]);
    }));

  for (const code of ['pl', 'xx'])
    it(`reports ${code} as E_SYNC_LANG and writes nothing`, () =>
      withRepo(files(), (repo) => {
        const { lines, reporter } = run(repo, code);
        assert.equal(lines, null);
        assert.deepEqual(errorCodes(reporter), ['E_SYNC_LANG']);
        assert.equal(
          reporter.entries.find((e) => e.code === 'E_SYNC_LANG').file,
          'content',
        );
        assert.equal(repo.exists('content/en/.sync.json'), false);
      }));

  it('returns null with E_SYNC_FILE for a file that is no section', () =>
    withRepo(files(), (repo) => {
      const { lines, reporter } = run(repo, 'en', ['nope.md']);
      assert.equal(lines, null);
      assert.deepEqual(errorCodes(reporter), ['E_SYNC_FILE']);
    }));

  it('returns null after reporting when the project cannot be loaded', () => {
    const repo = createRepo({ 'content/pl/lang.json': '{' });
    try {
      const { lines } = run(repo, 'en');
      assert.equal(lines, null);
    } finally {
      repo.cleanup();
    }
  });
});
