import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readHistory } from '../scripts/lib/history.mjs';

/**
 * A git that answers from a table: the key is the arguments joined by
 * spaces, a missing key fails the way git does.
 */
function fakeGit(answers) {
  const asked = [];
  const git = (args) => {
    const key = args.join(' ');
    asked.push(key);
    if (!Object.hasOwn(answers, key)) throw new Error(`git ${key}: failed`);
    return answers[key];
  };
  return { git, asked };
}

const SHALLOW = 'rev-parse --is-shallow-repository';
const log = (code) =>
  `log --format=%cI -- content/${code} :(exclude)content/${code}/.sync.json`;

describe('readHistory', () => {
  it('takes the newest commit of a language as modified and the oldest as published', () => {
    const { git, asked } = fakeGit({
      [SHALLOW]: 'false\n',
      [log('pl')]:
        '2026-11-06T22:18:37+01:00\n2026-03-01T10:00:00Z\n2026-01-02T03:04:05-05:00\n',
      [log('en')]: '2026-02-03T04:05:06Z\n',
    });
    const { dates, shallow } = readHistory({ git, codes: ['pl', 'en'] });
    assert.equal(shallow, false);
    assert.deepEqual(Object.fromEntries(dates), {
      pl: {
        modified: '2026-11-06T22:18:37+01:00',
        published: '2026-01-02T03:04:05-05:00',
      },
      en: {
        modified: '2026-02-03T04:05:06Z',
        published: '2026-02-03T04:05:06Z',
      },
    });
    assert.deepEqual(asked, [SHALLOW, log('pl'), log('en')]);
  });

  it('gives no date to a language without commits, and ignores lines that are no date', () => {
    const { git } = fakeGit({
      [SHALLOW]: 'false\n',
      [log('pl')]: '',
      [log('en')]: 'warning: something\n2026-02-03T04:05:06Z\n\n',
    });
    const { dates } = readHistory({ git, codes: ['pl', 'en'] });
    assert.deepEqual([...dates.keys()], ['en']);
    assert.equal(dates.get('en').modified, '2026-02-03T04:05:06Z');
  });

  it('gives no dates from a shallow clone, and says that it is one', () => {
    const { git, asked } = fakeGit({ [SHALLOW]: 'true\n' });
    const { dates, shallow } = readHistory({ git, codes: ['pl'] });
    assert.equal(shallow, true);
    assert.equal(dates.size, 0);
    assert.deepEqual(asked, [SHALLOW]);
  });

  it('gives no dates when git cannot run or is not in a repository', () => {
    const none = readHistory({ git: fakeGit({}).git, codes: ['pl'] });
    assert.deepEqual(none, { dates: new Map(), shallow: false });
  });

  it('gives no dates at all when git fails half way, rather than some', () => {
    const { git } = fakeGit({
      [SHALLOW]: 'false\n',
      [log('pl')]: '2026-02-03T04:05:06Z\n',
    });
    const { dates, shallow } = readHistory({ git, codes: ['pl', 'en'] });
    assert.equal(shallow, false);
    assert.equal(dates.size, 0);
  });
});
