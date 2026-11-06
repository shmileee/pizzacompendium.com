import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildRecords,
  collect,
  describe as describeState,
  excerpt,
  grade,
  parseQuery,
  rank,
  segments,
  shortcutLabel,
  stem,
  tokenize,
  wantsSearch,
} from '../../src/js/search.js';

const terms = (text) => parseQuery(text);
const words = (text) => tokenize(text).map(({ word }) => word);
const marked = (text, typed) =>
  segments(text, terms(typed))
    .filter(({ mark }) => mark)
    .map(({ text: piece }) => piece);

/** A heading, question or text entry, as `collect` would find it. */
const h = (level, id, text) => ({ kind: 'heading', level, id, el: id, text });
const q = (id, text) => ({
  kind: 'question',
  id,
  el: `${id}-summary`,
  text,
});
const p = (text, extra = {}) => ({ kind: 'text', el: text, text, ...extra });

const ids = (records) => records.map((record) => record.id);

describe('tokenize', () => {
  it('gives each word with its place in the text', () => {
    assert.deepEqual(tokenize('Hot oven, 250 °C'), [
      { start: 0, end: 3, word: 'hot' },
      { start: 4, end: 8, word: 'oven' },
      { start: 10, end: 13, word: '250' },
      { start: 15, end: 16, word: 'c' },
    ]);
  });

  it('folds diacritics and the Polish l with stroke', () => {
    assert.deepEqual(words('Mąka żytnia, łódź'), ['maka', 'zytnia', 'lodz']);
  });

  it('drops apostrophes inside a word, whatever their shape', () => {
    assert.deepEqual(words("м’ясо м‘ясо m`yaso don't"), [
      'мясо',
      'мясо',
      'myaso',
      'dont',
    ]);
  });

  it('keeps Cyrillic letters and the Ukrainian ї apart from і', () => {
    assert.deepEqual(words('Тісто для піци'), ['тісто', 'для', 'піци']);
  });

  it('treats a no-break space as a separator and keeps offsets', () => {
    const found = tokenize('a bc');
    assert.deepEqual(found, [
      { start: 0, end: 1, word: 'a' },
      { start: 2, end: 4, word: 'bc' },
    ]);
  });

  it('does not take an apostrophe at the edge of a word', () => {
    assert.deepEqual(words("'quoted'"), ['quoted']);
  });

  it('is empty for text with no letters', () => {
    assert.deepEqual(tokenize(' ,;– '), []);
  });
});

describe('stem', () => {
  it('lets the Polish forms of flour share a start', () => {
    assert.equal(stem('maka'), 'mak');
    assert.equal(stem('maki'), 'mak');
    assert.equal(stem('make'), 'mak');
  });

  it('drops a plural s of a long word, then one final vowel', () => {
    assert.equal(stem('pizzas'), 'pizz');
    assert.equal(stem('pizza'), 'pizz');
  });

  it('keeps an s of a word of four letters or fewer', () => {
    assert.equal(stem('oats'), 'oats');
  });

  it('keeps a short word whole', () => {
    assert.equal(stem('ser'), 'ser');
    assert.equal(stem('oven'), 'oven');
    assert.equal(stem('tea'), 'tea');
  });

  it('cuts a Cyrillic final vowel', () => {
    assert.equal(stem('піца'), 'піц');
    assert.equal(stem('борошно'), 'борошн');
  });

  it('keeps a consonant ending', () => {
    assert.equal(stem('dough'), 'dough');
  });
});

describe('parseQuery', () => {
  it('gives a folded word and its stem per word', () => {
    assert.deepEqual(parseQuery('Mąka ŻYTNIA'), [
      { word: 'maka', stem: 'mak' },
      { word: 'zytnia', stem: 'zytni' },
    ]);
  });

  it('is empty for a blank', () => {
    assert.deepEqual(parseQuery(''), []);
    assert.deepEqual(parseQuery('   '), []);
  });
});

describe('grade', () => {
  const grading = (list, typed) => grade(list, terms(typed)[0]);

  it('is 6 for the same word', () => {
    assert.equal(grading(['flour', 'water'], 'water'), 6);
  });

  it('is 4 for a word that begins with the term', () => {
    assert.equal(grading(['flours'], 'flour'), 4);
  });

  it('is 2 for a word that shares the stem only', () => {
    assert.equal(grading(['maki'], 'maka'), 2);
  });

  it('is 0 when nothing matches', () => {
    assert.equal(grading(['oven'], 'flour'), 0);
    assert.equal(grading([], 'flour'), 0);
  });

  it('takes the best word, not the first', () => {
    assert.equal(grading(['maki', 'makaron', 'maka'], 'maka'), 6);
    assert.equal(grading(['maki', 'makaron'], 'maka'), 4);
  });

  it('does not lower a prefix grade for a later stem match', () => {
    assert.equal(grading(['makaron', 'maki'], 'maka'), 4);
  });
});

describe('rank', () => {
  const records = (entries) => buildRecords(entries);
  const hits = (entries, typed) => rank(records(entries), terms(typed));

  it('finds nothing for no match', () => {
    assert.deepEqual(hits([h(2, 'a', 'Dough'), p('Flour')], 'oven'), []);
  });

  it('requires every term (AND)', () => {
    const found = hits(
      [h(2, 'a', 'Dough'), p('flour and water'), p('only flour')],
      'flour water',
    );
    assert.equal(found.length, 1);
    assert.equal(found[0].text, 'flour and water');
  });

  it('matches the last typed word as a prefix', () => {
    const found = hits([h(2, 'a', 'Dough'), p('hydration of dough')], 'hydr');
    assert.equal(found.length, 1);
  });

  it('ignores diacritics and case on both sides', () => {
    const found = hits([h(2, 'a', 'Mąka'), p('Mąka żytnia')], 'ZYTNIA maka');
    assert.deepEqual(ids(found), ['a']);
  });

  it('finds Cyrillic text typed in another case', () => {
    const found = hits([h(2, 'a', 'Тісто'), p('Замісіть ТІСТО')], 'тісто');
    assert.deepEqual(
      found.map(({ type }) => type),
      ['chapter'],
    );
  });

  it('puts an exact title first, then chapters, questions and text', () => {
    const found = hits(
      [
        h(2, 'c1', 'Dough rest'),
        p('about dough', {}),
        q('f1', 'Why dough sticks?'),
        h(2, 'c2', 'Dough'),
      ],
      'dough',
    );
    assert.deepEqual(
      found.map(({ id, type }) => `${id}:${type}`),
      ['c2:chapter', 'c1:chapter', 'f1:question'],
    );
  });

  it('keeps the exact title first even when it comes last', () => {
    const found = hits([h(2, 'a', 'Dough rest'), h(2, 'b', 'Dough')], 'dough');
    assert.deepEqual(ids(found), ['b', 'a']);
  });

  it('does not give a text the exact-title tier', () => {
    const found = hits([h(2, 'a', 'Dough rest'), p('dough')], 'dough');
    assert.deepEqual(
      found.map(({ type }) => type),
      ['chapter'],
    );
  });

  it('prefers the better match within a kind', () => {
    const found = hits([h(2, 'a', 'Flours'), h(2, 'b', 'Flour mill')], 'flour');
    assert.deepEqual(ids(found), ['b', 'a']);
  });

  it('prefers the shorter text on equal grades', () => {
    const found = hits(
      [h(2, 'a', 'Salty and long title'), h(2, 'b', 'Salty title')],
      'salt',
    );
    assert.deepEqual(ids(found), ['b', 'a']);
  });

  it('shows a place once: the best record of an id wins', () => {
    const found = hits(
      [h(2, 'a', 'Salt'), p('salt water'), h(2, 'b', 'Other'), p('more salt')],
      'salt',
    );
    assert.deepEqual(ids(found), ['a', 'b']);
    assert.equal(found[0].type, 'chapter');
  });

  it('counts a word of the title above a text, but not alone', () => {
    const entries = [h(2, 'a', 'Poolish'), p('ferment overnight')];
    assert.deepEqual(ids(hits(entries, 'poolish ferment')), ['a']);
    assert.equal(hits(entries, 'poolish ferment')[0].type, 'text');
    assert.deepEqual(hits(entries, 'poolish'), [hits(entries, 'poolish')[0]]);
    assert.equal(hits(entries, 'poolish')[0].type, 'chapter');
  });

  it('is no hit when the record own words match nothing', () => {
    const entries = [h(2, 'a', 'Poolish'), p('ferment overnight')];
    const found = rank(
      records(entries).filter(({ type }) => type === 'text'),
      terms('poolish'),
    );
    assert.deepEqual(found, []);
  });

  it('is no hit when one term is missing, title or not', () => {
    const entries = [h(2, 'a', 'Poolish'), p('ferment overnight')];
    assert.deepEqual(hits(entries, 'poolish baking'), []);
  });

  it('leaves out text under a question when the text is above any title', () => {
    assert.deepEqual(hits([p('salt')], 'salt'), []);
  });

  it('cuts the list at ten', () => {
    const entries = Array.from({ length: 15 }, (_, i) =>
      h(2, `s${i}`, `Salt ${i}`),
    );
    const found = hits(entries, 'salt');
    assert.equal(found.length, 10);
  });

  it('has no hits for no terms to match', () => {
    assert.deepEqual(hits([h(2, 'a', 'Dough')], ''), []);
  });
});

describe('segments', () => {
  it('marks matching words and keeps the text between', () => {
    assert.deepEqual(segments('Mix flour, then water.', terms('flour water')), [
      { text: 'Mix ', mark: false },
      { text: 'flour', mark: true },
      { text: ', then ', mark: false },
      { text: 'water', mark: true },
      { text: '.', mark: false },
    ]);
  });

  it('joins back to the original text', () => {
    const text = 'Mąka żytnia — 70% (łatwa) mąki';
    const joined = segments(text, terms('maka'))
      .map((x) => x.text)
      .join('');
    assert.equal(joined, text);
  });

  it('marks across diacritics and by stem', () => {
    assert.deepEqual(marked('Mąki i mąkę', 'maka'), ['Mąki', 'mąkę']);
  });

  it('marks the word that begins with a typed word', () => {
    assert.deepEqual(marked('hydration', 'hydr'), ['hydration']);
  });

  it('marks a Cyrillic word', () => {
    assert.deepEqual(marked('Тісто і ТІСТА', 'тісто'), ['Тісто', 'ТІСТА']);
  });

  it('has no mark where nothing matches', () => {
    assert.deepEqual(segments('plain text', terms('oven')), [
      { text: 'plain text', mark: false },
    ]);
  });

  it('starts with a mark and ends with a mark without empty pieces', () => {
    assert.deepEqual(segments('salt', terms('salt')), [
      { text: 'salt', mark: true },
    ]);
  });

  it('is empty for an empty text', () => {
    assert.deepEqual(segments('', terms('salt')), []);
  });

  it('marks nothing for no terms', () => {
    assert.deepEqual(marked('some words', ''), []);
  });

  it('keeps a no-break space in the unmarked piece', () => {
    assert.deepEqual(segments('a salt', terms('salt')), [
      { text: 'a ', mark: false },
      { text: 'salt', mark: true },
    ]);
  });
});

describe('excerpt', () => {
  const filler = (n) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ');

  it('returns a short text whole', () => {
    assert.equal(excerpt('short text', terms('text')), 'short text');
    assert.equal(excerpt('x'.repeat(150), terms('x')), 'x'.repeat(150));
  });

  it('cuts a long text at the end with an ellipsis', () => {
    const text = `salt ${filler(80)}`;
    const shown = excerpt(text, terms('salt'));
    assert.ok(shown.startsWith('salt '));
    assert.ok(shown.endsWith('…'));
    assert.ok(shown.length <= 152);
  });

  it('starts a little before a late match, with an ellipsis, at a word', () => {
    const text = `${filler(60)} salt ${filler(10)}`;
    const shown = excerpt(text, terms('salt'));
    assert.ok(shown.startsWith('…'));
    assert.ok(shown.includes('salt'));
    assert.match(shown.slice(1), /^w\d+ /);
  });

  it('has no ending ellipsis when the stretch reaches the end', () => {
    const text = `${filler(60)} salt end`;
    const shown = excerpt(text, terms('salt'));
    assert.ok(shown.startsWith('…'));
    assert.ok(shown.endsWith('salt end'));
  });

  it('prefers the stretch that shows more different terms', () => {
    const text = `salt ${filler(60)} flour water ${filler(5)}`;
    const shown = excerpt(text, terms('salt flour water'));
    assert.ok(shown.includes('flour water'));
    assert.ok(!shown.includes('salt'));
  });

  it('counts a term only when it ends inside the stretch', () => {
    // `flour` ends at 114: one past the end of a stretch that starts at 0
    // and runs to 113, so the stretch of `flour` and `water` wins.
    const text = `salt ${'x '.repeat(52)}flour ${'x '.repeat(20)}water ${'x '.repeat(40)}`;
    assert.equal(text.indexOf('flour') + 'flour'.length, 114);
    const shown = excerpt(text, terms('salt flour water'));
    assert.ok(shown.startsWith('…'));
    assert.ok(shown.includes('flour'));
    assert.ok(shown.includes('water'));
    assert.ok(!shown.includes('salt'));
  });

  it('counts a term that ends just inside the stretch', () => {
    const text = `salt ${'x '.repeat(52)}flo ${'x '.repeat(20)}water ${'x '.repeat(40)}`;
    assert.equal(text.indexOf('flo') + 'flo'.length, 112);
    const shown = excerpt(text, terms('salt flo water'));
    assert.ok(shown.startsWith('salt'));
  });

  it('does not cut the start of a text for a match near its start', () => {
    const text = `x x x x x salt${' x'.repeat(80)}`;
    const shown = excerpt(text, terms('salt'));
    assert.ok(shown.startsWith('x x x x x salt'));
  });

  it('keeps the earliest stretch on a tie', () => {
    const text = `salt ${filler(60)} salt ${filler(5)}`;
    assert.ok(excerpt(text, terms('salt')).startsWith('salt'));
  });

  it('starts at the beginning when there is no match', () => {
    const text = filler(80);
    const shown = excerpt(text, terms('oven'));
    assert.ok(shown.startsWith('w0 '));
    assert.ok(shown.endsWith('…'));
  });

  it('drops trailing punctuation and spaces before the ellipsis', () => {
    const text = `${'a'.repeat(100)}, ${'b'.repeat(100)}`;
    const shown = excerpt(text, terms('a'));
    assert.equal(shown, `${'a'.repeat(100)}…`);
  });

  it('cuts at least half a snippet when there is no space to cut at', () => {
    const shown = excerpt('x'.repeat(400), terms('zzz'));
    assert.equal(shown, `${'x'.repeat(75)}…`);
  });
});

describe('buildRecords', () => {
  it('makes one record per heading, question and block, in order', () => {
    const records = buildRecords([
      h(2, 'a', 'Dough'),
      p('Mix it'),
      q('f', 'Why?'),
      p('Because', { inQuestion: true }),
    ]);
    assert.deepEqual(
      records.map(({ type, id }) => `${type}:${id}`),
      ['chapter:a', 'text:a', 'question:f', 'text:f'],
    );
  });

  it('leaves out text above the first title', () => {
    assert.deepEqual(buildRecords([p('lost'), h(2, 'a', 'A')]).length, 1);
  });

  it('gives a record its folded words, key and length', () => {
    const [record] = buildRecords([h(2, 'a', 'Mąka  żytnia')]);
    assert.deepEqual(record.words, ['maka', 'zytnia']);
    assert.equal(record.key, 'maka zytnia');
    assert.equal(record.length, 'Mąka  żytnia'.length);
    assert.equal(record.level, 2);
    assert.equal(record.where, '');
    assert.deepEqual(record.whereWords, []);
  });

  it('gives a level 3 heading its chapter as the title above', () => {
    const records = buildRecords([h(2, 'c', 'Dough'), h(3, 's', 'Rest')]);
    assert.equal(records[1].where, 'Dough');
    assert.deepEqual(records[1].whereWords, ['dough']);
    assert.equal(records[1].level, 3);
  });

  it('gives a level 2 heading and a heading after it no chapter of the previous one', () => {
    const records = buildRecords([
      h(2, 'c1', 'One'),
      h(2, 'c2', 'Two'),
      h(3, 's', 'Sub'),
    ]);
    assert.equal(records[1].where, '');
    assert.equal(records[2].where, 'Two');
  });

  it('does not make a level 3 heading a chapter for the next', () => {
    const records = buildRecords([
      h(2, 'c', 'Chapter'),
      h(3, 's1', 'First'),
      h(3, 's2', 'Second'),
    ]);
    assert.equal(records[2].where, 'Chapter');
  });

  it('gives a text the heading it stands under, and its own element', () => {
    const records = buildRecords([h(3, 's', 'Sub'), p('body')]);
    assert.equal(records[1].where, 'Sub');
    assert.equal(records[1].el, 'body');
    assert.equal(records[1].focus, 'body');
  });

  it('gives an answer text the question summary as focus', () => {
    const records = buildRecords([
      h(2, 'a', 'A'),
      q('f', 'Why?'),
      p('Because', { inQuestion: true }),
    ]);
    assert.equal(records[2].id, 'f');
    assert.equal(records[2].focus, 'f-summary');
    assert.equal(records[2].el, 'Because');
    assert.equal(records[2].where, 'Why?');
  });

  it('gives a question the heading above it', () => {
    const records = buildRecords([h(2, 'a', 'Dough'), q('f', 'Why?')]);
    assert.equal(records[1].where, 'Dough');
    assert.equal(records[1].focus, 'f-summary');
    assert.equal(records[1].level, 0);
  });

  it('is empty for no entries', () => {
    assert.deepEqual(buildRecords([]), []);
  });
});

describe('describe', () => {
  const strings = { browse: 'B', count: 'C', none: 'N' };

  it('is browse when nothing is typed, whatever there is to list', () => {
    assert.deepEqual(describeState(0, 5, strings), {
      state: 'browse',
      message: 'B',
    });
    assert.deepEqual(describeState(0, 0, strings).state, 'browse');
  });

  it('is none when something was typed and nothing found', () => {
    assert.deepEqual(describeState(2, 0, strings), {
      state: 'none',
      message: 'N',
    });
  });

  it('is results otherwise', () => {
    assert.deepEqual(describeState(1, 3, strings), {
      state: 'results',
      message: 'C',
    });
  });
});

describe('shortcutLabel', () => {
  it('is the command sign on Apple platforms', () => {
    for (const platform of ['MacIntel', 'iPhone', 'iPad', 'iPod touch'])
      assert.equal(shortcutLabel(platform), '⌘K');
  });

  it('is Ctrl K elsewhere', () => {
    for (const platform of ['Win32', 'Linux x86_64', ''])
      assert.equal(shortcutLabel(platform), 'Ctrl K');
  });
});

describe('wantsSearch', () => {
  const key = (extra) => ({
    key: 'k',
    code: 'KeyK',
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...extra,
  });

  it('accepts Ctrl+K and Cmd+K', () => {
    assert.equal(wantsSearch(key({ ctrlKey: true })), true);
    assert.equal(wantsSearch(key({ metaKey: true })), true);
  });

  it('goes by the key place: a layout where K is another letter works', () => {
    assert.equal(wantsSearch(key({ ctrlKey: true, key: 'л' })), true);
  });

  it('refuses a bare K (WCAG 2.1.4)', () => {
    assert.equal(wantsSearch(key({})), false);
  });

  it('refuses another key with Ctrl', () => {
    assert.equal(wantsSearch(key({ ctrlKey: true, code: 'KeyJ' })), false);
  });

  it('refuses Alt and Shift as extra modifiers', () => {
    assert.equal(wantsSearch(key({ ctrlKey: true, altKey: true })), false);
    assert.equal(wantsSearch(key({ ctrlKey: true, shiftKey: true })), false);
    assert.equal(wantsSearch(key({ metaKey: true, shiftKey: true })), false);
  });

  it('refuses AltGr style Ctrl+Alt', () => {
    assert.equal(
      wantsSearch(key({ ctrlKey: true, altKey: true, metaKey: true })),
      false,
    );
  });
});

// A fake page for `collect`: elements with just what it asks of them.
function el(tag, text, { id = '', cls = [], kids = [], parent = null } = {}) {
  const node = {
    tagName: tag.toUpperCase(),
    id,
    parent,
    textContent: text,
    kids,
    cls,
    cells: [],
    removed: false,
    matches(selector) {
      return selector.split(',').some((s) => s.trim() === tag);
    },
    closest(selector) {
      for (let at = node; at; at = at.parent)
        if (selector.split(',').some((s) => at.has(s.trim()))) return at;
      return null;
    },
    has(selector) {
      return (
        selector === tag ||
        (selector.startsWith('.') && cls.includes(selector.slice(1))) ||
        (selector === '[role="status"]' && node.role === 'status')
      );
    },
    querySelector(selector) {
      return (
        selector
          .split(',')
          .map((s) => s.trim())
          .some((s) => kids.some((k) => k.has(s))) || null
      );
    },
    cloneNode() {
      return el(tag, text, { id, cls, kids: kids.map((k) => k.copy()) });
    },
    copy() {
      return node;
    },
    remove() {
      node.removed = true;
    },
    get firstElementChild() {
      return kids[0];
    },
  };
  for (const kid of kids) kid.parent = node;
  return node;
}

describe('collect', () => {
  const page = (...blocks) => ({ querySelectorAll: () => blocks });

  it('reads a heading with its level, id and title without the permalink', () => {
    const heading = el('h2', '', { id: 'dough' });
    heading.cloneNode = () => {
      const anchor = {
        gone: false,
        remove() {
          this.gone = true;
        },
      };
      return {
        querySelectorAll: () => [anchor],
        get textContent() {
          return anchor.gone ? ' Dough  rest ' : ' Dough  rest #';
        },
      };
    };
    assert.deepEqual(collect(page(heading)), [
      {
        kind: 'heading',
        level: 2,
        id: 'dough',
        el: heading,
        text: 'Dough rest',
      },
    ]);
  });

  it('reads a level 3 heading as level 3', () => {
    const heading = el('h3', 'Sub', { id: 's' });
    heading.cloneNode = () => ({
      textContent: 'Sub',
      querySelectorAll: () => [],
    });
    assert.equal(collect(page(heading))[0].level, 3);
  });

  it('reads a question from the summary of its details', () => {
    const summary = el('summary', '  Why\n does it stick? ');
    const faq = el('details', '', { id: 'faq', kids: [summary] });
    assert.deepEqual(collect(page(faq)), [
      { kind: 'question', id: 'faq', el: summary, text: 'Why does it stick?' },
    ]);
  });

  it('reads a paragraph as text, and knows when it is in an answer', () => {
    const para = el('p', 'Mix  well');
    const inFaq = el('p', 'Because');
    el('details', '', { kids: [inFaq] });
    const [one, two] = collect(page(para, inFaq));
    assert.deepEqual(one, {
      kind: 'text',
      el: para,
      text: 'Mix well',
      inQuestion: false,
    });
    assert.equal(two.inQuestion, true);
  });

  it('reads a table row cell by cell', () => {
    const row = el('tr', 'ignored');
    row.cells = [{ textContent: ' Flour ' }, { textContent: '60 %' }];
    assert.equal(collect(page(row))[0].text, 'Flour · 60 %');
  });

  it('leaves out blocks that hold other blocks or controls', () => {
    const outer = el('li', 'x', { kids: [el('ul', 'y')] });
    const control = el('p', 'x', { kids: [el('button', 'y')] });
    assert.deepEqual(collect(page(outer, control)), []);
  });

  it('leaves out the notices and chrome of the page', () => {
    const status = el('p', 'Found 3');
    status.role = 'status';
    const badge = el('p', 'new', { cls: ['card-badge'] });
    const filter = el('li', 'all', { cls: ['cards-filter'] });
    assert.deepEqual(collect(page(status, badge, filter)), []);
  });
});
