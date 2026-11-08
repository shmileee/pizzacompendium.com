import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { describe, it } from 'node:test';
import { runCli } from '../helpers/cli.mjs';
import { hashTree, withRepo } from '../helpers/repo.mjs';

const run = (repo, args = [], options = {}) =>
  runCli('build.mjs', args, { root: repo.root, ...options });

describe('scripts/build.mjs', () => {
  it('builds, prints a summary on stderr and exits 0', async () => {
    await withRepo((repo) => {
      const result = run(repo);
      assert.equal(result.status, 0);
      assert.equal(result.stdout, '');
      assert.match(result.stderr, /^Built pl, en → .*dist\/\n$/);
      assert.ok(repo.exists('dist/index.html'));
    });
  });

  it('--quiet prints nothing on success', async () => {
    await withRepo((repo) => {
      const result = run(repo, ['--quiet']);
      assert.equal(result.status, 0);
      assert.equal(result.stderr, '');
      assert.equal(result.stdout, '');
    });
  });

  it('--no-fingerprint leaves the assets as in src/', async () => {
    await withRepo((repo) => {
      assert.equal(run(repo, ['--no-fingerprint', '--quiet']).status, 0);
      assert.equal(repo.read('dist/assets/app.js'), repo.read('src/app.js'));
      assert.doesNotMatch(repo.read('dist/en/index.html'), /\?v=/);
    });
  });

  it('fingerprints by default', async () => {
    await withRepo((repo) => {
      run(repo, ['--quiet']);
      assert.match(repo.read('dist/en/index.html'), /\?v=[0-9a-f]{8}/);
    });
  });

  it('--out writes elsewhere and names it in the summary', async () => {
    await withRepo((repo) => {
      const result = run(repo, ['--out', 'public']);
      assert.equal(result.status, 0);
      assert.match(result.stderr, /→ .*public\/\n$/);
      assert.ok(repo.exists('public/index.html'));
      assert.equal(repo.exists('dist'), false);
    });
  });

  it('--out takes an absolute folder', async () => {
    await withRepo((repo) => {
      const result = run(repo, ['--out', repo.path('abs-out'), '--quiet']);
      assert.equal(result.status, 0);
      assert.ok(repo.exists('abs-out/index.html'));
    });
  });

  it('--out resolves a relative folder against the working directory', async () => {
    await withRepo((repo) => {
      repo.write('cwd/.keep', '');
      const result = run(repo, ['--out', 'o', '--quiet'], {
        cwd: repo.path('cwd'),
      });
      assert.equal(result.status, 0);
      assert.ok(repo.exists('cwd/o/index.html'));
    });
  });

  it('--out equal to the working directory is named "."', async () => {
    await withRepo((repo) => {
      repo.write('site-out/.nojekyll', '');
      const result = run(repo, ['--out', '.'], { cwd: repo.path('site-out') });
      assert.equal(result.status, 0);
      assert.match(result.stderr, /^Built pl, en → \.\/\n$/);
      assert.ok(repo.exists('site-out/index.html'));
    });
  });

  it('--out "" is the working directory, not the default folder', async () => {
    await withRepo((repo) => {
      const result = run(repo, ['--out', ''], { cwd: repo.root });
      assert.equal(result.status, 1);
      assert.match(result.stderr, /\[E_OUT_DIR\]/);
      assert.equal(repo.exists('dist'), false);
    });
  });

  it('--out refuses the repository and changes nothing, exit 1', async () => {
    await withRepo((repo) => {
      const before = hashTree(repo.root);
      const result = run(repo, ['--out', '.']);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /\[E_OUT_DIR\]/);
      assert.match(result.stderr, /Build failed with 1 error\(s\)\.\n$/);
      assert.deepEqual(hashTree(repo.root), before);
    });
  });

  describe('warnings', () => {
    const overrides = {
      'content/en/09-extra.md': '## Extra {#extra}\n\nText.\n',
    };

    it('are shown with their code and counted in the summary, exit 0', async () => {
      await withRepo(overrides, (repo) => {
        const result = run(repo);
        assert.equal(result.status, 0);
        assert.match(
          result.stderr,
          /warning: content\/en\/09-extra\.md: .* \[W_EXTRA_FILE\]/,
        );
        assert.match(result.stderr, /\(1 warning\(s\)\)\n$/);
      });
    });

    it('--quiet hides them', async () => {
      await withRepo(overrides, (repo) => {
        const result = run(repo, ['--quiet']);
        assert.equal(result.status, 0);
        assert.equal(result.stderr, '');
      });
    });

    it('--strict makes them errors: exit 1 and nothing written', async () => {
      await withRepo(overrides, (repo) => {
        const result = run(repo, ['--strict']);
        assert.equal(result.status, 1);
        assert.match(
          result.stderr,
          /error: {3}content\/en\/09-extra\.md: .* \[W_EXTRA_FILE\]/,
        );
        assert.match(result.stderr, /Build failed with 1 error\(s\)\./);
        assert.equal(repo.exists('dist'), false);
      });
    });

    it('--strict --quiet still shows them, as errors', async () => {
      await withRepo(overrides, (repo) => {
        const result = run(repo, ['--strict', '--quiet']);
        assert.equal(result.status, 1);
        assert.match(result.stderr, /W_EXTRA_FILE/);
      });
    });
  });

  describe('formats', () => {
    const overrides = {
      'content/en/09-extra.md': '## Extra {#extra}\n\nText.\n',
    };

    it('json: a complete document on stdout', async () => {
      await withRepo(overrides, (repo) => {
        const result = run(repo, ['--format', 'json', '--quiet']);
        assert.equal(result.status, 0);
        assert.deepEqual(result.json(), []);
        const full = run(repo, ['--format', 'json']);
        assert.deepEqual(
          full.json().map(({ level, code, file }) => ({ level, code, file })),
          [
            {
              level: 'warning',
              code: 'W_EXTRA_FILE',
              file: 'content/en/09-extra.md',
            },
          ],
        );
        assert.match(full.stderr, /^Built /);
      });
    });

    it('json: errors too, with exit 1', async () => {
      await withRepo({ 'site.json': '{' }, (repo) => {
        const result = run(repo, ['--format', 'json']);
        assert.equal(result.status, 1);
        assert.deepEqual(
          result.json().map((entry) => entry.code),
          ['E_JSON'],
        );
        assert.match(result.stderr, /Build failed/);
      });
    });

    it('github: workflow commands on stdout', async () => {
      await withRepo(overrides, (repo) => {
        const result = run(repo, ['--format', 'github']);
        assert.equal(result.status, 0);
        assert.match(
          result.stdout,
          /^::warning file=content\/en\/09-extra\.md,title=W_EXTRA_FILE::/,
        );
        assert.equal(result.stdout.endsWith('\n'), true);
      });
    });

    it('defaults to github annotations inside GitHub Actions', async () => {
      await withRepo(overrides, (repo) => {
        const result = run(repo, [], { env: { GITHUB_ACTIONS: 'true' } });
        assert.match(result.stdout, /^::warning /);
        assert.doesNotMatch(result.stderr, /W_EXTRA_FILE/);
      });
    });

    it('an explicit --format wins over GitHub Actions', async () => {
      await withRepo(overrides, (repo) => {
        const result = run(repo, ['--format', 'text'], {
          env: { GITHUB_ACTIONS: 'true' },
        });
        assert.equal(result.stdout, '');
        assert.match(result.stderr, /warning: /);
      });
    });
  });

  describe('failures', () => {
    it('a broken site exits 1 with the diagnostics and the count', async () => {
      await withRepo(
        { 'site.json': { siteUrl: 'http://x.test', ogImage: 'img/og.webp' } },
        (repo) => {
          const result = run(repo);
          assert.equal(result.status, 1);
          assert.match(result.stderr, /error: {3}site\.json: .* \[E_SITE\]/);
          assert.match(result.stderr, /\nBuild failed with 1 error\(s\)\.\n$/);
          assert.doesNotMatch(result.stderr, /Built /);
          assert.equal(repo.exists('dist'), false);
        },
      );
    });

    it('a failed build leaves the previous dist as it was', async () => {
      await withRepo((repo) => {
        assert.equal(run(repo, ['--quiet']).status, 0);
        const before = hashTree(repo.dist);
        repo.write('site.json', '{');
        assert.equal(run(repo, ['--quiet']).status, 1);
        assert.deepEqual(hashTree(repo.dist), before);
      });
    });

    it('a missing root exits 1 without a stack trace', async () => {
      await withRepo((repo) => {
        const result = run(repo, [], {
          env: { COMPENDIUM_ROOT: repo.path('nowhere') },
        });
        assert.equal(result.status, 1);
        assert.doesNotMatch(result.stderr, /\n\s+at /);
        assert.match(result.stderr, /Build failed/);
      });
    });
  });

  describe('bad options', () => {
    it('an unknown option exits 1 with the usage and builds nothing', async () => {
      await withRepo((repo) => {
        const result = run(repo, ['--nope']);
        assert.equal(result.status, 1);
        assert.match(
          result.stderr,
          /Usage: mise run build -- \[--strict\] \[--out <out>\] \[--no-fingerprint\] \[--quiet\] \[--format <text\|github\|json>\]/,
        );
        assert.equal(repo.exists('dist'), false);
        assert.equal(result.stdout, '');
      });
    });

    it('a bad --format exits 1 and says which are allowed', async () => {
      await withRepo((repo) => {
        const result = run(repo, ['--format', 'xml']);
        assert.equal(result.status, 1);
        assert.match(
          result.stderr,
          /--format must be one of text, github, json/,
        );
        assert.equal(repo.exists('dist'), false);
      });
    });

    it('--out without a value exits 1', async () => {
      await withRepo((repo) => {
        const result = run(repo, ['--out']);
        assert.equal(result.status, 1);
        assert.match(result.stderr, /Usage:/);
      });
    });

    it('a stray positional argument exits 1', async () => {
      await withRepo((repo) => {
        assert.equal(run(repo, ['dist']).status, 1);
        assert.equal(repo.exists('dist'), false);
      });
    });
  });
});

describe('scripts/build.mjs: the dates of the text', () => {
  /**
   * Git in the throwaway folder, with no configuration of the machine or the
   * user (so no signing, no hooks) and a fixed author, committer and date.
   */
  const git = (repo, args) =>
    execFileSync('git', args, {
      cwd: repo.root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        PATH: process.env.PATH,
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_AUTHOR_NAME: 'Test',
        GIT_AUTHOR_EMAIL: 'test@example.invalid',
        GIT_COMMITTER_NAME: 'Test',
        GIT_COMMITTER_EMAIL: 'test@example.invalid',
        GIT_AUTHOR_DATE: '2026-11-06T22:18:37+01:00',
        GIT_COMMITTER_DATE: '2026-11-06T22:18:37+01:00',
      },
    });

  it('takes them from the history of the repository the text is in', async () => {
    await withRepo((repo) => {
      git(repo, ['init', '--quiet']);
      git(repo, ['add', '--all']);
      git(repo, ['commit', '--quiet', '--message', 'text']);
      assert.equal(run(repo, ['--quiet', '--strict']).status, 0);
      assert.match(
        repo.read('dist/en/index.html'),
        /"dateModified":"2026-11-06T22:18:37\+01:00"/,
      );
      assert.match(repo.read('dist/sitemap.xml'), /<lastmod>2026-11-06T/);
    });
  });

  it('builds without them outside a repository', async () => {
    await withRepo((repo) => {
      assert.equal(run(repo, ['--quiet', '--strict']).status, 0);
      assert.doesNotMatch(repo.read('dist/en/index.html'), /dateModified/);
    });
  });
});
