import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  parseFenceLine,
  parseInfo,
} from '../../scripts/lib/markdown/container-syntax.mjs';

describe('parseFenceLine', () => {
  it('reads a line of three or more colons as a closing fence', () => {
    assert.deepEqual(parseFenceLine(':::'), { kind: 'close', colons: 3 });
    assert.deepEqual(parseFenceLine('::::'), { kind: 'close', colons: 4 });
    assert.deepEqual(parseFenceLine(':::   \t'), { kind: 'close', colons: 3 });
  });

  it('reads a name after the colons as an opening fence', () => {
    assert.deepEqual(parseFenceLine('::: tip'), {
      kind: 'open',
      colons: 3,
      name: 'tip',
      info: '',
    });
    assert.deepEqual(parseFenceLine(':::::note Title here'), {
      kind: 'open',
      colons: 5,
      name: 'note',
      info: 'Title here',
    });
  });

  it('keeps the attributes and the title as info, trimmed', () => {
    assert.deepEqual(parseFenceLine('::: local lang=en  #x Title \t'), {
      kind: 'open',
      colons: 3,
      name: 'local',
      info: 'lang=en  #x Title',
    });
  });

  it('is no fence when there are fewer than three colons', () => {
    assert.equal(parseFenceLine('::'), null);
    assert.equal(parseFenceLine(': tip'), null);
  });

  it('is no fence when the line does not start with the colons', () => {
    assert.equal(parseFenceLine(' ::: tip'), null);
    assert.equal(parseFenceLine('text ::: tip'), null);
    assert.equal(parseFenceLine(''), null);
  });

  it('is no fence when the name starts with a colon', () => {
    assert.equal(parseFenceLine('::: :tip'), null);
  });

  it('accepts a name written right after the colons', () => {
    assert.equal(parseFenceLine(':::tip')?.name, 'tip');
  });

  it('is no fence when a no-break space follows the colons or the name', () => {
    // Only a space or a tab separates the parts of the line.
    assert.equal(parseFenceLine(':::\u00a0tip'), null);
    assert.equal(parseFenceLine('::: tip\u00a0Title'), null);
    assert.equal(parseFenceLine('::: tip\u2003Title'), null);
  });

  it('allows names that start with a dash or a dot', () => {
    assert.equal(parseFenceLine('::: -x')?.name, '-x');
    assert.equal(parseFenceLine('::: .x')?.name, '.x');
  });

  it('reads a line with very long runs of blanks', () => {
    const line = `::: tip${' '.repeat(100000)}x${' '.repeat(100000)}`;
    assert.equal(parseFenceLine(line)?.info, 'x');
  });
});

describe('parseInfo', () => {
  it('reads leading attributes and the rest as the title', () => {
    assert.deepEqual(parseInfo('#faq img=x.webp level=beginner The title'), {
      attrs: { id: 'faq', img: 'x.webp', level: 'beginner' },
      title: 'The title',
    });
  });

  it('reads a block with only a title', () => {
    assert.deepEqual(parseInfo('Just a title'), {
      attrs: {},
      title: 'Just a title',
    });
  });

  it('trims the title', () => {
    assert.equal(parseInfo('a=1 Title  ').title, 'Title');
    assert.equal(parseInfo('  Title ').title, 'Title');
  });

  it('reads an empty info', () => {
    assert.deepEqual(parseInfo(''), { attrs: {}, title: '' });
  });

  it('reads attributes only, with an empty title', () => {
    assert.deepEqual(parseInfo('lang=en #a'), {
      attrs: { lang: 'en', id: 'a' },
      title: '',
    });
  });

  it('takes an attribute only before the title: later ones are text', () => {
    assert.deepEqual(parseInfo('Title lang=en #x'), {
      attrs: {},
      title: 'Title lang=en #x',
    });
  });

  it('does not take id=x as an attribute: the id is written #id', () => {
    assert.deepEqual(parseInfo('id=x Title'), {
      attrs: {},
      title: 'id=x Title',
    });
    assert.deepEqual(parseInfo('#a id=b'), {
      attrs: { id: 'a' },
      title: 'id=b',
    });
  });

  it('does not take a key without a value, or a lone # or =', () => {
    assert.equal(parseInfo('key= x').title, 'key= x');
    assert.equal(parseInfo('# x').title, '# x');
    assert.equal(parseInfo('=v x').title, '=v x');
  });

  it('lets the last of two equal keys win and keeps = inside a value', () => {
    assert.deepEqual(parseInfo('a=1 a=2 b=x=y T').attrs, { a: '2', b: 'x=y' });
  });

  it('separates attributes by any run of whitespace', () => {
    assert.deepEqual(parseInfo('a=1\t\t#z   T'), {
      attrs: { a: '1', id: 'z' },
      title: 'T',
    });
  });
});
