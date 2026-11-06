import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isPageId, PAGE_IDS } from '../../scripts/lib/html/ids.mjs';

describe('isPageId', () => {
  it('is true for every id the template defines', () => {
    assert.deepEqual(PAGE_IDS, [
      'top',
      'content',
      'toc',
      'toc-toggle',
      'lang-picker',
    ]);
    for (const id of PAGE_IDS) assert.equal(isPageId(id), true, id);
  });

  it('is true for anything that starts with pc-', () => {
    assert.equal(isPageId('pc-search'), true);
    assert.equal(isPageId('pc-'), true);
    assert.equal(isPageId('pc-anything-new'), true);
  });

  it('is false for the ids of content', () => {
    for (const id of [
      'intro',
      'faq',
      'tops',
      'toc-extra',
      'pc',
      'pcx',
      'x-pc-a',
      'PC-a',
      'Top',
    ])
      assert.equal(isPageId(id), false, id);
  });
});
