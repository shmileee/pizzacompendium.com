import assert from 'node:assert/strict';
import nodeFs from 'node:fs';
import { describe, it } from 'node:test';
import { lintProject, loadProject } from '../scripts/lib/project.mjs';
import { capture, codes, view } from './helpers/capture.mjs';
import { failing } from './helpers/fake-fs.mjs';
import { introText, langJson, withRepo } from './helpers/repo.mjs';

describe('loadProject', () => {
  it('returns the languages, the source and the content of every language', () =>
    withRepo((repo) => {
      const reporter = capture();
      const project = loadProject({ root: repo.root, reporter });
      assert.deepEqual(reporter.entries, []);
      assert.deepEqual(
        project.languages.map((l) => l.code),
        ['pl', 'en'],
      );
      assert.equal(project.source.code, 'pl');
      assert.deepEqual([...project.content.keys()], ['pl', 'en']);
      assert.equal(
        project.content.get('en').sections[0].text,
        repo.read('content/en/01-intro.md'),
      );
    }));

  it('returns null after reporting when a language is broken', () =>
    withRepo((repo) => {
      repo.write('content/en/lang.json', { code: 'en' });
      const reporter = capture();
      assert.equal(loadProject({ root: repo.root, reporter }), null);
      assert.ok(codes(reporter).includes('E_LANG_META'));
    }));

  it('returns null after reporting when a section cannot be read', () =>
    withRepo((repo) => {
      repo.write('content/en/01-intro.md', Buffer.from([0xff, 0xfe, 0x41]));
      const reporter = capture();
      assert.equal(loadProject({ root: repo.root, reporter }), null);
      assert.deepEqual(codes(reporter), ['E_ENCODING']);
    }));

  it('does not load sections when the languages failed', () =>
    withRepo((repo) => {
      repo.write('content/en/lang.json', '{');
      repo.write('content/en/01-intro.md', Buffer.from([0xff]));
      const reporter = capture();
      assert.equal(loadProject({ root: repo.root, reporter }), null);
      assert.deepEqual(codes(reporter), ['E_JSON']);
    }));

  it('reads through the file system it is given', () =>
    withRepo((repo) => {
      const fs = failing(nodeFs, {
        op: 'readFileSync',
        match: /01-intro\.md$/,
        code: 'EACCES',
      });
      const reporter = capture();
      assert.equal(loadProject({ fs, root: repo.root, reporter }), null);
      assert.ok(codes(reporter).includes('E_READ'));
    }));
});

describe('lintProject', () => {
  it('reports nothing for the default compendium', () =>
    withRepo((repo) => {
      const reporter = capture();
      lintProject({ root: repo.root, reporter });
      assert.deepEqual(reporter.entries, []);
    }));

  it('applies the rules to the files on disk', () =>
    withRepo((repo) => {
      repo.write(
        'content/en/01-intro.md',
        introText('en').replace('A short text about pizza.', 'Wow!!'),
      );
      const reporter = capture();
      lintProject({ root: repo.root, reporter });
      assert.deepEqual(view(reporter), [
        {
          level: 'error',
          code: 'E_EXCLAMATION_CHAIN',
          file: 'content/en/01-intro.md',
          line: 3,
        },
        {
          level: 'warning',
          code: 'W_EXCLAMATION_MARK',
          file: 'content/en/01-intro.md',
          line: 3,
        },
      ]);
    }));

  it('sees a word stored with decomposed letters as the word it is', () =>
    withRepo((repo) => {
      repo.editJson('content/rules.json', (rules) => {
        rules.rules.push({
          id: 'country-uk',
          level: 'error',
          message: 'country-neutral',
          patterns: ['Україн\\p{L}*'],
          flags: 'u',
        });
      });
      const text = introText('en').replace(
        'A short text about pizza.',
        'Піца в Україні.'.normalize('NFD'),
      );
      assert.ok(!text.includes('Україн'), 'the file holds no composed ї');
      repo.write('content/en/01-intro.md', text);
      const reporter = capture();
      lintProject({ root: repo.root, reporter });
      assert.deepEqual(codes(reporter), ['E_COUNTRY_UK']);
    }));

  it('checks one file only when asked', () =>
    withRepo((repo) => {
      repo.write('content/pl/02-b.md', '## B {#b}\n\nWow!!\n');
      repo.write('content/en/02-b.md', '## B {#b}\n\nWow!!\n');
      repo.write(
        'content/en/01-intro.md',
        '## Introduction {#intro}\n\nOops!!\n',
      );
      const reporter = capture();
      lintProject({ root: repo.root, reporter, only: '02-b.md' });
      assert.ok(reporter.entries.length > 0);
      assert.ok(reporter.entries.every((e) => e.file.endsWith('02-b.md')));
    }));

  it('reports an unknown file for the only option', () =>
    withRepo((repo) => {
      const reporter = capture();
      lintProject({ root: repo.root, reporter, only: 'nope.md' });
      assert.deepEqual(codes(reporter), ['E_LINT_FILE']);
    }));

  it('reports a broken rules.json and lints nothing', () =>
    withRepo((repo) => {
      repo.write('content/rules.json', { rules: 'x' });
      repo.write('content/en/01-intro.md', 'Wow!!\n');
      const reporter = capture();
      lintProject({ root: repo.root, reporter });
      assert.deepEqual(view(reporter), [
        {
          level: 'error',
          code: 'E_RULES',
          file: 'content/rules.json',
          field: 'rules',
        },
      ]);
    }));

  it('reports a broken project and lints nothing', () =>
    withRepo((repo) => {
      repo.write('content/en/lang.json', '{');
      const reporter = capture();
      lintProject({ root: repo.root, reporter });
      assert.deepEqual(codes(reporter), ['E_JSON']);
    }));

  it('reports both a broken project and broken rules', () =>
    withRepo((repo) => {
      repo.write('content/en/lang.json', '{');
      repo.write('content/rules.json', '{');
      const reporter = capture();
      lintProject({ root: repo.root, reporter });
      assert.deepEqual(codes(reporter), ['E_JSON', 'E_JSON']);
    }));

  it('lints a draft language by the pattern rules only', () =>
    withRepo((repo) => {
      repo.write('content/de/lang.json', langJson('de', { status: 'draft' }));
      repo.write('content/de/01-intro.md', 'completely different Wow!!\n');
      const reporter = capture();
      lintProject({ root: repo.root, reporter });
      assert.deepEqual(codes(reporter), [
        'E_EXCLAMATION_CHAIN',
        'W_EXCLAMATION_MARK',
      ]);
    }));
});
