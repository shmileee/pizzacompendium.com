import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createTypography,
  NBSP,
} from '../../scripts/lib/markdown/typography.mjs';

const nowrap = (text) => `<span class="nowrap">${text}</span>`;

describe('createTypography: nothing configured', () => {
  const typo = createTypography();
  it('leaves plain text alone', () => {
    assert.equal(typo('a i o 250 g'), 'a i o 250 g');
  });
  it('leaves the word null alone', () => {
    assert.equal(typo('null 5 null'), 'null 5 null');
  });
  it('wraps numeric ranges', () => {
    assert.equal(typo('5–6 min'), `${nowrap('5–6')} min`);
    assert.equal(typo('$3–5'), nowrap('$3–5'));
    assert.equal(typo('W250–310'), nowrap('W250–310'));
    assert.equal(typo('55–62%'), nowrap('55–62%'));
    assert.equal(typo('400–500°C'), nowrap('400–500°C'));
    assert.equal(typo('1,5–2.5'), nowrap('1,5–2.5'));
    assert.equal(
      typo('€1–2 £3–4 5–6°F'),
      `${nowrap('€1–2')} ${nowrap('£3–4')} ${nowrap('5–6°F')}`,
    );
    assert.equal(typo('p. 3–4, 7–8'), `p. ${nowrap('3–4')}, ${nowrap('7–8')}`);
  });
  it('does not wrap what is not a numeric range', () => {
    assert.equal(typo('a–b'), 'a–b');
    assert.equal(typo('5-6'), '5-6');
    assert.equal(typo('5—6'), '5—6');
    assert.equal(typo('5 – 6'), `5${NBSP}– 6`);
  });
  it('ties a dash with spaces on both sides to the word before it', () => {
    assert.equal(typo('word – word'), `word${NBSP}– word`);
    assert.equal(typo('word — word'), `word${NBSP}— word`);
    assert.equal(typo('a – b – c'), `a${NBSP}– b${NBSP}– c`);
    assert.equal(typo('word –word'), 'word –word');
    assert.equal(typo('word– word'), 'word– word');
  });
  it('ties a dash at the very start or end of the text', () => {
    assert.equal(typo('– word'), '– word');
    assert.equal(typo('word –'), `word${NBSP}–`);
  });
  it('is the same function every call (no state in a global regexp)', () => {
    const first = typo('5–6 a – b');
    assert.equal(typo('5–6 a – b'), first);
    assert.equal(typo('5–6 a – b'), first);
  });
});

describe('createTypography: words only', () => {
  const typo = createTypography({ nbspAfter: ['a', 'i', 'w', 'ok.'] });
  it('ties a short word to the next one', () => {
    assert.equal(typo('mąka i woda'), `mąka i${NBSP}woda`);
    assert.equal(typo('ok. 250 g'), `ok.${NBSP}250 g`);
  });
  it('works at the start of the text and after an opening mark', () => {
    assert.equal(typo('a ciasto'), `a${NBSP}ciasto`);
    assert.equal(typo('(a ciasto)'), `(a${NBSP}ciasto)`);
    assert.equal(typo('«i ciasto»'), `«i${NBSP}ciasto»`);
    assert.equal(typo('„w domu”'), `„w${NBSP}domu”`);
    assert.equal(typo('“i x”'), `“i${NBSP}x”`);
    assert.equal(typo('‘a x’'), `‘a${NBSP}x’`);
  });
  it('is case insensitive', () => {
    assert.equal(typo('I woda'), `I${NBSP}woda`);
    assert.equal(typo('OK. 5'), `OK.${NBSP}5`);
  });
  it('does not touch a longer word that ends or starts like a listed one', () => {
    assert.equal(typo('ala ma kota'), 'ala ma kota');
    assert.equal(typo('mama i'), 'mama i');
    assert.equal(typo('ai x'), 'ai x');
    assert.equal(typo('ax y'), 'ax y');
  });
  it('ties consecutive short words, each to the next', () => {
    assert.equal(typo('a i w domu'), `a${NBSP}i${NBSP}w${NBSP}domu`);
  });
  it('ties after a run of spaces, replacing all of them', () => {
    assert.equal(typo('a   b'), `a${NBSP}b`);
    assert.equal(typo('a\tb'), `a${NBSP}b`);
  });
  it('ties a trailing word to the markup that follows it', () => {
    assert.equal(typo('mąka i '), `mąka i${NBSP}`);
    assert.equal(typo('mąka i'), 'mąka i');
  });
  it('leaves the text as it is without a following non-space', () => {
    assert.equal(typo(''), '');
  });
  it('escapes regular expression characters in the words', () => {
    assert.equal(
      createTypography({ nbspAfter: ['a.b'] })('a.b c'),
      `a.b${NBSP}c`,
    );
    assert.equal(createTypography({ nbspAfter: ['a.b'] })('axb c'), 'axb c');
    assert.equal(createTypography({ nbspAfter: ['(x'] })('(x y'), `(x${NBSP}y`);
  });
});

describe('createTypography: units only', () => {
  const typo = createTypography({ units: ['g', 'kg', 'min', 'm', '°C'] });
  it('ties a number to its unit', () => {
    assert.equal(typo('250 g'), `250${NBSP}g`);
    assert.equal(typo('24 min'), `24${NBSP}min`);
    assert.equal(typo('200 °C'), `200${NBSP}°C`);
  });
  it('prefers the longest unit', () => {
    assert.equal(typo('2 kg'), `2${NBSP}kg`);
    assert.equal(typo('2 min'), `2${NBSP}min`);
  });
  it('does not tie when a letter or digit follows the unit', () => {
    assert.equal(typo('2 gram'), '2 gram');
    assert.equal(typo('2 g2'), '2 g2');
    assert.equal(typo('2 minuty'), '2 minuty');
  });
  it('does not tie a unit without a number or a number without a unit', () => {
    assert.equal(typo('a g'), 'a g');
    assert.equal(typo('250 ml'), '250 ml');
    assert.equal(typo('250  g'), '250  g');
  });
  it('does not tie short words', () => {
    assert.equal(typo('a b'), 'a b');
  });
});

describe('createTypography: words, units and ranges together', () => {
  const typo = createTypography({ nbspAfter: ['i'], units: ['g'] });
  it('applies all of them', () => {
    assert.equal(
      typo('5–6 g i 7 g – ok'),
      `${nowrap('5–6')}${NBSP}g i${NBSP}7${NBSP}g${NBSP}– ok`,
    );
  });
  it('wraps a range in the middle of a sentence', () => {
    assert.equal(typo('od 5–6 g'), `od ${nowrap('5–6')}${NBSP}g`);
  });
  it('only adds whitespace and the wrapper', () => {
    const text = 'mąka i 250 g – 5–6 min, W250–310 i $3–5';
    const out = typo(text)
      .replaceAll(NBSP, ' ')
      .replace(/<\/?span[^>]*>/g, '');
    assert.equal(out, text);
  });
});
