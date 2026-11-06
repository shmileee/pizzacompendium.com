import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  findLeaks,
  splitHeadingId,
  stripTags,
} from '../../scripts/lib/markdown/text.mjs';

describe('stripTags', () => {
  it('drops tags and leaves text and entities alone', () => {
    assert.equal(
      stripTags('<p>a <b class="x">b</b> &amp; &lt;c&gt;</p>'),
      'a b &amp; &lt;c&gt;',
    );
    assert.equal(stripTags('plain'), 'plain');
    assert.equal(stripTags(''), '');
  });
});

describe('splitHeadingId', () => {
  it('splits a title and its id', () => {
    assert.deepEqual(splitHeadingId('Dough {#dough}'), {
      label: 'Dough',
      id: 'dough',
    });
  });

  it('ignores trailing whitespace and the space before the id', () => {
    assert.deepEqual(splitHeadingId('Dough   {#d}  \t'), {
      label: 'Dough',
      id: 'd',
    });
  });

  it('uses the last {# in the text', () => {
    assert.deepEqual(splitHeadingId('A {#a} B {#b}'), {
      label: 'A {#a} B',
      id: 'b',
    });
  });

  it('returns an empty or odd id for the caller to judge', () => {
    assert.deepEqual(splitHeadingId('A {#}'), { label: 'A', id: '' });
    assert.equal(splitHeadingId('A {#mąka}').id, 'mąka');
  });

  it('is null when the text does not end in {#...}', () => {
    assert.equal(splitHeadingId('Dough'), null);
    assert.equal(splitHeadingId('Dough {#a} more'), null);
    assert.equal(splitHeadingId('Dough {#a'), null);
    assert.equal(splitHeadingId('Dough #a}'), null);
    assert.equal(splitHeadingId('Dough {a}'), null);
  });

  it('is null when a brace is inside the id', () => {
    assert.equal(splitHeadingId('A {#a}b}'), null);
  });

  it('keeps a title that is only the id', () => {
    assert.deepEqual(splitHeadingId('{#a}'), { label: '', id: 'a' });
  });

  it('stays fast on a long run of spaces and braces', () => {
    const started = performance.now();
    splitHeadingId(`A${' '.repeat(100_000)}{#${'}'.repeat(100_000)}`);
    splitHeadingId(`{#${'{#'.repeat(50_000)}`);
    assert.ok(performance.now() - started < 1000);
  });
});

describe('findLeaks', () => {
  it('finds nothing in clean HTML', () => {
    assert.deepEqual(findLeaks('<p>fine {braces} and ! marks [x]</p>'), []);
  });

  it('finds a leftover fence at the start of a line, with its text', () => {
    assert.deepEqual(findLeaks('<p>a</p>\n<p>::: tip Title</p>'), [
      { kind: ':::', excerpt: '::: tip Title' },
    ]);
    assert.deepEqual(findLeaks('<p>:::</p>'), [
      { kind: ':::', excerpt: ':::' },
    ]);
    assert.deepEqual(findLeaks('x\n   :::::: y'), [
      { kind: ':::', excerpt: ':::::: y' },
    ]);
  });

  it('does not take a mid-line ::: for a fence', () => {
    assert.deepEqual(findLeaks('<p>a ::: b</p>'), []);
    assert.deepEqual(findLeaks('<p>::</p>'), []);
  });

  it('finds a leftover {#id} and an unrendered image', () => {
    assert.deepEqual(findLeaks('<p>Title {#id}</p>'), [
      { kind: '{#', excerpt: '{#id}' },
    ]);
    assert.deepEqual(findLeaks('<p>![alt](img/a.webp)</p>'), [
      { kind: '![', excerpt: '![alt](img/a.webp)' },
    ]);
  });

  it('reports one entry per kind, in a fixed order', () => {
    const found = findLeaks('<p>![a](b) {#x}\n::: tip');
    assert.deepEqual(
      found.map((leak) => leak.kind),
      [':::', '{#', '!['],
    );
  });

  it('cuts the excerpt at 40 characters', () => {
    const [leak] = findLeaks(`<p>::: ${'x'.repeat(100)}</p>`);
    assert.equal(leak.excerpt.length, 40);
  });

  it('allows code samples to contain the syntax', () => {
    assert.deepEqual(
      findLeaks('<pre><code>::: tip\n{#a} ![x](y)</code></pre>'),
      [],
    );
    assert.deepEqual(
      findLeaks('<p>use <code>{#id}</code> and <code>![a]</code></p>'),
      [],
    );
    assert.deepEqual(
      findLeaks('<pre class="x"><code>::: a</code></pre><p>{#left}</p>').map(
        (l) => l.kind,
      ),
      ['{#'],
    );
  });

  it('looks at the text, not at tags or attributes', () => {
    assert.deepEqual(findLeaks('<a title="{#x}" href="#a">ok</a>'), []);
  });
});
