import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createMarkdownCopy,
  markdownDocument,
} from '../../scripts/lib/markdown/copy.mjs';
import { copyOnce, lang, ui } from '../helpers/render.mjs';

describe('createMarkdownCopy', () => {
  it('keeps plain Markdown as it is written', () => {
    const text =
      'A paragraph with **bold** and *italics*.\n\n- one\n- two\n\n1. first\n2. second\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n> A quote.\n';
    assert.equal(
      copyOnce(text),
      'A paragraph with **bold** and *italics*.\n\n- one\n- two\n\n1. first\n2. second\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n> A quote.',
    );
  });

  it('drops the {#id} of a heading and keeps its level', () => {
    assert.equal(
      copyOnce('## Dough {#dough}\n\nText.\n\n### Salt {#salt}\n'),
      '## Dough\n\nText.\n\n### Salt',
    );
  });

  it('keeps a heading that has no id as it is (the page renderer reports it)', () => {
    assert.equal(copyOnce('## Dough\n'), '## Dough');
  });

  it('gives every link to the page and every picture its full address', () => {
    assert.equal(
      copyOnce(
        'See [the recipe](#recipe) and [salt][s].\n\n![A ball](img/ball.webp "Caption")\n\n[s]: #salt\n',
      ),
      'See [the recipe](https://x.test/en/#recipe) and [salt][s].\n\n![A ball](https://x.test/img/ball.webp "Caption")\n\n[s]: https://x.test/en/#salt',
    );
    assert.equal(
      copyOnce('![p][i]\n\n[i]:  img/p.webp\n'),
      '![p][i]\n\n[i]:  https://x.test/img/p.webp',
    );
  });

  it('rewrites the links in a heading, a table and a title of a block', () => {
    assert.equal(
      copyOnce(
        '## See [this](#a) {#h}\n\n| [x](#b) |\n| --- |\n| ![p](img/p.webp) |\n\n::: tip Read [that](#c)\nBody.\n:::\n',
      ),
      '## See [this](https://x.test/en/#a)\n\n| [x](https://x.test/en/#b) |\n| --- |\n| ![p](https://x.test/img/p.webp) |\n\n> **Read [that](https://x.test/en/#c)**\n>\n> Body.',
    );
  });

  it('drops the notes for translators, alone or inside a paragraph', () => {
    assert.equal(
      copyOnce('<!-- a note -->\n\nText <!-- inline --> more.\n'),
      'Text  more.',
    );
  });

  it('keeps a code sample exactly, links included', () => {
    assert.equal(
      copyOnce('```\n[x](#a) <!-- kept -->\n```\n'),
      '```\n[x](#a) <!-- kept -->\n```',
    );
  });

  it('leaves out a block it does not know, and a stray closing fence', () => {
    assert.equal(
      copyOnce('Before.\n\n::: nope\nInside.\n:::\n\n:::\n\nAfter.\n'),
      'Before.\n\nAfter.',
    );
  });

  it('hands every block its attributes, title, body, language, strings and the level of the last heading', () => {
    const seen = [];
    const block = {
      name: 'probe',
      markdown: (context) => {
        seen.push(context);
        return `[${context.title}]`;
      },
    };
    const text =
      '::: probe #one key=v First\nA *b*.\n:::\n\n### Sub {#sub}\n\n::: probe\n:::\n';
    assert.equal(
      copyOnce(text, { blocks: { block }, ui: { tip: 'Hint' } }),
      '[First]\n\n### Sub\n\n[]',
    );
    assert.deepEqual(seen[0].attrs, { id: 'one', key: 'v' });
    assert.equal(seen[0].body, 'A *b*.');
    assert.equal(seen[0].depth, 1);
    assert.equal(seen[0].lang.code, 'en');
    assert.equal(seen[0].ui.tip, 'Hint');
    assert.equal(seen[1].depth, 3);
    assert.equal(seen[1].body, '');
  });

  it('starts every section at the top level again', () => {
    const copy = createMarkdownCopy({
      lang: lang('en'),
      ui: ui(),
      url: 'https://x.test/en/',
      siteUrl: 'https://x.test',
    });
    copy.render('#### Deep {#deep}\n');
    assert.equal(
      copy.render('::: q #a Why?\nBecause.\n:::\n'),
      '## Why?\n\nBecause.',
    );
  });

  it('gives an empty copy, not an exception, for a text it cannot read', () => {
    assert.equal(copyOnce(`${'>'.repeat(5000)} deep\n`), '');
  });
});

describe('markdownDocument', () => {
  const parts = {
    title: 'Guide: pizza',
    description: 'All about pizza.',
    url: 'https://x.test/en/',
    sections: ['## A\n\nOne.', '', '## B\n\nTwo.'],
    credit: 'Based on a document.',
  };

  it('has the title, the description, the address, the sections and the credit', () => {
    assert.equal(
      markdownDocument(parts),
      '# Guide: pizza\n\n> All about pizza.\n\n<https://x.test/en/>\n\n## A\n\nOne.\n\n## B\n\nTwo.\n\n---\n\nBased on a document.\n',
    );
  });

  it('puts the date under the address and the translation note before the text', () => {
    assert.equal(
      markdownDocument({
        ...parts,
        updated: 'Updated 6 November 2026',
        note: 'Translated.',
        sections: ['## A'],
      }),
      '# Guide: pizza\n\n> All about pizza.\n\n<https://x.test/en/>\\\nUpdated 6 November 2026\n\n*Translated.*\n\n## A\n\n---\n\nBased on a document.\n',
    );
  });
});
