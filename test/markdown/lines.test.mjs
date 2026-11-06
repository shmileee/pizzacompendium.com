import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Marked } from 'marked';
import { containerExtension } from '../../scripts/lib/markdown/containers.mjs';
import { lineInBlock, stampLines } from '../../scripts/lib/markdown/lines.mjs';

const lexer = new Marked({
  gfm: true,
  extensions: [containerExtension(() => '')],
});

/** The stamped tokens of a document. */
function stamp(src) {
  const tokens = lexer.lexer(src);
  stampLines(tokens, 1);
  return tokens;
}

const lineOf = (tokens, type) => tokens.find((t) => t.type === type).line;

describe('stampLines: top level', () => {
  it('numbers blocks from 1 by the newlines of everything before', () => {
    const tokens = stamp('# A\n\ntext\ntext 2\n\n## B\n\nlast\n');
    const lines = tokens
      .filter((t) => t.type !== 'space')
      .map((t) => [t.type, t.line]);
    assert.deepEqual(lines, [
      ['heading', 1],
      ['paragraph', 3],
      ['heading', 6],
      ['paragraph', 8],
    ]);
  });

  it('starts at the line it is given', () => {
    const tokens = lexer.lexer('a\n\nb\n');
    stampLines(tokens, 10);
    assert.deepEqual(
      tokens.filter((t) => t.type === 'paragraph').map((t) => t.line),
      [10, 12],
    );
  });

  it('puts every token a line, even an empty document', () => {
    assert.equal(stamp('').length, 0);
    assert.equal(stamp('x')[0].line, 1);
  });

  it('keeps counting through a fenced code block', () => {
    const tokens = stamp('```\na\nb\n```\n\nafter\n');
    assert.equal(lineOf(tokens, 'code'), 1);
    assert.equal(lineOf(tokens, 'paragraph'), 6);
  });
});

describe('stampLines: nested tokens', () => {
  it('numbers list items by their own lines', () => {
    const tokens = stamp('intro\n\n- one\n- two\n- three\n');
    const found = tokens.find((t) => t.type === 'list');
    assert.equal(found.line, 3);
    assert.deepEqual(
      found.items.map((i) => i.line),
      [3, 4, 5],
    );
    assert.deepEqual(
      found.items.map((i) => i.tokens[0].line),
      [3, 4, 5],
    );
  });

  it('numbers a multi-line list item and the one after it', () => {
    const tokens = stamp('- a\n\n  more\n- b\n');
    const items = tokens.find((t) => t.type === 'list').items;
    assert.equal(items[0].line, 1);
    assert.equal(items[1].line, 4);
  });

  it('numbers the content of a quote', () => {
    const tokens = stamp('x\n\n> q1\n>\n> q2\n');
    const quote = tokens.find((t) => t.type === 'blockquote');
    assert.equal(quote.line, 3);
    assert.deepEqual(
      quote.tokens.filter((t) => t.type === 'paragraph').map((t) => t.line),
      [3, 5],
    );
  });

  it('never puts a token after the last line of its block', () => {
    const tokens = stamp('> a\nb\n\nafter\n');
    const quote = tokens[0];
    const end = quote.line + quote.raw.trimEnd().split('\n').length - 1;
    assert.ok(quote.tokens.length > 0);
    for (const token of quote.tokens) assert.ok(token.line <= end);
    assert.equal(tokens.find((t) => t.type === 'paragraph').line, 4);
  });

  it('numbers table header and rows', () => {
    const tokens = stamp('t\n\n| a | b |\n| - | - |\n| 1 | 2 |\n| 3 | 4 |\n');
    const table = tokens.find((t) => t.type === 'table');
    assert.equal(table.line, 3);
    assert.deepEqual(
      table.header.map((c) => c.tokens[0].line),
      [3, 3],
    );
    assert.deepEqual(
      table.rows.map((row) => row[0].tokens[0].line),
      [5, 6],
    );
    assert.deepEqual(
      table.rows.map((row) => row[1].tokens[0].line),
      [5, 6],
    );
  });
});

describe('stampLines: containers', () => {
  it('starts the body of a container below its opening line', () => {
    const tokens = stamp('text\n\n::: tip\nbody\n\nmore\n:::\n\nafter\n');
    const block = tokens.find((t) => t.type === 'container');
    assert.equal(block.line, 3);
    assert.deepEqual(
      block.tokens.filter((t) => t.type === 'paragraph').map((t) => t.line),
      [4, 6],
    );
    assert.equal(tokens.find((t) => t.raw.startsWith('after')).line, 9);
  });

  it('numbers nested containers and what is after them', () => {
    const tokens = stamp(
      ':::: flours\n::: flour a=b One\n- x\n:::\n::: flour a=c Two\n- y\n:::\n::::\n\nend\n',
    );
    const outer = tokens[0];
    const inner = outer.tokens.filter((t) => t.type === 'container');
    assert.deepEqual(
      inner.map((t) => t.line),
      [2, 5],
    );
    assert.deepEqual(
      inner.map((t) => t.tokens[0].items[0].line),
      [3, 6],
    );
    assert.equal(tokens.find((t) => t.raw.startsWith('end')).line, 10);
  });

  it('numbers a container in a list item', () => {
    const tokens = stamp('1. Step\n   ::: tip\n   Keep.\n   :::\n2. Next\n');
    const items = tokens[0].items;
    assert.equal(items[1].line, 5);
    const block = items[0].tokens.find((t) => t.type === 'container');
    assert.equal(block.line, 2);
  });

  it('numbers an unclosed container by its lines', () => {
    const tokens = stamp('a\n\n::: tip\nx\n\ny\n');
    const block = tokens.find((t) => t.type === 'container');
    assert.deepEqual(
      block.tokens.filter((t) => t.type === 'paragraph').map((t) => t.line),
      [4, 6],
    );
  });

  it('numbers a stray closer', () => {
    const tokens = stamp('a\n\n:::\n\nb\n');
    assert.equal(tokens.find((t) => t.stray).line, 3);
    assert.equal(tokens.filter((t) => t.type === 'paragraph').at(-1).line, 5);
  });
});

describe('lineInBlock', () => {
  const src =
    'intro\n\nfirst line\nsecond NEEDLE line\nthird\n\nafter NEEDLE\n';
  const lines = src.split('\n');
  const tokens = stamp(src);
  const block = tokens.find((t) => t.raw.startsWith('first'));

  it('gives the block line for a needle on the line right after it', () => {
    const text = '# head\nNEEDLE\n';
    const heading = stamp(text).find((t) => t.type === 'heading');
    assert.equal(
      lineInBlock(text.split('\n'), heading, 'NEEDLE'),
      heading.line,
    );
  });

  it('finds the first line of the block that holds the text', () => {
    assert.equal(lineInBlock(lines, block, 'NEEDLE'), 4);
    assert.equal(lineInBlock(lines, block, 'first'), 3);
    assert.equal(lineInBlock(lines, block, 'third'), 5);
  });

  it('does not look past the block', () => {
    assert.equal(lineInBlock(lines, tokens[0], 'NEEDLE'), 1);
  });

  it('falls back to the first line of the block', () => {
    assert.equal(lineInBlock(lines, block, 'absent'), 3);
  });

  it('ignores the newlines that end the block', () => {
    const one = { line: 1, raw: 'a\n\n\n' };
    assert.equal(lineInBlock(['a', '', '', 'NEEDLE'], one, 'NEEDLE'), 1);
  });
});
