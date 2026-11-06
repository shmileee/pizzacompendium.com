import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  compareOutlines,
  outline,
  scan,
  withoutLocalBlocks,
} from '../scripts/lib/parity.mjs';

const outlineOf = (text) => outline(scan(text));
const diff = (a, b) =>
  compareOutlines(outlineOf(a), outlineOf(b)).map((p) => p.rule);

describe('scan', () => {
  it('blanks fenced code in lines and in structure', () => {
    const { lines, structure } = scan('a\n```\n::: x\n```\nb');
    assert.deepEqual(lines, ['a', '', '', '', 'b']);
    assert.deepEqual(structure, ['a', '', '', '', 'b']);
  });

  it('blanks an HTML comment in structure but keeps it in lines', () => {
    const { lines, structure } = scan('a\n<!--\nsecret\n-->\nb');
    assert.deepEqual(lines, ['a', '<!--', 'secret', '-->', 'b']);
    assert.deepEqual(structure, ['a', '', '', '', 'b']);
  });

  it('finds a local block with its lines, info and inLocal flags', () => {
    const text = 'a\n::: local lang=en Title\nbody\n:::\nb';
    const { locals, inLocal } = scan(text);
    assert.deepEqual(locals, [{ start: 1, end: 3, info: 'lang=en Title' }]);
    assert.deepEqual(inLocal, [false, true, true, true, false]);
  });

  it('closes the innermost block: a local block inside another is found', () => {
    const { locals } = scan('::: tip\n::: local lang=en T\nx\n:::\n:::');
    assert.deepEqual(locals, [{ start: 1, end: 3, info: 'lang=en T' }]);
  });

  it('does not count a non-local block, nor a local one that is the outer', () => {
    const { locals, inLocal } = scan('::: tip\nx\n:::');
    assert.deepEqual(locals, []);
    assert.deepEqual(inLocal, [false, false, false]);
  });

  it('ignores a closing fence with nothing open', () => {
    const { locals } = scan(':::\nx');
    assert.deepEqual(locals, []);
  });

  it('leaves an unclosed local block out (it is no block)', () => {
    const { locals, inLocal } = scan('::: local lang=en T\nx');
    assert.deepEqual(locals, []);
    assert.deepEqual(inLocal, [false, false]);
  });

  it('does not see a local marker inside a comment', () => {
    const { locals } = scan('<!--\n::: local lang=en T\n:::\n-->');
    assert.deepEqual(locals, []);
  });

  it('does not see a local marker inside fenced code', () => {
    assert.deepEqual(scan('```\n::: local lang=en T\n:::\n```').locals, []);
  });
});

describe('withoutLocalBlocks', () => {
  it('drops the block and the blank line after it', () => {
    assert.equal(
      withoutLocalBlocks('a\n\n::: local lang=en T\nx\n:::\n\nb\n'),
      'a\n\nb\n',
    );
  });

  it('keeps a following line that is not blank', () => {
    assert.equal(withoutLocalBlocks('::: local lang=en T\nx\n:::\nb'), 'b');
  });

  it('returns a text without local blocks unchanged', () => {
    assert.equal(
      withoutLocalBlocks('a\n::: tip\nx\n:::\n'),
      'a\n::: tip\nx\n:::\n',
    );
  });

  it('drops several blocks', () => {
    assert.equal(
      withoutLocalBlocks(
        '::: local lang=en A\nx\n:::\n\nm\n::: local lang=en B\ny\n:::\n',
      ),
      'm',
    );
  });
});

describe('outline', () => {
  it('counts block fences and names blocks with their sorted attributes', () => {
    const o = outlineOf(
      '::: flour level=beginner img=x.webp #f Title\ntext\n:::\n::: note\n:::',
    );
    assert.equal(o.fences, 4);
    assert.deepEqual(o.blocks, ['flour img=x.webp level=beginner', 'note']);
  });

  it('collects heading ids and levels, and the ids of FAQ items', () => {
    const o = outlineOf(
      '## A {#a}\n\n::: q #faq-1 Question\nx\n:::\n\n### B {#b}\n\n::: q Without id\n:::',
    );
    assert.deepEqual(o.ids, ['a', 'faq-1', 'b']);
    assert.deepEqual(o.headings, ['2:a', '3:b']);
  });

  it('takes an id only from a q block, and a heading id only at the end', () => {
    const o = outlineOf(
      '::: tip #t X\n:::\n## Mid {#m} text\n  ## indented {#i}',
    );
    assert.deepEqual(o.ids, ['i']);
    assert.deepEqual(o.headings, ['2:i']);
  });

  it('ignores a heading with four spaces of indentation (code)', () => {
    assert.deepEqual(outlineOf('    ## X {#x}').ids, []);
  });

  it('counts a level one heading too', () => {
    const o = outlineOf('# A {#a}');
    assert.deepEqual(o.ids, ['a']);
    assert.deepEqual(o.headings, ['1:a']);
  });

  it('counts a table row only when the line starts with a pipe', () => {
    assert.equal(outlineOf('a | b\ntext | more').tableRows, 0);
    assert.equal(outlineOf('| a | b').tableRows, 1);
  });

  it('counts images and links separately', () => {
    const o = outlineOf(
      '![a](img/a.webp) and [b](#b) and [c](#c) ![d](img/d.webp)',
    );
    assert.equal(o.images, 2);
    assert.equal(o.links, 2);
  });

  it('counts table rows and list items', () => {
    const o = outlineOf(
      '| a | b |\n|---|---|\n| 1 | 2 |\n- x\n* y\n1. z\n  - nested\n-notitem\n2.',
    );
    assert.equal(o.tableRows, 3);
    assert.equal(o.listItems, 4);
  });

  it('does not count what is in code, comments or local blocks', () => {
    const o = outlineOf(
      '```\n- x\n[a](#a)\n```\n<!--\n- y\n-->\n::: local lang=en T\n- z\n[l](#l)\n## H {#h}\n:::\n',
    );
    assert.equal(o.listItems, 0);
    assert.equal(o.links, 0);
    assert.equal(o.fences, 0);
    assert.deepEqual(o.ids, []);
  });
});

describe('compareOutlines', () => {
  const base =
    '## A {#a}\n\n- one\n- two\n\n| x |\n\n[l](#a) ![i](img/a.webp)\n\n::: tip\nt\n:::\n';

  it('finds no difference in equal structure with different words', () => {
    assert.deepEqual(
      diff(base, base.replace('one', 'jeden').replace('two', 'dwa')),
      [],
    );
  });

  it('ignores a local block in either text', () => {
    assert.deepEqual(
      diff(base, `${base}\n::: local lang=en Note\n- x\n## H {#h}\n:::\n`),
      [],
    );
  });

  it('reports a different number of block fences', () => {
    assert.deepEqual(diff(base, `${base}::: note\n:::\n`).slice(0, 1), [
      'parity-fences',
    ]);
  });

  it('reports a different number of images', () => {
    assert.deepEqual(diff(base, `${base}![j](img/b.webp)\n`), [
      'parity-images',
    ]);
  });

  it('reports a different number of links', () => {
    assert.deepEqual(diff(base, `${base}[m](#a)\n`), ['parity-links']);
  });

  it('reports a different number of table rows', () => {
    assert.deepEqual(diff(base, `${base}| y |\n`), ['parity-table-rows']);
  });

  it('reports a different number of list items', () => {
    assert.deepEqual(diff(base, `${base}- three\n`), ['parity-list-items']);
  });

  it('does not count an empty bullet as a list item', () => {
    assert.deepEqual(diff(base, `${base}- \n`), []);
  });

  it('reports a block with another attribute, and names the first one', () => {
    const problems = compareOutlines(
      outlineOf('::: tip level=a\n:::\n::: tip\n:::'),
      outlineOf('::: tip\n:::\n::: tip\n:::'),
    );
    assert.deepEqual(
      problems.map((p) => p.rule),
      ['parity-attributes'],
    );
    assert.match(problems[0].message, /block 1/);
  });

  it('does not mind the order the attributes are written in', () => {
    assert.deepEqual(diff('::: tip a=1 b=2\n:::', '::: tip b=2 a=1\n:::'), []);
  });

  it('does not compare titles or the #id of a block', () => {
    assert.deepEqual(diff('::: tip #x One\n:::', '::: tip #y Two\n:::'), []);
  });

  it('reports a missing block at the end as a difference of block 2', () => {
    const problems = compareOutlines(
      outlineOf('::: tip\n:::\n::: note\n:::'),
      outlineOf('::: tip\n:::'),
    );
    assert.ok(problems.some((p) => p.rule === 'parity-attributes'));
    assert.match(
      problems.find((p) => p.rule === 'parity-attributes').message,
      /block 2.*note.*none/,
    );
  });

  it('reports other ids, and their order', () => {
    assert.deepEqual(diff('## A {#a}', '## A {#b}'), [
      'parity-ids',
      'parity-headings',
    ]);
    assert.deepEqual(diff('## A {#a}\n## B {#b}', '## B {#b}\n## A {#a}'), [
      'parity-ids',
      'parity-headings',
    ]);
  });

  it('reports another heading level with the same ids', () => {
    assert.deepEqual(diff('## A {#a}', '### A {#a}'), ['parity-headings']);
  });

  it('reports an FAQ id that is missing', () => {
    assert.deepEqual(diff('::: q #x Q\n:::', '::: q Q\n:::'), ['parity-ids']);
  });
});
