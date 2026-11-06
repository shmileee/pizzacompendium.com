import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isFarDown, isFarJump } from '../../src/js/progress.js';

describe('isFarDown', () => {
  it('is true past one and a half screens', () => {
    assert.equal(isFarDown(1501, 1000), true);
    assert.equal(isFarDown(1500, 1000), false);
    assert.equal(isFarDown(0, 1000), false);
  });
});

describe('isFarJump', () => {
  it('is true for more than a screen in either direction', () => {
    assert.equal(isFarJump(1001, 1000), true);
    assert.equal(isFarJump(-1001, 1000), true);
  });

  it('is false for a screen or less', () => {
    assert.equal(isFarJump(1000, 1000), false);
    assert.equal(isFarJump(-1000, 1000), false);
    assert.equal(isFarJump(0, 1000), false);
  });
});
