import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import tip from '../../scripts/lib/blocks/tip.mjs';
import { codes } from '../helpers/capture.mjs';
import { renderOnce } from '../helpers/render.mjs';

describe('the tip block', () => {
  it('is called tip and takes an optional title', () => {
    assert.equal(tip.name, 'tip');
    assert.equal(tip.title, 'optional');
  });

  it('is a callout of its kind, with its icon', () => {
    const { html, reporter } = renderOnce('::: tip\nBody.\n:::\n');
    assert.match(html, /^<div class="callout callout-tip" role="note">/);
    assert.match(html, /href="#pc-i-tip"/);
    assert.match(html, /<div class="callout-body"><p>Body\.<\/p>\n<\/div>/);
    assert.deepEqual(codes(reporter), []);
  });

  it('is titled with the string "tip" of the language by default', () => {
    const { html } = renderOnce('::: tip\nBody.\n:::\n', {
      ui: { tip: 'Hint' },
    });
    assert.match(html, /<p class="callout-title">Hint<\/p>/);
  });

  it('shows the title of the author instead', () => {
    const { html } = renderOnce('::: tip Mine\nBody.\n:::\n', {
      ui: { tip: 'Hint' },
    });
    assert.match(html, /<p class="callout-title">Mine<\/p>/);
    assert.doesNotMatch(html, /Hint/);
  });
});
