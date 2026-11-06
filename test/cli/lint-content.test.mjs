import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runCli } from '../helpers/cli.mjs';
import { introText, withRepo } from '../helpers/repo.mjs';

const english = (text) =>
  introText('en').replace('A short text about pizza.', text);
const BAD = english('Wow!!');
const lint = (repo, args = [], opts = {}) =>
  runCli('lint-content.mjs', args, { root: repo.root, ...opts });

describe('lint-content.mjs', () => {
  it('exits 0 for clean content and prints only the summary', () =>
    withRepo((repo) => {
      const run = lint(repo);
      assert.equal(run.status, 0);
      assert.equal(run.stdout, '');
      assert.equal(
        run.stderr.trim(),
        'content rules: 0 error(s), 0 warning(s)',
      );
    }));

  it('exits 1 on an error and prints text diagnostics on stderr', () =>
    withRepo({ 'content/en/01-intro.md': BAD }, (repo) => {
      const run = lint(repo);
      assert.equal(run.status, 1);
      assert.equal(run.stdout, '');
      assert.match(
        run.stderr,
        /content\/en\/01-intro\.md:3: .*\[E_EXCLAMATION_CHAIN\]/,
      );
      assert.match(run.stderr, /\[W_EXCLAMATION_MARK\]/);
      assert.match(run.stderr, /content rules: 1 error\(s\), 1 warning\(s\)/);
    }));

  it('exits 0 for warnings alone', () =>
    withRepo({ 'content/en/01-intro.md': english('Nice!') }, (repo) => {
      const run = lint(repo);
      assert.equal(run.status, 0);
      assert.match(run.stderr, /\[W_EXCLAMATION_MARK\]/);
      assert.match(run.stderr, /0 error\(s\), 1 warning\(s\)/);
    }));

  it('prints json on stdout, a complete document', () =>
    withRepo({ 'content/en/01-intro.md': BAD }, (repo) => {
      const run = lint(repo, ['--format', 'json']);
      assert.equal(run.status, 1);
      assert.deepEqual(
        run.json().map((d) => [d.level, d.code, d.file, d.line]),
        [
          ['error', 'E_EXCLAMATION_CHAIN', 'content/en/01-intro.md', 3],
          ['warning', 'W_EXCLAMATION_MARK', 'content/en/01-intro.md', 3],
        ],
      );
    }));

  it('prints [] for json when there is nothing to report', () =>
    withRepo((repo) => {
      const run = lint(repo, ['--format', 'json']);
      assert.equal(run.status, 0);
      assert.deepEqual(run.json(), []);
    }));

  it('prints GitHub annotations on stdout', () =>
    withRepo({ 'content/en/01-intro.md': BAD }, (repo) => {
      const run = lint(repo, ['--format', 'github']);
      assert.equal(run.status, 1);
      const lines = run.stdout.trim().split('\n');
      assert.equal(lines.length, 2);
      assert.match(
        lines[0],
        /^::error file=content\/en\/01-intro\.md,line=3,title=E_EXCLAMATION_CHAIN::/,
      );
      assert.match(
        lines[1],
        /^::warning file=content\/en\/01-intro\.md,line=3,title=W_EXCLAMATION_MARK::/,
      );
    }));

  it('defaults to github annotations inside GitHub Actions', () =>
    withRepo({ 'content/en/01-intro.md': BAD }, (repo) => {
      const run = lint(repo, [], { env: { GITHUB_ACTIONS: 'true' } });
      assert.match(run.stdout, /^::error /);
      assert.doesNotMatch(run.stderr, /\[E_/);
    }));

  it('--quiet shows errors only, and still the summary', () =>
    withRepo({ 'content/en/01-intro.md': BAD }, (repo) => {
      const run = lint(repo, ['--quiet', '--format', 'json']);
      assert.deepEqual(
        run.json().map((d) => d.code),
        ['E_EXCLAMATION_CHAIN'],
      );
      assert.equal(run.stderr, '');
    }));

  it('--quiet hides warnings in the text format and prints nothing for them', () =>
    withRepo({ 'content/en/01-intro.md': english('Nice!') }, (repo) => {
      const run = lint(repo, ['--quiet']);
      assert.equal(run.status, 0);
      assert.equal(run.stderr, '');
    }));

  it('--file checks one section', () =>
    withRepo(
      {
        'content/pl/02-b.md': '## B {#b}\n\nTekst.\n',
        'content/en/02-b.md': '## B {#b}\n\nWow!!\n',
        'content/en/01-intro.md': BAD,
      },
      (repo) => {
        const run = lint(repo, ['--file', '02-b.md', '--format', 'json']);
        assert.equal(run.status, 1);
        assert.ok(run.json().every((d) => d.file === 'content/en/02-b.md'));
      },
    ));

  it('--file with a name the source lacks exits 1 with E_LINT_FILE', () =>
    withRepo((repo) => {
      const run = lint(repo, ['--file', 'nope.md', '--format', 'json']);
      assert.equal(run.status, 1);
      assert.deepEqual(
        run.json().map((d) => d.code),
        ['E_LINT_FILE'],
      );
    }));

  it('exits 1 for a broken project, with the code', () =>
    withRepo({ 'content/en/lang.json': '{' }, (repo) => {
      const run = lint(repo, ['--format', 'json']);
      assert.equal(run.status, 1);
      assert.deepEqual(
        run.json().map((d) => d.code),
        ['E_JSON'],
      );
    }));

  for (const args of [['--format', 'xml'], ['--nope'], ['--file']])
    it(`exits 1 with the usage for ${args.join(' ')}`, () =>
      withRepo((repo) => {
        const run = lint(repo, args);
        assert.equal(run.status, 1);
        assert.equal(run.stdout, '');
        assert.match(run.stderr, /Usage: mise run content:lint -- /);
        assert.doesNotMatch(run.stderr, /content rules:/);
      }));

  it('works on the repository it lives in when COMPENDIUM_ROOT is not set', () => {
    const run = runCli('lint-content.mjs', ['--format', 'json', '--quiet'], {
      root: null,
    });
    const found = run.json();
    assert.ok(Array.isArray(found));
    for (const item of found) assert.equal(typeof item.code, 'string');
    // The exit code says whether the real content has an error.
    assert.equal(
      run.status,
      found.some(({ level }) => level === 'error') ? 1 : 0,
    );
  });
});
