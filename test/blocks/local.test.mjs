import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { codes, view } from '../helpers/capture.mjs';
import { copyOnce, renderOnce } from '../helpers/render.mjs';

describe('the local block', () => {
  it('is a note with its own icon on the page of its language', () => {
    const { html, reporter } = renderOnce(
      '::: local lang=en A title\nBody.\n:::\n',
      { code: 'en' },
    );
    assert.match(html, /^<div class="callout callout-local" role="note">/);
    assert.match(html, /href="#pc-i-local"/);
    assert.match(html, /<p class="callout-title">A title<\/p>/);
    assert.match(html, /<div class="callout-body"><p>Body\.<\/p>\n<\/div>/);
    assert.deepEqual(codes(reporter), []);
  });

  it('has no title paragraph when it has no title', () => {
    const { html } = renderOnce('::: local lang=en\nBody.\n:::\n', {
      code: 'en',
    });
    assert.doesNotMatch(html, /callout-title/);
    assert.match(html, /callout-local/);
  });

  it('renders the title as inline Markdown', () => {
    const { html } = renderOnce(
      '::: local lang=en The **big** one\nBody.\n:::\n',
      { code: 'en' },
    );
    assert.match(html, /<strong>big<\/strong>/);
  });

  it('renders nothing on the page of another language', () => {
    const { html, reporter } = renderOnce(
      '::: local lang=pl Tytuł\nTekst.\n:::\n',
      { code: 'en' },
    );
    assert.equal(html, '');
    assert.deepEqual(codes(reporter), []);
  });

  it('does not leave a trace of a local note of another language between other blocks', () => {
    const { html } = renderOnce(
      'Before.\n\n::: local lang=pl\nTekst.\n:::\n\nAfter.\n',
      { code: 'en' },
    );
    assert.equal(html, '<p>Before.</p>\n<p>After.</p>\n');
  });

  it('needs the language it is for', () => {
    const { reporter } = renderOnce('::: local Title\nBody.\n:::\n', {
      code: 'en',
    });
    assert.deepEqual(codes(reporter), ['E_BLOCK_ATTR']);
  });

  it('takes lists as well as paragraphs', () => {
    const { html, reporter } = renderOnce(
      '::: local lang=en\nIntro.\n\n- a\n- b\n\n1. one\n:::\n',
      { code: 'en' },
    );
    assert.deepEqual(codes(reporter), []);
    assert.match(html, /<ul>/);
    assert.match(html, /<ol/);
  });

  for (const [what, body] of [
    ['a heading', '## Head {#h}\n'],
    ['a quote', '> quoted\n'],
    ['a code block', '```\ncode\n```\n'],
    ['a table', '| a | b |\n| - | - |\n| 1 | 2 |\n'],
    ['a nested block', '::: tip\nx\n:::\n'],
    ['a heading inside a list', '- item\n\n  ## Deep {#deep}\n'],
    ['a quote inside a list', '- item\n\n  > quoted\n'],
    ['a rule', '---\n'],
  ])
    it(`refuses ${what}, on the line of the block`, () => {
      const { reporter } = renderOnce(`::: local lang=en T\n${body}:::\n`, {
        code: 'en',
      });
      assert.ok(
        codes(reporter).includes('E_BLOCK_CONTENT'),
        codes(reporter).join(),
      );
      assert.equal(
        view(reporter).find((e) => e.code === 'E_BLOCK_CONTENT').line,
        1,
      );
    });

  it('checks the content of a note that it then does not show', () => {
    const { html, reporter } = renderOnce(
      '::: local lang=pl T\n> quoted\n:::\n',
      { code: 'en' },
    );
    assert.equal(html, '');
    assert.ok(codes(reporter).includes('E_BLOCK_CONTENT'));
  });

  it('allows a task-free nested list of paragraphs', () => {
    const { reporter } = renderOnce('::: local lang=en\n- a\n  - b\n:::\n', {
      code: 'en',
    });
    assert.deepEqual(codes(reporter), []);
  });
});

describe('the local block in the Markdown copy', () => {
  it('is a quotation in its own language and nothing in another', () => {
    const text = '::: local lang=en Only here\nNote.\n:::\n';
    assert.equal(copyOnce(text, { code: 'en' }), '> **Only here**\n>\n> Note.');
    assert.equal(copyOnce(text, { code: 'pl' }), '');
  });

  it('has no title line without a title', () => {
    assert.equal(copyOnce('::: local lang=en\nNote.\n:::\n'), '> Note.');
  });
});
