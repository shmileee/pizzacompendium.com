import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  classifyLines,
  createLineClassifier,
} from '../../scripts/lib/markdown/fences.mjs';

const kinds = (text) => classifyLines(text.split('\n'));

describe('classifyLines: fenced code', () => {
  it('marks a backtick fence, its lines and its closing line as code', () => {
    assert.deepEqual(kinds('a\n```\nb\n```\nc'), [
      'text',
      'code',
      'code',
      'code',
      'text',
    ]);
  });

  it('opens a fence whose info string holds a line separator', () => {
    assert.deepEqual(kinds('```a\u2028b\nx\n```'), ['code', 'code', 'code']);
  });

  it('marks a tilde fence the same way', () => {
    assert.deepEqual(kinds('~~~\nb\n~~~\nc'), ['code', 'code', 'code', 'text']);
  });

  it('closes only with the same character', () => {
    assert.deepEqual(kinds('```\n~~~\nx\n```\ny'), [
      'code',
      'code',
      'code',
      'code',
      'text',
    ]);
    assert.deepEqual(kinds('~~~\n```\nx\n~~~\ny'), [
      'code',
      'code',
      'code',
      'code',
      'text',
    ]);
  });

  it('closes only with a fence at least as long as the opening one', () => {
    assert.deepEqual(kinds('````\n```\nx\n````\ny'), [
      'code',
      'code',
      'code',
      'code',
      'text',
    ]);
    assert.deepEqual(kinds('```\nx\n`````\ny'), [
      'code',
      'code',
      'code',
      'text',
    ]);
  });

  it('does not close on a line that has text after the fence', () => {
    assert.deepEqual(kinds('```\n``` js\nx\n```\ny'), [
      'code',
      'code',
      'code',
      'code',
      'text',
    ]);
    assert.deepEqual(kinds('```\n```   \ny'), ['code', 'code', 'text']);
  });

  it('allows an info string on the opening line', () => {
    assert.deepEqual(kinds('```js title="x"\n:::\n```\n:::'), [
      'code',
      'code',
      'code',
      'text',
    ]);
    assert.deepEqual(kinds('~~~ a`b\nx\n~~~\n'), [
      'code',
      'code',
      'code',
      'text',
    ]);
  });

  it('does not open a backtick fence whose info string has a backtick', () => {
    assert.deepEqual(kinds('```code``` inline\nnext'), ['text', 'text']);
    assert.deepEqual(kinds('``` a`b\nnext'), ['text', 'text']);
  });

  it('allows up to three spaces of indentation, not four', () => {
    assert.deepEqual(kinds('   ```\nx\n   ```\ny'), [
      'code',
      'code',
      'code',
      'text',
    ]);
    assert.deepEqual(kinds('    ```\nx'), ['text', 'text']);
  });

  it('needs three marks', () => {
    assert.deepEqual(kinds('``\nx'), ['text', 'text']);
    assert.deepEqual(kinds('~~\nx'), ['text', 'text']);
  });

  it('runs an unclosed fence to the end', () => {
    assert.deepEqual(kinds('```\na\nb'), ['code', 'code', 'code']);
  });
});

describe('classifyLines: HTML comments', () => {
  it('marks a one-line comment', () => {
    assert.deepEqual(kinds('<!-- x -->\nb'), ['comment', 'text']);
  });

  it('marks a comment up to the first line that holds the end', () => {
    assert.deepEqual(kinds('<!--\na\nb -->\nc'), [
      'comment',
      'comment',
      'comment',
      'text',
    ]);
  });

  it('runs an unclosed comment to the end', () => {
    assert.deepEqual(kinds('<!--\na\nb'), ['comment', 'comment', 'comment']);
  });

  it('allows up to three spaces before the opening, not four', () => {
    assert.deepEqual(kinds('   <!-- x -->'), ['comment']);
    assert.deepEqual(kinds('    <!-- x -->'), ['text']);
    assert.deepEqual(kinds('a <!-- x -->'), ['text']);
  });

  it('treats a fence inside a comment as text of the comment', () => {
    assert.deepEqual(kinds('<!--\n```\n-->\nx'), [
      'comment',
      'comment',
      'comment',
      'text',
    ]);
  });

  it('treats a comment inside a fence as code', () => {
    assert.deepEqual(kinds('```\n<!--\n```\nx'), [
      'code',
      'code',
      'code',
      'text',
    ]);
  });
});

describe('createLineClassifier', () => {
  it('keeps its state between calls and is independent per instance', () => {
    const one = createLineClassifier();
    const two = createLineClassifier();
    assert.equal(one('```'), 'code');
    assert.equal(two('x'), 'text');
    assert.equal(one('x'), 'code');
    assert.equal(two('x'), 'text');
  });
});
