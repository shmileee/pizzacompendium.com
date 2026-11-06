import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isShown, statusText } from '../../src/js/cards.js';

describe('isShown', () => {
  it('shows every card under all', () => {
    assert.equal(isShown('beginner', 'all'), true);
    assert.equal(isShown(undefined, 'all'), true);
  });

  it('shows only cards of the level pressed', () => {
    assert.equal(isShown('beginner', 'beginner'), true);
    assert.equal(isShown('advanced', 'beginner'), false);
    assert.equal(isShown(undefined, 'beginner'), false);
  });
});

describe('statusText', () => {
  it('puts the numbers where the template has them', () => {
    assert.equal(
      statusText('Showing {shown} of {total}', 6, 20),
      'Showing 6 of 20',
    );
    assert.equal(statusText('{total}/{shown}', 0, 3), '3/0');
  });

  it('leaves a template without places alone', () => {
    assert.equal(statusText('All', 1, 2), 'All');
  });
});
