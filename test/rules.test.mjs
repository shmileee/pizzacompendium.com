import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { compileRules, loadRules } from '../scripts/lib/rules.mjs';
import { capture, view } from './helpers/capture.mjs';
import { createRepo, rulesJson, withRepo } from './helpers/repo.mjs';

const good = (over = {}) => ({
  id: 'one',
  level: 'error',
  message: 'm',
  patterns: ['x'],
  ...over,
});
const fields = (data) => compileRules(data).problems.map((p) => p.field);

describe('compileRules', () => {
  it('compiles the default rules without problems', () => {
    const { set, problems } = compileRules(rulesJson());
    assert.deepEqual(problems, []);
    assert.equal(set.rules.length, rulesJson().rules.length);
  });

  it('gives every pattern its own global regexp and the rule its settings', () => {
    const { set, problems } = compileRules({
      views: { v: [{ replace: 'a', with: 'b' }], w: ['v'] },
      rules: [
        good({
          patterns: ['a', 'b'],
          flags: 'i',
          view: 'w',
          languages: ['en'],
          localExempt: true,
          acrossLines: true,
          skip: '^s',
          allow: ['ok'],
        }),
        good({ id: 'two', level: 'warning' }),
      ],
    });
    assert.deepEqual(problems, []);
    const [one, two] = set.rules;
    assert.equal(one.regexps.length, 2);
    assert.equal(one.regexps[0].flags, 'gi');
    assert.equal(one.view, 'w');
    assert.deepEqual([...one.languages], ['en']);
    assert.equal(one.localExempt, true);
    assert.equal(one.acrossLines, true);
    assert.equal(one.skip.flags, 'i');
    assert.deepEqual([...one.allow], ['ok']);
    assert.equal(two.level, 'warning');
    assert.equal(two.view, null);
    assert.equal(two.languages, null);
    assert.equal(two.localExempt, false);
    assert.equal(two.acrossLines, false);
    assert.equal(two.skip, null);
    assert.equal(two.regexps[0].flags, 'g');
    assert.equal(two.allow.size, 0);
    const [[re, text]] = set.views.get('w');
    assert.equal(re.source, 'a');
    assert.equal(re.flags, 'g');
    assert.equal(text, 'b');
    assert.equal(set.views.get('w').length, 1);
  });

  it('a view built on another one has the steps of both', () => {
    const { set } = compileRules({
      views: {
        a: [{ replace: 'a', with: '' }],
        b: ['a', { replace: 'b', with: '' }],
      },
      rules: [],
    });
    assert.equal(set.views.get('b').length, 2);
  });

  for (const [name, data] of [
    ['null', null],
    ['an array', []],
    ['a missing rules list', { views: {} }],
    ['rules that are not a list', { rules: {} }],
  ])
    it(`reports ${name} as one problem on "rules"`, () => {
      assert.deepEqual(fields(data), ['rules']);
    });

  it('reports a rule that is not an object', () => {
    assert.deepEqual(fields({ rules: ['x'] }), ['rules[0]']);
  });

  for (const id of ['A', 'a_b', 'a--b', '-a', 'a-', 'a b', '', 'a.b'])
    it(`reports the id ${JSON.stringify(id)}`, () => {
      assert.deepEqual(fields({ rules: [good({ id })] }), [`rules.${id}.id`]);
    });

  it('accepts ids of lower-case words, digits and single hyphens', () => {
    assert.deepEqual(fields({ rules: [good({ id: 'a1-b2-c' })] }), []);
  });

  it('reports a bad id, with the field of the id', () => {
    assert.deepEqual(fields({ rules: [good({ id: 'Bad_Id' })] }), [
      'rules.Bad_Id.id',
    ]);
    assert.deepEqual(fields({ rules: [good({ id: undefined })] }), [
      'rules.rules[0].id',
    ]);
  });

  it('reports an unknown key', () => {
    assert.deepEqual(fields({ rules: [good({ colour: 1 })] }), [
      'rules.one.colour',
    ]);
  });

  for (const [key, value] of [
    ['level', 'info'],
    ['message', ''],
    ['message', 5],
    ['patterns', []],
    ['patterns', 'x'],
    ['patterns', [1]],
    ['patterns', ['ok', 5]],
    ['flags', 'g'],
    ['flags', 'x'],
    ['view', 'nope'],
    ['languages', 'en'],
    ['languages', [1]],
    ['languages', ['en', 1]],
    ['localExempt', 'yes'],
    ['acrossLines', 1],
    ['skip', 1],
    ['allow', 'a'],
    ['allow', [1]],
    ['allow', ['a', 1]],
  ])
    it(`reports ${key} = ${JSON.stringify(value)}`, () => {
      assert.deepEqual(fields({ rules: [good({ [key]: value })] }), [
        `rules.one.${key}`,
      ]);
    });

  it('reports a rule without a level', () => {
    assert.deepEqual(fields({ rules: [good({ level: undefined })] }), [
      'rules.one.level',
    ]);
  });

  it('reports several problems of one rule, all of them', () => {
    assert.deepEqual(
      fields({ rules: [good({ level: 'x', message: '', colour: 1 })] }),
      ['rules.one.colour', 'rules.one.level', 'rules.one.message'],
    );
  });

  it('reports an invalid regex in patterns, once per bad pattern', () => {
    const { problems, set } = compileRules({
      rules: [good({ patterns: ['(', 'ok', '['] })],
    });
    assert.deepEqual(
      problems.map((p) => p.field),
      ['rules.one.patterns', 'rules.one.patterns'],
    );
    assert.equal(set.rules.length, 0);
  });

  it('reports an invalid regex in skip, and a pattern that is fine', () => {
    const { problems, set } = compileRules({
      rules: [good({ skip: '(' })],
    });
    assert.deepEqual(
      problems.map((p) => p.field),
      ['rules.one.skip'],
    );
    assert.equal(set.rules.length, 0);
  });

  it('applies every flag to the pattern and the skip regexp', () => {
    const { set } = compileRules({
      rules: [good({ flags: 'imsu', skip: 'y' })],
    });
    assert.equal(set.rules[0].regexps[0].flags, 'gimsu');
    assert.equal(set.rules[0].skip.flags, 'imsu');
  });

  it('reports a duplicate id', () => {
    assert.deepEqual(fields({ rules: [good(), good()] }), ['rules.one']);
  });

  for (const value of ['x', 5, {}, null])
    it(`reports the view ${JSON.stringify(value)} that is not a list`, () => {
      assert.deepEqual(fields({ views: { v: value }, rules: [] }), ['views.v']);
    });

  it('reports an unknown view name inside a view, even one defined later', () => {
    assert.deepEqual(
      fields({
        views: { a: ['b'], b: [{ replace: 'x', with: '' }] },
        rules: [],
      }),
      ['views.a'],
    );
  });

  for (const step of [
    5,
    {},
    { replace: 'a' },
    { with: 'a' },
    { replace: 1, with: '' },
    { replace: 'a', with: 1 },
  ])
    it(`reports the step ${JSON.stringify(step)} of a view`, () => {
      assert.deepEqual(fields({ views: { v: [step] }, rules: [] }), [
        'views.v',
      ]);
    });

  it('reports an invalid regex in a view step', () => {
    assert.deepEqual(
      fields({ views: { v: [{ replace: '(', with: '' }] }, rules: [] }),
      ['views.v'],
    );
  });
});

describe('loadRules', () => {
  it('returns the compiled rules of content/rules.json', () =>
    withRepo((repo) => {
      const reporter = capture();
      const set = loadRules({ root: repo.root, reporter });
      assert.equal(set.rules.length, rulesJson().rules.length);
      assert.deepEqual(reporter.entries, []);
    }));

  it('reports every problem as E_RULES with the file and the field', () =>
    withRepo((repo) => {
      repo.editJson('content/rules.json', (data) => {
        data.rules[0].level = 'x';
        data.rules[1].colour = 1;
      });
      const reporter = capture();
      assert.equal(loadRules({ root: repo.root, reporter }), null);
      assert.deepEqual(view(reporter), [
        {
          level: 'error',
          code: 'E_RULES',
          file: 'content/rules.json',
          field: 'rules.exclamation-chain.level',
        },
        {
          level: 'error',
          code: 'E_RULES',
          file: 'content/rules.json',
          field: 'rules.external-link.colour',
        },
      ]);
    }));

  it('reports a file that is not JSON (E_JSON) and returns null', () => {
    const repo = createRepo({ 'content/rules.json': '{' });
    try {
      const reporter = capture();
      assert.equal(loadRules({ root: repo.root, reporter }), null);
      assert.deepEqual(
        reporter.entries.map((e) => e.code),
        ['E_JSON'],
      );
    } finally {
      repo.cleanup();
    }
  });

  it('reports a missing file (E_READ) and returns null', () => {
    const repo = createRepo({ 'content/rules.json': null });
    try {
      const reporter = capture();
      assert.equal(loadRules({ root: repo.root, reporter }), null);
      assert.deepEqual(
        reporter.entries.map((e) => e.code),
        ['E_READ'],
      );
    } finally {
      repo.cleanup();
    }
  });
});
