import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import flours from '../../scripts/lib/blocks/flours.mjs';
import { codes, view } from '../helpers/capture.mjs';
import { copyOnce, renderOnce } from '../helpers/render.mjs';

const flour = (title, level = '') =>
  `::: flour ${level}${title}\n- W330\n:::\n`;

describe('the flours block', () => {
  it('takes no title and no attributes', () => {
    assert.equal(flours.name, 'flours');
    assert.equal(flours.title, 'none');
  });

  it('is a grid of cards in a wrapper', () => {
    const { html, reporter } = renderOnce(
      `::: flours\n${flour('A')}\n${flour('B')}:::\n`,
    );
    assert.deepEqual(codes(reporter), []);
    assert.match(
      html,
      /^<div class="cards-wrap"><ul class="cards" role="list"><li class="card">/,
    );
    assert.equal((html.match(/<li class="card"/g) ?? []).length, 2);
    assert.ok(html.endsWith('</ul></div>\n'));
  });

  it('has no filter when no card has a level', () => {
    const { html } = renderOnce(`::: flours\n${flour('A')}:::\n`);
    assert.doesNotMatch(html, /cards-filter|data-filter/);
  });

  it('brings the filter, hidden until the script shows it, when a card has the level', () => {
    const { html, reporter } = renderOnce(
      `::: flours\n${flour('A')}\n${flour('B', 'level=beginner ')}:::\n`,
      {
        ui: {
          filterLabel: 'Show "who"',
          filterAll: 'All <x>',
          filterStatus: '{shown} of {total}',
          beginner: 'Beginners',
        },
      },
    );
    assert.deepEqual(codes(reporter), []);
    assert.match(
      html,
      /^<div class="cards-wrap"><div class="cards-filter" role="group" aria-label="Show &quot;who&quot;" data-cards-filter data-status="\{shown\} of \{total\}" hidden>/,
    );
    assert.match(
      html,
      /<button type="button" class="btn" data-filter="all" aria-pressed="true">All &lt;x&gt;<\/button>/,
    );
    assert.match(
      html,
      /<button type="button" class="btn" data-filter="beginner" aria-pressed="false">Beginners<\/button>/,
    );
    assert.match(
      html,
      /<p class="cards-status" role="status"><\/p><\/div><ul class="cards"/,
    );
    assert.ok(html.indexOf('cards-filter') < html.indexOf('<ul class="cards"'));
  });

  it('brings the filter for a level that is wrong too only when it is the real level', () => {
    const { html } = renderOnce(
      `::: flours\n${flour('A', 'level=expert ')}:::\n`,
    );
    assert.doesNotMatch(html, /cards-filter/);
  });

  it('is happy with an empty grid', () => {
    const { html, reporter } = renderOnce('::: flours\n:::\n');
    assert.deepEqual(codes(reporter), []);
    assert.equal(
      html,
      '<div class="cards-wrap"><ul class="cards" role="list"></ul></div>\n',
    );
  });

  it('refuses a paragraph, with the line of the paragraph', () => {
    const { reporter } = renderOnce(
      `::: flours\n${flour('A')}\nStray text.\n:::\n`,
    );
    assert.deepEqual(view(reporter), [
      { level: 'error', code: 'E_BLOCK_CONTENT', file: 'case.md', line: 6 },
    ]);
  });

  it('refuses another block, and the block is still rendered by its own rules', () => {
    const { reporter } = renderOnce('::: flours\n::: tip\nx\n:::\n:::\n');
    assert.deepEqual(codes(reporter), ['E_BLOCK_CONTENT']);
  });

  it('refuses a list, a heading and a figure', () => {
    for (const stray of ['- a', '## H {#h}', '![x](img/a.webp)']) {
      const { reporter } = renderOnce(`::: flours\n${stray}\n:::\n`, {
        images: { 'img/a.webp': {} },
      });
      assert.ok(codes(reporter).includes('E_BLOCK_CONTENT'), stray);
    }
  });

  it('takes a title as an error', () => {
    const { reporter } = renderOnce('::: flours Title\n:::\n');
    assert.deepEqual(codes(reporter), ['E_BLOCK_TITLE']);
  });
});

describe('the flours block in the Markdown copy', () => {
  it('is its cards one after the other', () => {
    assert.equal(
      copyOnce(`:::: flours\n${flour('A')}\n${flour('B')}::::\n`),
      '**A**\n\n- W330\n\n**B**\n\n- W330',
    );
  });
});
