import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import flour, { BEGINNER, factCount } from '../../scripts/lib/blocks/flour.mjs';
import { codes, view } from '../helpers/capture.mjs';
import { copyOnce, renderOnce } from '../helpers/render.mjs';

/** One card inside its grid. */
const card = (info, body = '- strength W330\n- A plain note') =>
  `::: flours\n::: flour ${info}\n${body}\n:::\n:::\n`;

const IMAGES = { 'img/pack.webp': { width: 300, height: 400 } };

describe('factCount', () => {
  it('counts the short bullets that hold a number, up to the first that does not', () => {
    assert.equal(
      factCount([
        'strength W330',
        'Tipo 00',
        'A note without any figure',
        'W250',
      ]),
      2,
    );
  });

  it('is the whole list when all are facts, and zero for none or an empty list', () => {
    assert.equal(factCount(['W330', '12 %']), 2);
    assert.equal(factCount(['A note', 'W330']), 0);
    assert.equal(factCount([]), 0);
  });

  it('ends the run at a bullet without a digit, however short', () => {
    assert.equal(factCount(['W330', 'Tipo', '12']), 1);
  });

  it('takes 32 characters as a fact and 33 as a sentence', () => {
    assert.equal(factCount(['1'.padEnd(32, 'x')]), 1);
    assert.equal(factCount(['1'.padEnd(33, 'x')]), 0);
  });

  it('counts a digit of any script', () => {
    assert.equal(factCount(['W٣٣٠']), 1);
  });
});

describe('the flour block', () => {
  it('is a card inside a flours grid, with a required title and optional img and level', () => {
    assert.equal(flour.name, 'flour');
    assert.equal(flour.parent, 'flours');
    assert.equal(flour.title, 'required');
    assert.deepEqual(flour.attrs, { img: 'optional', level: 'optional' });
    assert.equal(BEGINNER, 'beginner');
  });

  it('renders the title, and the bullets as a list', () => {
    const { html, reporter } = renderOnce(card('Caputo & Co'));
    assert.deepEqual(codes(reporter), []);
    assert.match(
      html,
      /<li class="card"><div class="card-body"><p class="card-title">Caputo &amp; Co<\/p><ul class="card-list" role="list">/,
    );
    assert.match(
      html,
      /<li class="card-fact">strength W330<\/li><li>A plain note<\/li><\/ul><\/div><\/li>/,
    );
  });

  it('draws the leading facts as chips and the rest as lines', () => {
    const { html } = renderOnce(
      card('X', '- W330\n- Tipo 00\n- A note\n- W250'),
    );
    assert.deepEqual(
      [...html.matchAll(/<li( class="card-fact")?>/g)].map((m) =>
        Boolean(m[1]),
      ),
      [true, true, false, false],
    );
  });

  it('renders Markdown in a bullet', () => {
    const { html } = renderOnce(card('X', '- **W330** `x`'));
    assert.match(
      html,
      /<li class="card-fact"><strong>W330<\/strong> <code>x<\/code><\/li>/,
    );
  });

  it('has no list for a card without bullets', () => {
    const { html, reporter } = renderOnce(card('Only a title', ''));
    assert.deepEqual(codes(reporter), []);
    assert.doesNotMatch(html, /card-list/);
    assert.equal(
      html,
      '<div class="cards-wrap"><ul class="cards" role="list"><li class="card"><div class="card-body"><p class="card-title">Only a title</p></div></li>\n</ul></div>\n',
    );
  });

  it('puts the picture on a plate, as a card picture, with its size', () => {
    const { html, reporter } = renderOnce(card('img=pack.webp X'), {
      images: IMAGES,
    });
    assert.deepEqual(codes(reporter), []);
    assert.match(
      html,
      /<li class="card"><div class="card-img"><img src="\.\.\/img\/pack\.webp" alt="" loading="lazy" decoding="async" width="300" height="400"><\/div>/,
    );
  });

  it('gives the packshot a srcset for the width of a card when smaller copies exist', () => {
    const { html } = renderOnce(card('img=pack.webp X'), {
      images: {
        'img/pack.webp': {
          width: 300,
          height: 400,
          variants: [{ href: 'img/pack-150w.webp', width: 150 }],
        },
      },
    });
    assert.match(
      html,
      /srcset="\.\.\/img\/pack-150w\.webp 150w, \.\.\/img\/pack\.webp 300w" sizes="96px"/,
    );
  });

  it('has no picture block without an img, and says so for a missing file', () => {
    assert.doesNotMatch(renderOnce(card('X')).html, /card-img/);
    const { html, reporter } = renderOnce(card('img=gone.webp X'));
    assert.deepEqual(view(reporter), [
      { level: 'error', code: 'E_IMG_MISSING', file: 'case.md', line: 2 },
    ]);
    assert.doesNotMatch(html, /card-img/);
    assert.match(html, /card-title/);
  });

  it('marks a card for beginners: a data attribute and a badge with the label', () => {
    const { html, reporter } = renderOnce(card('level=beginner X'), {
      ui: { beginner: 'For <beginners>' },
    });
    assert.deepEqual(codes(reporter), []);
    assert.match(html, /<li class="card" data-level="beginner">/);
    assert.match(
      html,
      /<p class="card-badge"><span class="badge badge-good"><svg class="icon" [^>]*><use href="#pc-i-sprout"\/><\/svg>For &lt;beginners&gt;<\/span><\/p>/,
    );
    assert.ok(html.indexOf('card-title') < html.indexOf('card-badge'));
    assert.ok(html.indexOf('card-badge') < html.indexOf('card-list'));
  });

  it('has neither mark nor badge without a level', () => {
    const { html } = renderOnce(card('X'));
    assert.doesNotMatch(html, /data-level|card-badge/);
    assert.match(
      html,
      /<li class="card"><div class="card-body"><p class="card-title">X<\/p><ul class="card-list"/,
    );
  });

  it('refuses a level other than beginner, at the card, and shows the card unmarked', () => {
    const { html, reporter } = renderOnce(card('level=expert X'));
    assert.deepEqual(view(reporter), [
      { level: 'error', code: 'E_BLOCK_ATTR', file: 'case.md', line: 2 },
    ]);
    assert.doesNotMatch(html, /data-level|card-badge/);
    assert.match(html, /card-title/);
  });

  it('refuses a level in other letters', () => {
    const { reporter } = renderOnce(card('level=Beginner X'));
    assert.deepEqual(codes(reporter), ['E_BLOCK_ATTR']);
  });

  it('has the same output for the same card in any language', () => {
    const one = renderOnce(card('level=beginner X'), { code: 'pl' }).html;
    const two = renderOnce(card('level=beginner X'), { code: 'uk' }).html;
    assert.equal(one, two);
  });

  it('puts a no-break space before the slash of a title written "A / B"', () => {
    const { html } = renderOnce(card('Caputo Pizzeria / Cuoco'));
    assert.match(html, /Caputo Pizzeria \/ Cuoco<\/p>/);
  });

  it('needs a title', () => {
    const { reporter } = renderOnce(card(''));
    assert.deepEqual(codes(reporter), ['E_BLOCK_TITLE']);
  });

  it('refuses an attribute written after the title', () => {
    const { reporter } = renderOnce(card('Caputo img=x.webp'));
    assert.deepEqual(codes(reporter), ['E_BLOCK_ATTR']);
  });

  it('must sit directly inside a flours block', () => {
    const { html, reporter } = renderOnce('::: flour X\n- W330\n:::\n');
    assert.deepEqual(codes(reporter), ['E_BLOCK_PARENT']);
    assert.equal(html, '');
  });

  describe('the body of a card', () => {
    for (const [what, body] of [
      ['a paragraph', 'Just text.'],
      ['an ordered list', '1. one\n2. two'],
      ['a task list', '- [ ] one'],
      ['a bullet with two paragraphs', '- one\n\n  two'],
      ['a bullet with a nested list', '- one\n  - nested'],
      ['a list and then a paragraph', '- one\n\nAfter.'],
      ['two lists', '- one\n\nbreak\n\n- two'],
      ['a table', '| a |\n| - |\n| 1 |'],
    ])
      it(`is refused for ${what}, and the card then has no list`, () => {
        const { html, reporter } = renderOnce(card('X', body));
        assert.ok(
          codes(reporter).includes('E_BLOCK_CONTENT'),
          codes(reporter).join(),
        );
        assert.doesNotMatch(html, /card-list/);
        assert.match(html, /card-title/);
      });

    it('may have blank lines around its list', () => {
      const { reporter, html } = renderOnce(card('X', '\n- one\n- two\n'));
      assert.deepEqual(codes(reporter), []);
      assert.equal((html.match(/<li>/g) ?? []).length, 2 + 0);
    });
  });
});

describe('the flour block in the Markdown copy', () => {
  it('is the name in bold and the bullets, without the picture', () => {
    assert.equal(
      copyOnce(card('img=pack.webp Caputo Pizzeria')),
      '**Caputo Pizzeria**\n\n- strength W330\n- A plain note',
    );
  });

  it('says "for beginners" in brackets for a card marked so', () => {
    assert.equal(
      copyOnce(card('level=beginner Caputo'), { ui: { beginner: 'Easy' } }),
      '**Caputo** (Easy)\n\n- strength W330\n- A plain note',
    );
  });
});
