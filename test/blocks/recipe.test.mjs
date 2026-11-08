import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import recipe from '../../scripts/lib/blocks/recipe.mjs';
import { codes, view } from '../helpers/capture.mjs';
import { copyOnce, renderOnce } from '../helpers/render.mjs';

const BODY = [
  '## Basic recipe {#recipe}',
  '',
  'The recipe in **baker’s percentages**, for [four balls](#balls).',
  '',
  '| Ingredient | Amount | % |',
  '| --- | --- | --- |',
  '| Flour (W250–310) | 598 g | 100% |',
  '| Water | 329 g | 55% |',
  '| **Total** | **927 g** | |',
  '',
  'Then knead:',
  '',
  '1. Put the flour in a bowl.',
  '2. Add the [water](#water).',
].join('\n');

const RECIPE = (info = 'time=PT24H', body = BODY) =>
  `:::: recipe ${info}\n${body}\n::::\n`;

describe('the recipe block', () => {
  it('is called recipe, takes no title and an optional time', () => {
    assert.equal(recipe.name, 'recipe');
    assert.equal(recipe.title, 'none');
    assert.deepEqual(recipe.attrs, { time: 'optional' });
  });

  it('shows the text it wraps exactly as it would be without it', () => {
    const wrapped = renderOnce(RECIPE());
    const bare = renderOnce(BODY);
    assert.deepEqual(codes(wrapped.reporter), []);
    assert.equal(wrapped.html, bare.html);
  });

  it('records the recipe: name and id, description, ingredients, steps and time', () => {
    const { records } = renderOnce(RECIPE());
    assert.deepEqual(records, [
      {
        type: 'recipe',
        id: 'recipe',
        name: 'Basic recipe',
        description: 'The recipe in baker’s percentages, for four balls.',
        ingredients: ['598 g Flour (W250–310)', '329 g Water'],
        steps: ['Put the flour in a bowl.', 'Add the water.'],
        time: 'PT24H',
      },
    ]);
  });

  it('has no time without one, and no description without a paragraph', () => {
    const body = BODY.split('\n')
      .filter(
        (line) => !line.startsWith('The recipe') && line !== 'Then knead:',
      )
      .join('\n');
    const [entry] = renderOnce(RECIPE('', body)).records;
    assert.equal(entry.time, null);
    assert.equal(entry.description, '');
  });

  it('takes days, hours and minutes as the time, and refuses anything else', () => {
    for (const time of ['PT24H', 'P2D', 'P1DT2H30M', 'PT45M']) {
      const { reporter, records } = renderOnce(RECIPE(`time=${time}`));
      assert.deepEqual(codes(reporter), [], time);
      assert.equal(records[0].time, time);
    }
    for (const time of ['24h', 'P', 'PT', 'P1H', 'PT1D', 'P1DT']) {
      const { html, reporter, records } = renderOnce(RECIPE(`time=${time}`));
      assert.deepEqual(
        view(reporter),
        [{ level: 'error', code: 'E_BLOCK_ATTR', file: 'case.md', line: 1 }],
        time,
      );
      assert.deepEqual(records, []);
      assert.match(html, /<h2 id="recipe">/);
    }
  });

  it('needs a heading with an id, a table of two columns at least and a numbered list', () => {
    const lines = BODY.split('\n');
    const without = (test) => lines.filter((line) => !test(line)).join('\n');
    const broken = [
      without((line) => line.startsWith('##')),
      without((line) => line.startsWith('|')),
      without((line) => /^\d\./.test(line)),
      BODY.replace('1. Put', '- Put').replace('2. Add', '- Add'),
      '## R {#r}\n\n| Only |\n| --- |\n| x |\n\n1. step',
    ];
    for (const body of broken) {
      const { html, reporter, records } = renderOnce(RECIPE('', body));
      assert.deepEqual(
        codes(reporter).filter((code) => code !== 'E_HEADING_ID'),
        ['E_BLOCK_CONTENT'],
        body,
      );
      assert.deepEqual(records, [], body);
      assert.notEqual(html, '', body);
    }
  });

  it('is its text in the Markdown copy', () => {
    assert.equal(
      copyOnce(RECIPE('time=PT24H', '## R {#r}\n\nText [x](#y).')),
      '## R\n\nText [x](https://x.test/en/#y).',
    );
  });
});
