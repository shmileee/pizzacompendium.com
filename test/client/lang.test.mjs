import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { currentSection } from '../../src/js/lang.js';

const marks = [
  { id: 'a', top: -400 },
  { id: 'b', top: -20 },
  { id: 'c', top: 250 },
  { id: 'd', top: 900 },
];

describe('currentSection', () => {
  it('is the last mark at or above the line', () => {
    assert.equal(currentSection(marks, 300), 'c');
    assert.equal(currentSection(marks, 0), 'b');
  });

  it('counts a mark exactly on the line as reached', () => {
    assert.equal(currentSection(marks, 250), 'c');
    assert.equal(currentSection(marks, 249), 'b');
  });

  it('is empty above the first mark and for no marks', () => {
    assert.equal(currentSection(marks, -401), '');
    assert.equal(currentSection([], 100), '');
  });

  it('takes the last of marks that share a place', () => {
    const same = [
      { id: 'x', top: 10 },
      { id: 'y', top: 10 },
    ];
    assert.equal(currentSection(same, 10), 'y');
  });
});
