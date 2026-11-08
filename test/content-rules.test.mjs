import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { lintContent } from '../scripts/lib/content-rules.mjs';
import { compileRules } from '../scripts/lib/rules.mjs';
import { capture, codes, view } from './helpers/capture.mjs';
import { defaultRules, memory, section } from './helpers/content-memory.mjs';
import { REAL_ROOT } from './helpers/repo.mjs';

const FILE = '01-intro.md';

/** Lints a compendium in memory and returns the reporter. */
function lint(spec, { rules = defaultRules(), only = null } = {}) {
  const { languages, content } = memory(spec);
  const reporter = capture();
  lintContent({ rules, languages, content, reporter, only });
  return reporter;
}

/** `text` as a section of a draft language (the pattern rules only). */
function lintIn(code, text, rules = defaultRules()) {
  const spec = { pl: { files: { [FILE]: section('Tekst.') } } };
  spec[code] =
    code === 'pl' ? spec.pl : { status: 'draft', files: { [FILE]: text } };
  if (code === 'pl') spec.pl.files[FILE] = text;
  return lint(spec, { rules });
}

describe('the rule table: every rule of content/rules.json has its proof', () => {
  const real = JSON.parse(
    fs.readFileSync(path.join(REAL_ROOT, 'content/rules.json'), 'utf8'),
  );
  const { set, problems } = compileRules(real);
  const ALL = ['pl', 'en', 'uk'];

  // id -> level, what the rule must flag, what it must let through. `langs`
  // says in which languages the text is tried (default: every language the
  // rule applies to). Every language of the rule's scope needs a "flag" and a
  // "pass" case. A rule that reads `acrossLines` flags a phrase that a line
  // break splits, on the line where it starts.
  const TABLE = {
    'exclamation-chain': {
      level: 'error',
      flag: [{ text: 'Wow!! pizza' }],
      pass: [{ text: 'Wow! pizza' }, { text: 'Wow! Pizza! Really!' }],
    },
    'control-characters': {
      level: 'error',
      flag: [
        { text: 'zero​width' },
        { text: 'escape\u001B[2J' },
        { text: 'override‮text' },
      ],
      pass: [{ text: 'plain\ttext with a tab' }, { text: 'zażółć gęślą jaźń' }],
    },
    smiley: {
      level: 'error',
      flag: [
        { text: 'nice :)' },
        { text: 'nice ;-) really' },
        { text: 'well :D' },
        { text: 'hot \u{1F355}' },
        { text: 'sun ☀️' },
        { text: 'a\uFE0Fb' },
      ],
      pass: [
        { text: 'Flour:Dough ratio' },
        { text: 'note:) glued' },
        { text: 'colon: after' },
      ],
    },
    'plus-minus': {
      level: 'error',
      flag: [{ text: '10 +/- 2' }],
      pass: [{ text: '10 plus or minus 2' }, { text: '+2 and -2' }],
    },
    'external-link': {
      level: 'error',
      flag: [
        { text: 'see [x](https://a.b)' },
        { text: 'see HTTP://a.b' },
        { text: 'see [x](mailto:a@b.cc)' },
        { text: 'see [x](page.html)' },
        { text: 'see www.example.com' },
        { text: 'write to me@a.com' },
      ],
      pass: [
        { text: 'see [x](#intro)' },
        { text: 'see ![x](img/a.webp)' },
        { text: 'a-b and 3.5 and a@ b' },
      ],
    },
    'retailer-or-where-to-buy': {
      level: 'error',
      acrossLines: true,
      flag: [
        { text: 'and where to\nbuy flour', langs: ['en'] },
        { text: 'buy at Del\nDuca' },
        { text: 'buy at Lidl' },
        { text: 'buy at Biedronka' },
        { text: 'buy at Allegro' },
        { text: 'buy at Makro' },
        { text: 'buy at Leclerc' },
        { text: 'buy at Auchan' },
        { text: 'buy at Obi' },
        { text: 'buy at Castorama' },
        { text: 'buy at Del Duca' },
        { text: 'buy at delduca' },
        { text: 'buy at the SUPERMARKET' },
        { text: 'купуй у супермаркеті', langs: ['uk'] },
        { text: 'kup w hurtowni', langs: ['pl'] },
        { text: 'where to buy flour', langs: ['en'] },
        { text: 'gdzie kupować mąkę', langs: ['pl'] },
        { text: 'де купувати борошно', langs: ['uk'] },
      ],
      pass: [
        { text: 'buy flour' },
        { text: 'a Maker of dough' },
        { text: 'a Lid on the pot' },
        { text: 'a Makrobiotic diet' },
        { text: 'an Obit' },
        { text: 'Delta Duca' },
      ],
    },
    'non-dollar-currency': {
      level: 'error',
      flag: [
        { text: 'costs 250 PLN' },
        { text: 'costs 5 €' },
        { text: 'costs €5' },
        { text: 'costs 5 euro' },
        { text: 'costs 5 EURO' },
        { text: 'costs 5 złotych', langs: ['pl'] },
        { text: 'costs 5 $' },
        { text: 'costs $ 5' },
        { text: 'costs 5 dollars', langs: ['en'] },
        { text: 'коштує 5 доларів', langs: ['uk'] },
        { text: 'koszt 5 dolarów', langs: ['pl'] },
      ],
      pass: [
        { text: 'costs $250' },
        { text: 'costs $3–5' },
        { text: 'costs $1,000' },
        { text: 'the zlotnik and euros' },
        { text: 'a PLNx code' },
      ],
    },
    'club-mention': {
      level: 'error',
      acrossLines: true,
      flag: [
        { text: 'thanks to KMP' },
        { text: 'thanks to klub miłośników' },
        { text: 'thanks to the Klub\nMiłośników' },
      ],
      pass: [{ text: 'thanks to the people' }, { text: 'the KM distance' }],
    },
    'social-link': {
      level: 'error',
      flag: [
        { text: 'on Facebook' },
        { text: 'a youtube video' },
        { text: 'docs.google' },
        { text: 'drive.google' },
        { text: 'FACEBOOK' },
      ],
      pass: [{ text: 'on a forum' }],
    },
    'jargon-to-tk': {
      level: 'error',
      only: ['pl'],
      flag: [{ text: 'robimy TO ciasto' }, { text: 'mąka TK 00' }],
      pass: [
        { text: 'to ciasto' },
        { text: 'Sekcja {#TO}' },
        { text: 'TOTAL' },
      ],
    },
    'jargon-hydro': {
      level: 'error',
      flag: [{ text: 'a low hydro dough' }, { text: 'HYDRO' }],
      pass: [{ text: 'a hydrophobic dough' }, { text: 'high hydration' }],
    },
    'hyphen-range-use-en-dash': {
      level: 'error',
      flag: [{ text: 'bake 3-5 minutes' }, { text: '1-2 and 3-5' }],
      pass: [
        { text: 'bake 3–5 minutes' },
        { text: 'see [x](#step-1-2)' },
        { text: 'see https://a.b/1-2' },
        { text: 'a {#step-1-2}' },
        { text: 'a img=a-1-2.webp' },
        { text: 'see [x](img/a-1-2.webp)' },
        { text: 'a well-known 3 - 5' },
      ],
    },
    'uk-ascii-apostrophe': {
      level: 'error',
      only: ['uk'],
      flag: [{ text: "м'ясо" }],
      pass: [{ text: 'м’ясо' }, { text: "it's the dough" }],
    },
    'country-specific-remark-outside-local-block': {
      level: 'error',
      localExempt: true,
      acrossLines: true,
      flag: [
        { text: 'in Poland' },
        { text: 'made in poland, sold in ukraine' },
        { text: 'Polish pizzerias' },
        { text: 'POLISH pizzerias' },
        { text: 'our country' },
        { text: 'in our\ncountry' },
        { text: 'Piec ' + 'ukraiński'.replace('ń', 'n\u0301'), langs: ['pl'] },
        { text: 'Піца У ПОЛЬЩІ', langs: ['uk'] },
        { text: 'у нашій\nкраїні', langs: ['uk'] },
        { text: 'w Polsce', langs: ['pl'] },
        { text: 'polskie sklepy', langs: ['pl'] },
        { text: 'w naszym kraju', langs: ['pl'] },
        { text: 'в Україні', langs: ['uk'] },
        { text: 'польські піци', langs: ['uk'] },
        { text: 'у нашій країні', langs: ['uk'] },
      ],
      pass: [
        { text: 'Neapolitan pizza' },
        { text: 'Italian flour' },
        { text: 'polished stone' },
        { text: 'polish the stone, then the tent poles' },
        { text: 'our\n\ncountry' },
      ],
    },
    'mixed-script-word': {
      level: 'error',
      flag: [
        { text: 'In P\u043eland' },
        { text: 'Піц\u0061 тут' },
        { text: 'a \u0441aputo flour' },
      ],
      pass: [
        { text: 'Caputo і борошно' },
        { text: 'mąka Caputo' },
        { text: '180°С in an oven' },
      ],
    },
    'en-article-before-vowel': {
      level: 'error',
      only: ['en'],
      acrossLines: true,
      flag: [
        { text: 'in a ordinary oven' },
        { text: 'Bake it. A ordinary oven works.' },
        { text: 'A hour later' },
        { text: 'in a\nordinary oven' },
      ],
      pass: [
        { text: 'in an ordinary oven' },
        { text: 'a one-hour rest and a useful tool' },
        { text: 'a unique, uniform dough' },
        { text: 'Plan a. Other things' },
        { text: 'data ordinary' },
      ],
    },
    'en-american-spelling': {
      level: 'warning',
      only: ['en'],
      flag: [{ text: 'a rich color' }, { text: 'a rich Color' }],
      pass: [{ text: 'a rich colour' }],
    },
    'straight-double-quote': {
      level: 'warning',
      flag: [{ text: 'He said "hi"' }],
      pass: [
        { text: 'He said “hi”' },
        { text: '![He said "hi"](img/a.webp)' },
        { text: 'see [x](#intro "t")' },
        { text: '::: tip "Title"' },
        { text: 'a img="a" b' },
        { text: 'see [x](img/"a".webp)' },
      ],
    },
    'all-caps-word': {
      level: 'warning',
      flag: [
        { text: 'the PIZZA oven' },
        { text: 'піца У ПЕЧІ' },
        { text: 'mąka ŻÓŁTA' },
      ],
      pass: [
        { text: 'the FAQ and the HTML' },
        { text: 'ids {#PIZZA}' },
        { text: 'a img=OVEN.webp' },
        { text: 'see [x](img/OVEN.webp)' },
        { text: 'see [x](#OVEN)' },
        { text: 'the OVN-x' },
        { text: 'abc ABC' },
      ],
    },
    'double-space': {
      level: 'warning',
      flag: [{ text: 'two  spaces' }],
      pass: [
        { text: '    indented text' },
        { text: '| a  b |' },
        { text: 'one space' },
      ],
    },
    'exclamation-mark': {
      level: 'warning',
      flag: [{ text: 'Nice!' }],
      pass: [
        { text: 'Nice.' },
        { text: '![alt](img/a.webp)' },
        { text: 'a <!-- note --> b' },
      ],
    },
  };

  const codeOf = (rule) =>
    `${rule.level === 'error' ? 'E' : 'W'}_${rule.id.toUpperCase().replace(/-/g, '_')}`;
  const scopeOf = (rule) => (rule.languages ? [...rule.languages] : ALL);

  it('compiles the real rules.json without problems', () => {
    assert.deepEqual(problems, []);
  });

  it('has an entry for every rule and no entry for a rule that is gone', () => {
    assert.deepEqual(
      Object.keys(TABLE).sort(),
      set.rules.map((rule) => rule.id).sort(),
    );
  });

  for (const rule of set.rules) {
    const entry = TABLE[rule.id];
    if (!entry) continue;
    describe(rule.id, () => {
      const code = codeOf(rule);
      const scope = scopeOf(rule);

      it('has the severity, scope and exemption the table expects', () => {
        assert.equal(rule.level, entry.level);
        assert.deepEqual(entry.only ?? ALL, scope);
        assert.equal(rule.localExempt, entry.localExempt === true);
        assert.equal(rule.acrossLines, entry.acrossLines === true);
      });

      for (const lang of scope)
        it(`flags its cases in ${lang} as ${code}`, () => {
          const cases = entry.flag.filter((c) =>
            (c.langs ?? scope).includes(lang),
          );
          assert.ok(cases.length > 0, `no flag case for ${lang}`);
          for (const { text } of cases) {
            const reporter = lintIn(lang, section(text), set);
            const found = reporter.entries.filter((e) => e.code === code);
            assert.equal(found.length, 1, `${text} -> ${codes(reporter)}`);
            assert.equal(found[0].level, rule.level);
            assert.equal(found[0].file, `content/${lang}/${FILE}`);
            assert.equal(found[0].line, 3);
          }
        });

      for (const lang of scope)
        it(`lets its other cases through in ${lang}`, () => {
          const cases = entry.pass.filter((c) =>
            (c.langs ?? scope).includes(lang),
          );
          assert.ok(cases.length > 0, `no pass case for ${lang}`);
          for (const { text } of cases) {
            const reporter = lintIn(lang, section(text), set);
            assert.ok(!codes(reporter).includes(code), `${text} was flagged`);
          }
        });

      for (const lang of ALL.filter((l) => !scope.includes(l)))
        it(`does not apply in ${lang}`, () => {
          for (const { text } of entry.flag) {
            const reporter = lintIn(lang, section(text), set);
            assert.ok(!codes(reporter).includes(code), `${text} was flagged`);
          }
        });

      it('has, for every pattern of the rule, a flag case that it alone matches', () => {
        const raw = real.rules.find((r) => r.id === rule.id);
        raw.patterns.forEach((pattern, index) => {
          const alone = compileRules({
            views: real.views,
            rules: [{ ...raw, patterns: [pattern] }],
          }).set;
          const hit = scope.some((lang) =>
            entry.flag
              .filter((c) => (c.langs ?? scope).includes(lang))
              .some(({ text }) =>
                codes(lintIn(lang, section(text), alone)).includes(code),
              ),
          );
          assert.ok(hit, `no flag case for pattern ${index}: ${pattern}`);
        });
      });

      if (rule.localExempt)
        for (const lang of scope)
          it(`is not applied inside a local block of ${lang}`, () => {
            for (const { text } of entry.flag.filter((c) =>
              (c.langs ?? scope).includes(lang),
            )) {
              const body = `::: local lang=${lang} Note\n${text}\n:::`;
              const reporter = lintIn(lang, section(body), set);
              assert.ok(!codes(reporter).includes(code), `${text} was flagged`);
            }
          });
    });
  }
});

describe('pattern rules, with the small default rules', () => {
  it('report the line number and the file of the language', () => {
    const reporter = lintIn('en', '## Intro {#intro}\n\nfine\n\nWow!!\n');
    assert.deepEqual(view(reporter), [
      {
        level: 'error',
        code: 'E_EXCLAMATION_CHAIN',
        file: 'content/en/01-intro.md',
        line: 5,
      },
      {
        level: 'warning',
        code: 'W_EXCLAMATION_MARK',
        file: 'content/en/01-intro.md',
        line: 5,
      },
    ]);
  });

  it('names each distinct match once in the message', () => {
    const reporter = lintIn('en', section('Poland Poland Polish'));
    assert.equal(
      reporter.entries.find((e) => e.code === 'E_COUNTRY_REMARK').message,
      'shared text is country-neutral: "Poland", "Polish"',
    );
  });

  it('skip a line that is blank and a line the rule skips', () => {
    assert.deepEqual(
      codes(lintIn('en', section('   \n![a!](img/a.webp)'))),
      [],
    );
  });

  it('let a match through that the rule allows, and flag its neighbours', () => {
    assert.deepEqual(codes(lintIn('en', section('FAQ and HTML'))), []);
    assert.deepEqual(codes(lintIn('en', section('FAQ and PIZZA'))), [
      'W_ALL_CAPS_WORD',
    ]);
  });

  it('read a rule through its view: an id is cut away first', () => {
    assert.deepEqual(codes(lintIn('en', '## Pizza {#PIZZA}\n')), []);
  });

  it('apply a rule that is not language-limited to every language', () => {
    for (const lang of ['pl', 'en', 'uk'])
      assert.deepEqual(codes(lintIn(lang, section('Wow!!'))), [
        'E_EXCLAMATION_CHAIN',
        'W_EXCLAMATION_MARK',
      ]);
  });

  it('a rule with several patterns is flagged once per line, all matches named', () => {
    const rules = compileRules({
      rules: [{ id: 'x', level: 'error', message: 'm', patterns: ['a', 'b'] }],
    }).set;
    const reporter = lintIn('pl', section('a b a'), rules);
    assert.equal(reporter.entries.length, 1);
    assert.equal(reporter.entries[0].message, 'm: "a", "b"');
  });

  it('a regexp with a g flag does not remember a position between lines', () => {
    const reporter = lintIn('pl', section('Poland\n\nPoland\n\nPoland'));
    assert.equal(
      reporter.entries.filter((e) => e.code === 'E_COUNTRY_REMARK').length,
      3,
    );
  });
});

// The small rules warn about the "!" of "<!--" (the real rule does too).
const apart = (reporter) =>
  codes(reporter).filter((code) => code !== 'W_EXCLAMATION_MARK');

describe('a rule that reads across lines', () => {
  const phrase = (over = {}) =>
    compileRules({
      views: { 'no-ids': [{ replace: '\\{#[\\w-]+\\}', with: '' }] },
      rules: [
        {
          id: 'phrase',
          level: 'error',
          message: 'no phrase',
          patterns: ['\\bour country\\b', '\\bwhere to buy\\b'],
          flags: 'i',
          acrossLines: true,
          ...over,
        },
      ],
    }).set;
  const found = (text, rules = phrase()) =>
    view(lintIn('en', section(text), rules)).map((e) => `${e.code}:${e.line}`);

  it('finds a phrase broken over two lines or more, on the line it starts', () => {
    assert.deepEqual(found('Made in our\ncountry.'), ['E_PHRASE:3']);
    assert.deepEqual(found('Text.\nAnd where\n  to\nbuy it.'), ['E_PHRASE:4']);
    assert.deepEqual(found('- where to\n  buy'), ['E_PHRASE:3']);
  });

  it('reports a line once, whether its phrase is on it or runs on from it', () => {
    assert.deepEqual(found('our country, our\ncountry'), ['E_PHRASE:3']);
    assert.deepEqual(found('a\n\nour country\n\nb'), ['E_PHRASE:5']);
  });

  it('does not join across a blank line, a new block, a heading or a list item', () => {
    for (const text of [
      'our\n\ncountry',
      'our\n::: tip\ncountry\n:::',
      'our\n## country {#c}',
      'our\n- country',
      'our\n1. country',
      'our\n| country |',
      'where to\n* buy',
    ])
      assert.deepEqual(found(text), [], text);
  });

  it('does not join across a line the rule leaves alone', () => {
    assert.deepEqual(
      found('our\nskip\ncountry', phrase({ skip: '^skip' })),
      [],
    );
    const local = '::: local lang=en Note\ncountry\n:::';
    assert.deepEqual(found(`our\n${local}`, phrase({ localExempt: true })), []);
  });

  it('reads the lines through the view, and lets an allowed phrase through', () => {
    assert.deepEqual(found('our {#x}\ncountry', phrase({ view: 'no-ids' })), [
      'E_PHRASE:3',
    ]);
    assert.deepEqual(
      found('our\ncountry', phrase({ allow: ['our country'] })),
      [],
    );
  });

  it('is not done for a rule that does not ask for it', () => {
    assert.deepEqual(found('our\ncountry', phrase({ acrossLines: false })), []);
  });
});

describe('views and replacement text', () => {
  const one = (view, text, pattern = 'x') =>
    codes(
      lintIn(
        'en',
        section(text),
        compileRules({
          views: { v: [view] },
          rules: [
            {
              id: 'x',
              level: 'error',
              message: 'm',
              patterns: [pattern],
              view: 'v',
            },
          ],
        }).set,
      ),
    );

  it('replaces every match of a view step in a line, not the first only', () => {
    assert.deepEqual(one({ replace: 'x', with: '' }, 'x x x'), []);
  });

  it('puts the replacement text in literally, without special patterns', () => {
    assert.deepEqual(one({ replace: 'a', with: '$&' }, 'a', '\\$'), ['E_X']);
  });
});

describe('what the pattern rules read', () => {
  it('reads fenced code too, which is refused besides', () => {
    assert.deepEqual(
      codes(lintIn('en', section('```\nPoland\n```\n\n~~~\nPoland\n~~~'))),
      ['E_CODE_BLOCK', 'E_CODE_BLOCK', 'E_COUNTRY_REMARK', 'E_COUNTRY_REMARK'],
    );
  });

  it('reads an HTML comment: it is not published, but it is public', () => {
    assert.deepEqual(apart(lintIn('en', section('<!--\nPoland\n-->'))), [
      'E_COUNTRY_REMARK',
    ]);
  });

  it('does not let a ::: local marker inside a comment hide a line', () => {
    const text = section(
      '<!--\n::: local lang=en Note\n-->\nPoland\n<!--\n:::\n-->',
    );
    assert.deepEqual(apart(lintIn('en', text)), ['E_COUNTRY_REMARK']);
  });

  it('does not let a ::: local marker inside fenced code hide a line', () => {
    const text = section(
      '```\n::: local lang=en Note\n```\nPoland\n```\n:::\n```',
    );
    assert.deepEqual(codes(lintIn('en', text)), [
      'E_CODE_BLOCK',
      'E_CODE_BLOCK',
      'E_COUNTRY_REMARK',
    ]);
  });

  it('exempts a country remark inside a real local block, not around it', () => {
    const text = section(
      'Poland before\n\n::: local lang=en Note\nPoland inside\n:::\n\nPoland after',
    );
    const reporter = lintIn('en', text);
    assert.deepEqual(
      reporter.entries.map((e) => e.line),
      [3, 9],
    );
  });

  it('still applies a rule that is not localExempt inside a local block', () => {
    const text = section('::: local lang=en Note\nWow!!\n:::');
    assert.deepEqual(codes(lintIn('en', text)), [
      'E_EXCLAMATION_CHAIN',
      'W_EXCLAMATION_MARK',
    ]);
  });
});

describe('Markdown the outline cannot read', () => {
  it('refuses fenced code, in a draft too, at the line that opens it', () => {
    const reporter = lintIn('en', section('Text.\n\n```\ncode\n```'));
    assert.deepEqual(view(reporter), [
      {
        level: 'error',
        code: 'E_CODE_BLOCK',
        file: `content/en/${FILE}`,
        line: 5,
      },
    ]);
  });

  it('refuses fenced code inside a list item', () => {
    const reporter = lintIn('pl', section('- item\n\n  ```\n  x\n  ```'));
    assert.deepEqual(codes(reporter), ['E_CODE_BLOCK']);
  });

  it('reads the lines of refused code with the pattern rules all the same', () => {
    const reporter = lintIn('pl', section('```\nWow!!\n```'));
    assert.deepEqual(apart(reporter), ['E_CODE_BLOCK', 'E_EXCLAMATION_CHAIN']);
  });

  for (const [form, body, line] of [
    ['setext-heading', 'Title {#t}\n---', 4],
    ['blockquote', '> quoted', 3],
    ['link-definition', 'See [this][r].\n\n[r]: #nowhere', 5],
    ['table-without-leading-pipe', 'a | b\n---|---', 4],
  ])
    it(`refuses ${form} with E_MARKDOWN_FORM, naming it`, () => {
      const reporter = lintIn('en', section(body));
      assert.deepEqual(view(reporter), [
        {
          level: 'error',
          code: 'E_MARKDOWN_FORM',
          file: `content/en/${FILE}`,
          line,
          field: form,
        },
      ]);
    });

  it('refuses the forms in a published translation as in the source', () => {
    const reporter = lint({
      pl: { files: { [FILE]: section('Tekst.') } },
      en: { files: { [FILE]: section('Text.\n\n+ item') } },
    });
    assert.ok(codes(reporter).includes('E_MARKDOWN_FORM'));
  });
});

describe('links to an id', () => {
  const only = (text, extra = {}) =>
    lint({
      pl: { files: { [FILE]: section(text), ...extra.pl } },
      en: { files: { [FILE]: section(text), ...extra.en } },
    });

  it('accepts an id of the same section and of the page template', () => {
    assert.deepEqual(codes(only('[a](#intro) [b](#top) [c](#toc)')), []);
  });

  it('reports an id that nothing defines, with its line', () => {
    const reporter = only('[a](#nowhere)');
    assert.deepEqual(view(reporter), [
      {
        level: 'error',
        code: 'E_BROKEN_ANCHOR',
        file: 'content/pl/01-intro.md',
        line: 3,
      },
      {
        level: 'error',
        code: 'E_BROKEN_ANCHOR',
        file: 'content/en/01-intro.md',
        line: 3,
      },
    ]);
  });

  it('reports every broken link on a line', () => {
    assert.equal(only('[a](#x) [b](#y)').entries.length, 4);
  });

  it('accepts an id from another section of the same language', () => {
    const spec = {
      pl: {
        files: { [FILE]: section('[a](#other)'), '02-b.md': '## B {#other}\n' },
      },
    };
    assert.deepEqual(codes(lint(spec)), []);
  });

  it('accepts an id that comes from a fallback section', () => {
    const spec = {
      pl: {
        files: { [FILE]: section('[a](#other)'), '02-b.md': '## B {#other}\n' },
      },
      en: { status: 'draft', files: { [FILE]: section('[a](#other)') } },
    };
    assert.deepEqual(codes(lint(spec)), []);
  });

  it('does not take an id of another language', () => {
    const spec = {
      pl: { files: { [FILE]: section('x'), '02-b.md': '## B {#only-pl}\n' } },
      en: {
        status: 'draft',
        files: { [FILE]: section('[a](#only-pl)'), '02-b.md': '## B {#b}\n' },
      },
    };
    assert.deepEqual(codes(lint(spec)), ['E_BROKEN_ANCHOR']);
  });

  it('takes an FAQ id as an id', () => {
    const spec = {
      pl: {
        files: { [FILE]: section('[a](#faq-1)\n\n::: q #faq-1 Q\nx\n:::') },
      },
    };
    assert.deepEqual(codes(lint(spec)), []);
  });

  it('does not read a link inside code (refused) or a comment', () => {
    const spec = {
      pl: {
        files: { [FILE]: section('```\n[a](#no)\n```\n<!--\n[b](#no)\n-->') },
      },
    };
    assert.deepEqual(apart(lint(spec)), ['E_CODE_BLOCK']);
  });

  it('reads a link inside a local block', () => {
    const spec = {
      pl: {
        files: { [FILE]: section('::: local lang=pl Note\n[a](#no)\n:::') },
      },
    };
    assert.deepEqual(codes(lint(spec)), ['E_BROKEN_ANCHOR']);
  });

  it('checks the anchors of a draft too', () => {
    const spec = {
      pl: { files: { [FILE]: section('x') } },
      en: { status: 'draft', files: { [FILE]: section('[a](#no)') } },
    };
    assert.deepEqual(codes(lint(spec)), ['E_BROKEN_ANCHOR']);
  });

  it('leaves the links to the renderer when the build asks it to', () => {
    const { languages, content } = memory({
      pl: { files: { [FILE]: section('[a](#no)') } },
    });
    const reporter = capture();
    lintContent({
      rules: defaultRules(),
      languages,
      content,
      reporter,
      anchors: false,
    });
    assert.deepEqual(codes(reporter), []);
  });
});

describe('local blocks', () => {
  const local = (open, body = 'text') =>
    codes(
      lint({
        pl: { files: { [FILE]: section('x') } },
        en: { files: { [FILE]: section(`::: local ${open}\n${body}\n:::`) } },
      }),
    );

  it('accept lang equal to the folder with a title', () => {
    assert.deepEqual(local('lang=en A note'), []);
  });

  it('need lang=', () => {
    assert.deepEqual(local('A note'), ['E_LOCAL_BLOCK_NEEDS_LANG']);
  });

  it('need the lang of their own file', () => {
    assert.deepEqual(local('lang=pl A note'), ['E_LOCAL_BLOCK_WRONG_LANGUAGE']);
  });

  it('need a title', () => {
    assert.deepEqual(local('lang=en'), ['E_LOCAL_BLOCK_NEEDS_TITLE']);
  });

  it('report lang and title together, on the line of the block', () => {
    const reporter = lint({
      pl: { files: { [FILE]: section('x') } },
      en: { files: { [FILE]: section('::: local\ntext\n:::') } },
    });
    assert.deepEqual(view(reporter), [
      {
        level: 'error',
        code: 'E_LOCAL_BLOCK_NEEDS_LANG',
        file: 'content/en/01-intro.md',
        line: 3,
      },
      {
        level: 'error',
        code: 'E_LOCAL_BLOCK_NEEDS_TITLE',
        file: 'content/en/01-intro.md',
        line: 3,
      },
    ]);
  });

  it('may not hold a heading, at any level, or a bare #', () => {
    for (const heading of ['# H', '###### H', '#'])
      assert.deepEqual(local('lang=en T', heading), [
        'E_LOCAL_BLOCK_HAS_STRUCTURE',
      ]);
    // An indented heading is refused wherever it is.
    assert.deepEqual(local('lang=en T', '   ## H'), [
      'E_MARKDOWN_FORM',
      'E_LOCAL_BLOCK_HAS_STRUCTURE',
    ]);
  });

  it('may not hold an FAQ item, but another block is fine', () => {
    assert.deepEqual(local('lang=en T', '::: q Question\nx\n:::'), [
      'E_LOCAL_BLOCK_HAS_STRUCTURE',
    ]);
    assert.deepEqual(local('lang=en T', '::: tip\nx\n:::'), []);
  });

  it('may hold a hash that is no heading', () => {
    assert.deepEqual(local('lang=en T', '#hashtag and #1'), []);
  });

  it('take a heading inside fenced code for code, which is refused', () => {
    assert.deepEqual(local('lang=en T', '```\n# H\n```'), ['E_CODE_BLOCK']);
  });

  it('are exempt from structure parity (they have no counterpart)', () => {
    const reporter = lint({
      pl: {
        files: {
          [FILE]: section('x\n\n::: local lang=pl Note\n- a\n[l](#intro)\n:::'),
        },
      },
      en: { files: { [FILE]: section('x') } },
    });
    assert.deepEqual(codes(reporter), []);
  });
});

describe('parity of published translations', () => {
  const base = section('- one\n\n[l](#intro)');
  const lintEn = (text, status = 'published') =>
    lint({
      pl: { files: { [FILE]: base } },
      en: { status, files: { [FILE]: text } },
    });

  it('finds no difference in a translation of the same structure', () => {
    assert.deepEqual(codes(lintEn(section('- jeden\n\n[l](#intro)'))), []);
  });

  it('reports each parity code on the translation file', () => {
    const reporter = lintEn(
      `${base}\n- two\n![i](img/a.webp)\n| t |\n::: tip\n:::\n`,
    );
    assert.deepEqual(codes(reporter).sort(), [
      'E_PARITY_ATTRIBUTES',
      'E_PARITY_FENCES',
      'E_PARITY_IMAGES',
      'E_PARITY_LIST_ITEMS',
      'E_PARITY_TABLE_ROWS',
    ]);
    assert.ok(
      reporter.entries.every((e) => e.file === 'content/en/01-intro.md'),
    );
  });

  it('reports links, ids and heading levels', () => {
    assert.deepEqual(
      codes(lintEn('### Intro {#other}\n\n- one\n')).sort(),
      [
        'E_ID_EXTRA',
        'E_ID_MISSING',
        'E_PARITY_HEADINGS',
        'E_PARITY_IDS',
        'E_PARITY_LINKS',
      ].sort(),
    );
  });

  it('does not compare a draft', () => {
    assert.deepEqual(codes(lintEn('totally different', 'draft')), []);
  });

  it('does not compare the source with itself', () => {
    assert.deepEqual(codes(lint({ pl: { files: { [FILE]: base } } })), []);
  });

  it('does not compare a section the language lacks (a fallback)', () => {
    const reporter = lint({
      pl: { files: { [FILE]: base, '02-b.md': '## B {#b}\n' } },
      en: { files: { [FILE]: base } },
    });
    assert.deepEqual(codes(reporter), []);
  });

  it('reports an id the translation lacks, in the source file name', () => {
    const reporter = lint({
      pl: { files: { [FILE]: section('x'), '02-b.md': '## B {#b}\n' } },
      en: { files: { [FILE]: section('x'), '02-b.md': 'text only\n' } },
    });
    assert.deepEqual(
      view(reporter)
        .map((e) => e.code)
        .sort(),
      ['E_ID_MISSING', 'E_PARITY_HEADINGS', 'E_PARITY_IDS'],
    );
    assert.equal(
      reporter.entries.find((e) => e.code === 'E_ID_MISSING').file,
      'content/en/02-b.md',
    );
  });

  it('reports an id the source lacks, in the translation file', () => {
    const reporter = lint({
      pl: { files: { [FILE]: section('x'), '02-b.md': 'text\n' } },
      en: { files: { [FILE]: section('x'), '02-b.md': '## B {#b}\n' } },
    });
    assert.equal(
      reporter.entries.find((e) => e.code === 'E_ID_EXTRA').file,
      'content/en/02-b.md',
    );
  });

  it('takes an id that moved to another file as present (ids are per language)', () => {
    const reporter = lint({
      pl: { files: { [FILE]: section('x'), '02-b.md': '## B {#b}\n' } },
      en: { files: { [FILE]: section('x\n\n## B {#b}'), '02-b.md': 'text\n' } },
    });
    assert.ok(!codes(reporter).includes('E_ID_MISSING'));
    assert.ok(!codes(reporter).includes('E_ID_EXTRA'));
  });

  it('reports a ui key the source defines and the translation lacks', () => {
    const reporter = lint({
      pl: { ui: { a: 'a', b: 'b' }, files: { [FILE]: base } },
      en: { ui: { a: 'a' }, files: { [FILE]: base } },
    });
    assert.deepEqual(view(reporter), [
      {
        level: 'error',
        code: 'E_LANG_UI_MISSING',
        file: 'content/en/lang.json',
      },
    ]);
  });

  it('does not ask a draft for ui keys, and ignores extra keys', () => {
    assert.deepEqual(
      codes(
        lint({
          pl: { ui: { a: 'a', b: 'b' }, files: { [FILE]: base } },
          en: { status: 'draft', ui: {}, files: { [FILE]: base } },
          uk: { ui: { a: 'a', b: 'b', c: 'c' }, files: { [FILE]: base } },
        }),
      ),
      [],
    );
  });

  it('checks the ui keys even for one file only, but not the ids', () => {
    const reporter = lint(
      {
        pl: {
          ui: { a: 'a', b: 'b' },
          files: { [FILE]: section('x'), '02-b.md': '## B {#b}\n' },
        },
        en: {
          ui: { a: 'a' },
          files: { [FILE]: section('x'), '02-b.md': 'text\n' },
        },
      },
      { only: FILE },
    );
    assert.deepEqual(codes(reporter), ['E_LANG_UI_MISSING']);
  });
});

describe('lines and sections the language does not own', () => {
  it('does not lint the fallback text of a missing file a second time', () => {
    const spec = {
      pl: {
        files: { [FILE]: section('x'), '02-b.md': '## B {#b}\n\nWow!!\n' },
      },
      en: { status: 'draft', files: { [FILE]: section('x') } },
    };
    const reporter = lint(spec);
    assert.deepEqual(
      view(reporter).map((e) => e.file),
      ['content/pl/02-b.md', 'content/pl/02-b.md'],
    );
  });

  it('names the first section that defines an id when two define it', () => {
    const reporter = lint({
      pl: {
        files: { [FILE]: '## A {#dup}\n', '02-b.md': '## B {#dup}\n' },
      },
      en: { files: { [FILE]: 'text\n', '02-b.md': 'text\n' } },
    });
    const missing = reporter.entries.filter((e) => e.code === 'E_ID_MISSING');
    assert.deepEqual(
      missing.map((e) => e.file),
      ['content/en/01-intro.md'],
    );
  });

  it('never applies a rule to a blank line, even one that matches nothing', () => {
    const rules = compileRules({
      rules: [{ id: 'x', level: 'error', message: 'm', patterns: ['^\\s*$'] }],
    }).set;
    const reporter = lintIn('pl', '## A {#a}\n\n   \ntext\n\t\n', rules);
    assert.deepEqual(codes(reporter), []);
  });
});

describe('checking one file', () => {
  it('reports a file the source does not have as E_LINT_FILE', () => {
    const reporter = lint(
      { pl: { files: { [FILE]: section('x') } } },
      { only: 'nope.md' },
    );
    assert.deepEqual(view(reporter), [
      { level: 'error', code: 'E_LINT_FILE', file: 'content' },
    ]);
  });

  it('stops there: nothing else is reported for the other languages', () => {
    const reporter = lint(
      {
        pl: { files: { [FILE]: section('x') } },
        en: { files: { [FILE]: section('x') }, ui: {} },
      },
      { only: 'nope.md' },
    );
    assert.deepEqual(codes(reporter), ['E_LINT_FILE']);
  });

  it('lints that file and no other', () => {
    const spec = {
      pl: {
        files: { [FILE]: section('Wow!!'), '02-b.md': '## B {#b}\n\nWow!!\n' },
      },
    };
    const reporter = lint(spec, { only: '02-b.md' });
    assert.ok(reporter.entries.length > 0);
    assert.ok(reporter.entries.every((e) => e.file === 'content/pl/02-b.md'));
  });

  it('skips a language that has no such file of its own', () => {
    const spec = {
      pl: { files: { [FILE]: section('x'), '02-b.md': '## B {#b}\n' } },
      en: { status: 'draft', files: { [FILE]: section('Wow!!') } },
    };
    assert.deepEqual(codes(lint(spec, { only: '02-b.md' })), []);
  });
});
