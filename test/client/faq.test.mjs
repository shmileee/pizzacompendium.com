import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  allOpen,
  linkTo,
  MESSAGE_MS,
  openAncestors,
} from '../../src/js/faq.js';

const node = (tagName, parentElement = null, open = false) => ({
  tagName,
  parentElement,
  open,
});

describe('openAncestors', () => {
  it('opens every closed details around the element', () => {
    const outer = node('DETAILS');
    const inner = node('DETAILS', outer);
    const p = node('P', inner);
    assert.equal(openAncestors(p), true);
    assert.equal(inner.open, true);
    assert.equal(outer.open, true);
    assert.equal(p.open, false);
  });

  it('opens the element itself when it is a details', () => {
    const d = node('DETAILS');
    assert.equal(openAncestors(d), true);
    assert.equal(d.open, true);
  });

  it('reports no change when everything is open or there is no details', () => {
    const d = node('DETAILS', null, true);
    assert.equal(openAncestors(node('P', d)), false);
    assert.equal(openAncestors(node('DIV', node('SECTION'))), false);
  });

  it('opens only the closed ones among several', () => {
    const outer = node('DETAILS', null, true);
    const inner = node('DETAILS', outer);
    assert.equal(openAncestors(inner), true);
    assert.equal(inner.open, true);
  });
});

describe('allOpen', () => {
  it('is true only when every item is open', () => {
    assert.equal(allOpen([{ open: true }, { open: true }]), true);
    assert.equal(allOpen([{ open: true }, { open: false }]), false);
  });

  it('is true for no items', () => {
    assert.equal(allOpen([]), true);
  });
});

describe('linkTo', () => {
  it('puts the id in the address of the page', () => {
    assert.equal(
      linkTo('https://example.com/en/?a=1', 'faq-stone'),
      'https://example.com/en/?a=1#faq-stone',
    );
  });

  it('replaces a fragment that is already there', () => {
    assert.equal(
      linkTo('https://example.com/en/#old', 'new'),
      'https://example.com/en/#new',
    );
  });

  it('encodes what an address cannot hold', () => {
    assert.equal(
      linkTo('https://example.com/pl/', 'mąka'),
      'https://example.com/pl/#m%C4%85ka',
    );
  });
});

describe('MESSAGE_MS', () => {
  it('is a positive time in milliseconds', () => {
    assert.ok(Number.isInteger(MESSAGE_MS) && MESSAGE_MS > 0);
  });
});
