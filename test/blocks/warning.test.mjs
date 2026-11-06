import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import warning from '../../scripts/lib/blocks/warning.mjs';
import { codes } from '../helpers/capture.mjs';
import { renderOnce } from '../helpers/render.mjs';

describe('the warning block', () => {
  it('is called warning and takes an optional title', () => {
    assert.equal(warning.name, 'warning');
    assert.equal(warning.title, 'optional');
  });

  it('is a callout of its kind, with its icon', () => {
    const { html, reporter } = renderOnce('::: warning\nBody.\n:::\n');
    assert.match(html, /^<div class="callout callout-warning" role="note">/);
    assert.match(html, /href="#pc-i-warning"/);
    assert.match(html, /<div class="callout-body"><p>Body\.<\/p>\n<\/div>/);
    assert.deepEqual(codes(reporter), []);
  });

  it('is titled with the string "warning" of the language by default', () => {
    const { html } = renderOnce('::: warning\nBody.\n:::\n', {
      ui: { warning: 'Careful' },
    });
    assert.match(html, /<p class="callout-title">Careful<\/p>/);
  });

  it('shows the title of the author instead', () => {
    const { html } = renderOnce('::: warning Hot oven\nBody.\n:::\n', {
      ui: { warning: 'Careful' },
    });
    assert.match(html, /<p class="callout-title">Hot oven<\/p>/);
    assert.doesNotMatch(html, /Careful/);
  });
});
