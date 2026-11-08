import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as blocks from '../../scripts/lib/blocks/index.mjs';

describe('the block registry', () => {
  it('exports every block under its own name, with its HTML and its Markdown', () => {
    assert.deepEqual(Object.keys(blocks).sort(), [
      'flour',
      'flours',
      'gallery',
      'local',
      'note',
      'q',
      'recipe',
      'tip',
      'warning',
    ]);
    for (const [key, block] of Object.entries(blocks)) {
      assert.equal(block.name, key);
      assert.equal(typeof block.render, 'function', key);
      assert.equal(typeof block.markdown, 'function', key);
    }
  });
});
