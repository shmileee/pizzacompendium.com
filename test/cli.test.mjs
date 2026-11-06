import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  formatReport,
  parseOptions,
  projectRoot,
} from '../scripts/lib/cli.mjs';

const options = { strict: { type: 'boolean' }, out: { type: 'string' } };
const parse = (argv, env = {}) =>
  parseOptions({ argv, env, options, command: 'run --' });

describe('projectRoot', () => {
  it('is the parent of the script folder by default', () => {
    assert.equal(projectRoot({}, '/a/b/scripts'), '/a/b');
  });

  it('is COMPENDIUM_ROOT when set, made absolute', () => {
    assert.equal(
      projectRoot({ COMPENDIUM_ROOT: '/x/y' }, '/a/scripts'),
      '/x/y',
    );
    assert.equal(
      projectRoot({ COMPENDIUM_ROOT: 'rel' }, '/a/scripts'),
      path.resolve('rel'),
    );
  });

  it('ignores an empty COMPENDIUM_ROOT', () => {
    assert.equal(projectRoot({ COMPENDIUM_ROOT: '' }, '/a/scripts'), '/a');
  });
});

describe('parseOptions', () => {
  it('parses the own options and defaults the format to text', () => {
    assert.deepEqual(
      { ...parse(['--strict', '--out', 'o']).values },
      { strict: true, out: 'o', format: 'text' },
    );
  });

  it('defaults the format to github inside GitHub Actions', () => {
    assert.equal(parse([], { GITHUB_ACTIONS: 'true' }).values.format, 'github');
    assert.equal(parse([], { GITHUB_ACTIONS: 'false' }).values.format, 'text');
  });

  it('takes an explicit format over the environment', () => {
    const { values } = parse(['--format', 'json'], { GITHUB_ACTIONS: 'true' });
    assert.equal(values.format, 'json');
  });

  it('returns a message, never throws, for an unknown format', () => {
    const { error, values } = parse(['--format', 'xml']);
    assert.equal(values, undefined);
    assert.match(error, /--format must be one of text, github, json/);
  });

  for (const format of ['constructor', 'toString', '__proto__']) {
    it(`refuses --format ${format}, an inherited property name`, () => {
      const { error, values } = parse(['--format', format]);
      assert.equal(values, undefined);
      assert.match(error, /--format must be one of/);
    });
  }

  it('returns a message with the usage for an unknown option', () => {
    const { error } = parse(['--nope']);
    assert.match(
      error,
      /Usage: run -- \[--strict\] \[--out <out>\] \[--format <text\|github\|json>\]/,
    );
  });

  it('returns a message for a missing value', () => {
    assert.ok(parse(['--out']).error);
  });
});

describe('formatReport', () => {
  const error = { level: 'error', code: 'E_A', message: 'm' };
  const warning = { level: 'warning', code: 'W_A', message: 'w' };

  it('prints text on stderr and the machine formats on stdout', () => {
    assert.equal(formatReport([error], { format: 'text' }).method, 'error');
    assert.equal(formatReport([error], { format: 'github' }).method, 'log');
    assert.equal(formatReport([error], { format: 'json' }).method, 'log');
  });

  it('formats every entry, one per line', () => {
    const { text } = formatReport([error, warning], { format: 'text' });
    assert.equal(text.split('\n').length, 2);
  });

  it('prints nothing when there is nothing to show', () => {
    assert.equal(formatReport([], { format: 'text' }), null);
    assert.equal(formatReport([], { format: 'github' }), null);
  });

  it('quiet hides warnings but keeps errors', () => {
    assert.equal(
      formatReport([warning], { format: 'text', quiet: true }),
      null,
    );
    const { text } = formatReport([warning, error], {
      format: 'text',
      quiet: true,
    });
    assert.match(text, /E_A/);
    assert.doesNotMatch(text, /W_A/);
  });

  it('json is a complete document even when empty or quiet', () => {
    assert.equal(formatReport([], { format: 'json' }).text, '[]');
    const { text } = formatReport([warning], { format: 'json', quiet: true });
    assert.deepEqual(JSON.parse(text), []);
  });
});
