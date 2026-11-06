import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  figureClass,
  SMALL_IMAGE_WIDTH,
  shapeOf,
} from '../../scripts/lib/markdown/shape.mjs';

describe('shapeOf', () => {
  it('is portrait below a ratio of 0.9', () => {
    assert.equal(shapeOf(89, 100), 'portrait');
    assert.equal(shapeOf(1, 100), 'portrait');
  });
  it('is square from 0.9 to 1.15, both included', () => {
    assert.equal(shapeOf(90, 100), 'square');
    assert.equal(shapeOf(100, 100), 'square');
    assert.equal(shapeOf(115, 100), 'square');
  });
  it('is landscape above 1.15 up to 1.7, 1.7 included', () => {
    assert.equal(shapeOf(116, 100), 'landscape');
    assert.equal(shapeOf(170, 100), 'landscape');
  });
  it('is wide above 1.7', () => {
    assert.equal(shapeOf(171, 100), 'wide');
    assert.equal(shapeOf(1000, 10), 'wide');
  });
});

describe('figureClass', () => {
  it('names the photo and its shape', () => {
    assert.equal(
      figureClass({ width: 960, height: 640, alpha: false }),
      'photo photo-landscape',
    );
  });
  it('adds photo-cutout for an alpha channel', () => {
    assert.equal(
      figureClass({ width: 960, height: 960, alpha: true }),
      'photo photo-square photo-cutout',
    );
  });
  it('adds photo-small only for a source narrower than the limit', () => {
    assert.equal(SMALL_IMAGE_WIDTH, 700);
    assert.match(
      figureClass({ width: 699, height: 699, alpha: false }),
      /photo-small$/,
    );
    assert.doesNotMatch(
      figureClass({ width: 700, height: 700, alpha: false }),
      /photo-small/,
    );
  });
  it('puts every class in a fixed order', () => {
    assert.equal(
      figureClass({ width: 100, height: 200, alpha: true }),
      'photo photo-portrait photo-cutout photo-small',
    );
  });
});
