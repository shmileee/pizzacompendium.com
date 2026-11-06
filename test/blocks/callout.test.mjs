import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { callout, calloutHtml } from '../../scripts/lib/blocks/callout.mjs';
import { codes, view } from '../helpers/capture.mjs';
import { renderOnce } from '../helpers/render.mjs';

describe('calloutHtml', () => {
  it('is a note with the icon of its kind, the title and the body', () => {
    assert.equal(
      calloutHtml({ kind: 'tip', title: 'T', body: '<p>B</p>' }),
      '<div class="callout callout-tip" role="note"><svg class="icon" width="24" height="24" aria-hidden="true"><use href="#pc-i-tip"/></svg><div class="callout-main"><p class="callout-title">T</p><div class="callout-body"><p>B</p></div></div></div>\n',
    );
  });

  it('leaves the title paragraph out for an empty title', () => {
    const html = calloutHtml({ kind: 'note', title: '', body: 'B' });
    assert.doesNotMatch(html, /callout-title/);
    assert.match(
      html,
      /<div class="callout-main"><div class="callout-body">B<\/div>/,
    );
  });

  it('is not a landmark', () => {
    assert.doesNotMatch(
      calloutHtml({ kind: 'tip', title: '', body: '' }),
      /<aside/,
    );
  });

  it('throws for a kind that has no icon, so that no block can point at nothing', () => {
    assert.throws(
      () => calloutHtml({ kind: 'nope', title: '', body: '' }),
      /unknown icon/,
    );
  });
});

describe('callout', () => {
  it('describes a block of the given name with an optional title', () => {
    const block = callout('tip', () => 'x');
    assert.equal(block.name, 'tip');
    assert.equal(block.title, 'optional');
    assert.equal(typeof block.render, 'function');
  });

  it('uses the default title of the language when the author gives none', () => {
    const { html } = renderOnce('::: tip\nBody.\n:::\n', {
      ui: { tip: 'A <hint>' },
    });
    assert.match(html, /<p class="callout-title">A &lt;hint&gt;<\/p>/);
  });

  it('uses the title of the author, as inline Markdown, instead', () => {
    const { html, reporter } = renderOnce(
      '::: tip A **bold** `title`\nBody.\n:::\n',
    );
    assert.match(
      html,
      /<p class="callout-title">A <strong>bold<\/strong> <code>title<\/code><\/p>/,
    );
    assert.doesNotMatch(html, />tip</);
    assert.deepEqual(codes(reporter), []);
  });

  it('renders the body as Markdown blocks', () => {
    const { html } = renderOnce('::: warning\nOne.\n\n- a\n- b\n:::\n');
    assert.match(html, /<div class="callout-body"><p>One\.<\/p>\n<ul>/);
  });

  it('reports a problem of the title on the line of the block', () => {
    const { reporter } = renderOnce(
      'x\n\n::: tip [bad](https://x.test)\nBody.\n:::\n',
    );
    assert.deepEqual(view(reporter), [
      { level: 'error', code: 'E_LINK_TARGET', file: 'case.md', line: 3 },
    ]);
  });
});
