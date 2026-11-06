import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import note from '../../scripts/lib/blocks/note.mjs';
import { codes } from '../helpers/capture.mjs';
import { renderOnce } from '../helpers/render.mjs';

describe('the note block', () => {
  it('is called note and takes an optional title', () => {
    assert.equal(note.name, 'note');
    assert.equal(note.title, 'optional');
  });

  it('is a callout of its kind, with its icon', () => {
    const { html, reporter } = renderOnce('::: note\nBody.\n:::\n');
    assert.match(html, /^<div class="callout callout-note" role="note">/);
    assert.match(html, /href="#pc-i-note"/);
    assert.match(html, /<div class="callout-body"><p>Body\.<\/p>\n<\/div>/);
    assert.deepEqual(codes(reporter), []);
  });

  it('has no title by default', () => {
    const { html } = renderOnce('::: note\nBody.\n:::\n');
    assert.doesNotMatch(html, /callout-title/);
  });

  it('shows the title of the author', () => {
    const { html } = renderOnce('::: note Mine\nBody.\n:::\n');
    assert.match(html, /<p class="callout-title">Mine<\/p>/);
  });
});
