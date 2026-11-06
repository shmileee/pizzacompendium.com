import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runCli } from '../helpers/cli.mjs';
import { withRepo } from '../helpers/repo.mjs';

const newLang = (repo, args) =>
  runCli('new-language.mjs', args, { root: repo.root });

describe('new-language.mjs', () => {
  it('creates the draft, prints the next steps and exits 0', () =>
    withRepo((repo) => {
      const run = newLang(repo, ['de', 'Deutsch']);
      assert.equal(run.status, 0);
      assert.equal(run.stderr, '');
      assert.match(
        run.stdout,
        /^Created content\/de\/ as a draft, a copy of Polski \(pl\)\./,
      );
      assert.match(run.stdout, /mise run i18n:sync de/);
      assert.equal(repo.readJson('content/de/lang.json').name, 'Deutsch');
      assert.equal(repo.readJson('content/de/lang.json').status, 'draft');
    }));

  it('joins the words of a name with spaces', () =>
    withRepo((repo) => {
      const run = newLang(repo, ['pt-BR', 'Português', 'do', 'Brasil']);
      assert.equal(run.status, 0);
      assert.equal(
        repo.readJson('content/pt-BR/lang.json').name,
        'Português do Brasil',
      );
    }));

  for (const [args, code] of [
    [[], 'E_LANG_CODE'],
    [['DE', 'Deutsch'], 'E_LANG_CODE'],
    [['img', 'Images'], 'E_LANG_CODE'],
    [['de'], 'E_LANG_NAME'],
    [['de', ' '], 'E_LANG_NAME'],
  ])
    it(`${JSON.stringify(args)} exits 1 with ${code} and the usage line`, () =>
      withRepo((repo) => {
        const run = newLang(repo, args);
        assert.equal(run.status, 1);
        assert.equal(run.stdout, '');
        assert.match(run.stderr, new RegExp(`\\[${code}\\]`));
        assert.match(
          run.stderr,
          /\nUsage: mise run new-lang <code> "<Native name>"/,
        );
      }));

  it('exits 1 for an existing language, without the usage line', () =>
    withRepo((repo) => {
      const run = newLang(repo, ['en', 'English']);
      assert.equal(run.status, 1);
      assert.equal(run.stdout, '');
      assert.match(run.stderr, /\[E_LANG_EXISTS\]/);
      assert.doesNotMatch(run.stderr, /Usage:/);
    }));

  it('exits 1 for a broken project, without the usage line', () =>
    withRepo({ 'content/pl/lang.json': '{' }, (repo) => {
      const run = newLang(repo, ['de', 'Deutsch']);
      assert.equal(run.status, 1);
      assert.match(run.stderr, /\[E_JSON\]/);
      assert.doesNotMatch(run.stderr, /Usage:/);
      assert.equal(repo.exists('content/de'), false);
    }));
});
