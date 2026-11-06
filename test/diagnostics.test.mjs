import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createReporter,
  FORMATS,
  formatGithub,
  formatJson,
  formatText,
  reportProblems,
  summarize,
  visible,
} from '../scripts/lib/diagnostics.mjs';

describe('createReporter', () => {
  it('records an error with its place', () => {
    const reporter = createReporter();
    reporter.error('E_X', 'bad', { file: 'a.md', line: 3, field: 'f' });
    assert.deepEqual(reporter.entries, [
      {
        level: 'error',
        code: 'E_X',
        message: 'bad',
        file: 'a.md',
        line: 3,
        field: 'f',
      },
    ]);
  });

  it('records an error without a place', () => {
    const reporter = createReporter();
    reporter.error('E_X', 'bad');
    assert.deepEqual(reporter.entries, [
      { level: 'error', code: 'E_X', message: 'bad' },
    ]);
  });

  it('records a warning as a warning that does not fail', () => {
    const reporter = createReporter();
    reporter.warn('W_X', 'hm');
    assert.equal(reporter.entries[0].level, 'warning');
    assert.equal(reporter.hasErrors(), false);
  });

  it('records a warning as an error, keeping its code, when strict', () => {
    const reporter = createReporter({ strict: true });
    reporter.warn('W_X', 'hm');
    assert.equal(reporter.entries[0].level, 'error');
    assert.equal(reporter.entries[0].code, 'W_X');
    assert.equal(reporter.hasErrors(), true);
  });

  it('has no errors when empty and has errors after one', () => {
    const reporter = createReporter();
    assert.equal(reporter.hasErrors(), false);
    reporter.error('E_X', 'bad');
    assert.equal(reporter.hasErrors(), true);
  });
});

describe('reportProblems', () => {
  it('reports one error per problem and returns false', () => {
    const reporter = createReporter();
    const ok = reportProblems(
      reporter,
      'E_P',
      [
        { field: 'a', message: 'one' },
        { field: 'b', message: 'two' },
      ],
      'x.json',
    );
    assert.equal(ok, false);
    assert.deepEqual(
      reporter.entries.map(({ code, file, field }) => [code, file, field]),
      [
        ['E_P', 'x.json', 'a'],
        ['E_P', 'x.json', 'b'],
      ],
    );
  });

  it('returns true and reports nothing when there are no problems', () => {
    const reporter = createReporter();
    assert.equal(reportProblems(reporter, 'E_P', [], 'x.json'), true);
    assert.deepEqual(reporter.entries, []);
  });
});

describe('summarize', () => {
  it('counts errors and warnings apart', () => {
    assert.deepEqual(
      summarize([
        { level: 'error' },
        { level: 'warning' },
        { level: 'warning' },
      ]),
      { errors: 1, warnings: 2 },
    );
    assert.deepEqual(summarize([]), { errors: 0, warnings: 0 });
  });
});

describe('visible', () => {
  it('shows control and invisible characters as \\uXXXX', () => {
    assert.equal(visible('a\u001b[2Jb'), 'a\\u001b[2Jb');
    assert.equal(visible('x‮y'), 'x\\u202ey');
    assert.equal(visible('a\nb'), 'a\\u000ab');
  });

  it('leaves ordinary text, accents and emoji alone', () => {
    assert.equal(visible('Żółć – pizza'), 'Żółć – pizza');
  });
});

describe('formatText', () => {
  it('writes the level, place, message and code', () => {
    assert.deepEqual(
      formatText([
        { level: 'error', code: 'E_A', message: 'm', file: 'f.md', line: 2 },
        { level: 'warning', code: 'W_B', message: 'n', file: 'g.md' },
        { level: 'error', code: 'E_C', message: 'o' },
      ]),
      [
        'error:   f.md:2: m [E_A]',
        'warning: g.md: n [W_B]',
        'error:   o [E_C]',
      ],
    );
  });

  it('cannot be used to inject terminal escapes', () => {
    const [line] = formatText([
      { level: 'error', code: 'E_A', message: 'x\u001b[2J', file: 'a\u001bb' },
    ]);
    assert.ok(!line.includes('\u001b'));
  });
});

describe('formatGithub', () => {
  it('writes workflow commands with file, line and title', () => {
    assert.deepEqual(
      formatGithub([
        { level: 'error', code: 'E_A', message: 'm', file: 'f.md', line: 2 },
        { level: 'warning', code: 'W_B', message: 'n' },
      ]),
      ['::error file=f.md,line=2,title=E_A::m', '::warning title=W_B::n'],
    );
  });

  it('escapes what would end or split a command, line breaks as \\uXXXX', () => {
    const [line] = formatGithub([
      {
        level: 'error',
        code: 'E_A',
        message: '100%\r\nnext',
        file: 'a:b,c.md',
      },
    ]);
    assert.equal(
      line,
      '::error file=a%3Ab%2Cc.md,title=E_A::100%25\\u000d\\u000anext',
    );
  });
});

describe('formatJson', () => {
  it('is one complete JSON document, [] when empty', () => {
    assert.deepEqual(JSON.parse(formatJson([]).join('\n')), []);
    const entries = [{ level: 'error', code: 'E_A', message: 'm' }];
    assert.deepEqual(JSON.parse(formatJson(entries)[0]), entries);
  });
});

describe('FORMATS', () => {
  it('names exactly the three formatters', () => {
    assert.deepEqual(FORMATS, {
      text: formatText,
      github: formatGithub,
      json: formatJson,
    });
  });
});
