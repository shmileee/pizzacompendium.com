import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runCli } from '../helpers/cli.mjs';
import { withRepo } from '../helpers/repo.mjs';

const FILES = {
  'content/pl/01-intro.md': '## Wstep {#intro}\n\nTekst.\n',
  'content/pl/02-copy.md': '## Kopia {#copy}\n\nTekst.\n',
  'content/en/01-intro.md': '## Intro {#intro}\n\nText.\n',
  'content/en/02-copy.md': '## Kopia {#copy}\n\nTekst.\n',
};
const i18n = (repo, args) => runCli('i18n.mjs', args, { root: repo.root });

describe('i18n.mjs status', () => {
  it('prints the table on stdout and exits 0', () =>
    withRepo(FILES, (repo) => {
      const run = i18n(repo, ['status']);
      assert.equal(run.status, 0);
      assert.deepEqual(run.stdout.trim().split('\n'), [
        'en (published): 1 ok, 1 untranslated',
        '  01-intro.md  ok',
        '  02-copy.md   untranslated',
      ]);
    }));

  it('exits 1 and prints the diagnostics when the project is broken', () =>
    withRepo({ 'content/en/lang.json': '{' }, (repo) => {
      const run = i18n(repo, ['status']);
      assert.equal(run.status, 1);
      assert.equal(run.stdout, '');
      assert.match(run.stderr, /\[E_JSON\]/);
    }));

  it('exits 1 when .sync.json is broken, and still prints the table', () =>
    withRepo({ ...FILES, 'content/en/.sync.json': '[]' }, (repo) => {
      const run = i18n(repo, ['status']);
      assert.equal(run.status, 1);
      assert.match(run.stdout, /^en \(published\)/);
      assert.match(run.stderr, /\[E_SYNC\]/);
    }));

  it('prints warnings of loading on stderr but still exits 0', () =>
    withRepo({ ...FILES, 'content/en/02-copy.md': null }, (repo) => {
      const run = i18n(repo, ['status']);
      assert.equal(run.status, 0);
      assert.match(run.stderr, /warning: .*\[W_FALLBACK\]/);
      assert.match(run.stdout, /02-copy\.md {3}missing/);
    }));
});

describe('i18n.mjs sync', () => {
  it('confirms the files, writes .sync.json and exits 0', () =>
    withRepo(FILES, (repo) => {
      const run = i18n(repo, ['sync', 'en']);
      assert.equal(run.status, 0);
      assert.deepEqual(run.stdout.trim().split('\n'), [
        'en: confirmed 1 file(s) against the current pl text',
        '  skipped 02-copy.md: untranslated (nothing to confirm)',
      ]);
      assert.deepEqual(Object.keys(repo.readJson('content/en/.sync.json')), [
        '01-intro.md',
      ]);
    }));

  it('a confirmed file turns stale when the source changes (status again)', () =>
    withRepo(FILES, (repo) => {
      i18n(repo, ['sync', 'en', '01-intro.md']);
      repo.write(
        'content/pl/01-intro.md',
        '## Wstep {#intro}\n\nNowy tekst.\n',
      );
      assert.match(i18n(repo, ['status']).stdout, /01-intro\.md {2}stale/);
    }));

  it('takes a list of files after the code', () =>
    withRepo(FILES, (repo) => {
      const run = i18n(repo, ['sync', 'en', '01-intro.md']);
      assert.equal(run.status, 0);
      assert.equal(
        run.stdout.trim(),
        'en: confirmed 1 file(s) against the current pl text',
      );
    }));

  it('exits 1 for the source language and for an unknown one', () =>
    withRepo(FILES, (repo) => {
      for (const code of ['pl', 'xx']) {
        const run = i18n(repo, ['sync', code]);
        assert.equal(run.status, 1);
        assert.equal(run.stdout, '');
        assert.match(run.stderr, /\[E_SYNC_LANG\]/);
      }
      assert.equal(repo.exists('content/en/.sync.json'), false);
    }));

  it('exits 1 for a file that is no section', () =>
    withRepo(FILES, (repo) => {
      const run = i18n(repo, ['sync', 'en', 'nope.md']);
      assert.equal(run.status, 1);
      assert.match(run.stderr, /\[E_SYNC_FILE\]/);
    }));
});

describe('i18n.mjs usage', () => {
  for (const args of [[], ['sync'], ['frobnicate'], ['frobnicate', 'en']])
    it(`prints the usage and exits 1 for ${JSON.stringify(args)}`, () =>
      withRepo(FILES, (repo) => {
        const run = i18n(repo, args);
        assert.equal(run.status, 1);
        assert.equal(run.stdout, '');
        assert.match(
          run.stderr,
          /^Usage: mise run i18n:status \| mise run i18n:sync <code> \[files\.\.\.\]/,
        );
      }));

  it('writes nothing for a usage error', () =>
    withRepo(FILES, (repo) => {
      i18n(repo, ['sync']);
      assert.equal(repo.exists('content/en/.sync.json'), false);
    }));
});
