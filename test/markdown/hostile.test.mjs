// The hostile-input suite: documents an author (or an attacker with a pull
// request) could write, rendered through the real renderer. What must hold:
// no exception, no authoring syntax in the output, no raw HTML or script
// target that reaches the page, balanced tags when nothing was reported.

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { normalise } from '../../scripts/lib/files.mjs';
import { findLeaks } from '../../scripts/lib/markdown/text.mjs';
import { codes, errorCodes } from '../helpers/capture.mjs';
import {
  createRenderer,
  createStatic,
  unbalanced,
} from '../helpers/serve-markdown.mjs';

let site;
before(() => {
  site = createStatic();
});
after(() => site.cleanup());

/** Renders `text` and says what came out. */
function run(text, options) {
  const renderer = createRenderer(site, options);
  const html = renderer.render(text);
  return {
    html,
    codes: codes(renderer.reporter),
    errors: errorCodes(renderer.reporter),
    entries: renderer.reporter.entries,
    toc: renderer.toc,
    leaks: findLeaks(html),
    ids: [...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]),
  };
}

describe('raw HTML never reaches the page', () => {
  it('refuses script, event handlers, style and meta', () => {
    const r = run(
      'Raw: <script>alert(1)</script> and <img src=x onerror=alert(1)> <svg onload=1></svg>\n\n<style>body{}</style>\n\n<meta http-equiv="refresh" content="0;url=x">\n',
    );
    assert.ok(r.codes.length >= 4);
    assert.ok(r.codes.every((c) => c === 'E_RAW_HTML'));
    assert.doesNotMatch(r.html, /<script|<style|<meta|onerror|onload/);
  });

  it('refuses raw HTML in titles, headings, tables and block attributes', () => {
    for (const text of [
      '::: q #faq-x <img src=x onerror=1> title?\nA\n:::\n',
      '## <b onclick=1>x</b> {#h}\n',
      '| a | b |\n| - | - |\n| <i>1</i> | 2 |\n',
      '<table class="x"><tr><td>a</td></tr></table>\n',
      '<div>\n\n::: tip\nx\n:::\n\n</div>\n',
    ]) {
      const r = run(text);
      assert.ok(r.codes.includes('E_RAW_HTML'), text);
      assert.doesNotMatch(r.html, /onerror|onclick|<i>|<div>|class="x"/, text);
    }
  });

  it('drops an HTML comment, and what is in it', () => {
    const r = run(
      '## T {#t}\n\nbefore\n\n<!--\n## Draft {#draft}\n\nhidden draft\n::: tip\n-->\n\nafter\n',
    );
    assert.deepEqual(r.codes, []);
    assert.deepEqual(r.ids, ['t']);
    assert.match(r.html, /before/);
    assert.match(r.html, /after/);
    assert.doesNotMatch(r.html, /hidden draft|Draft|<!--|-->/);
    assert.deepEqual(r.leaks, []);
  });

  it('drops an inline comment from a line of text', () => {
    const r = run('text <!-- inline --> more\n');
    assert.deepEqual(r.codes, []);
    assert.doesNotMatch(r.html, /inline|<!--/);
  });
});

describe('links', () => {
  it('refuses every target that is not an #anchor', () => {
    const targets = [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      'data:text/html,hi',
      'vbscript:x',
      'HTTPS://EXAMPLE.COM/x',
      '//example.com/y',
      'mailto:a@b.c',
      'other.html',
      '/abs',
      '#',
      '#a b',
    ];
    for (const target of targets) {
      const r = run(`[x](<${target}>)\n`);
      assert.ok(r.codes.includes('E_LINK_TARGET'), target);
      assert.doesNotMatch(r.html, /href="(?!#)/i, target);
      assert.doesNotMatch(r.html, /javascript:|data:|vbscript:/i, target);
    }
  });

  it('refuses a link written as an autolink or a reference', () => {
    assert.ok(run('<https://example.com>\n').codes.length > 0);
    assert.ok(
      run('[x][r]\n\n[r]: javascript:alert(1)\n').codes.includes(
        'E_LINK_TARGET',
      ),
    );
    assert.ok(run('https://example.com/bare\n').codes.length > 0);
  });

  it('keeps an anchor link to a heading', () => {
    const r = run('## T {#t}\n\n[go](#t)\n');
    assert.deepEqual(r.codes, []);
    assert.match(r.html, /<a href="#t">go<\/a>/);
  });

  it('resolves a reference-style link above its definition, also in a block', () => {
    const r = run(
      'See [the tip][r].\n\n## N {#next}\n\n::: tip\nInside [again][r].\n:::\n\n[r]: #next\n',
    );
    assert.deepEqual(r.codes, []);
    assert.equal((r.html.match(/<a href="#next">/g) ?? []).length, 2);
  });
});

describe('images', () => {
  it('refuses a path outside img/ or a remote one', () => {
    for (const href of [
      './img/a.webp',
      '/img/a.webp',
      'IMG/a.webp',
      'https://evil.example/p.gif',
      'img/../../package.json',
      'img/my%20pic.webp',
      'data:image/png;base64,AAAA',
    ]) {
      const r = run(`![t](${href})\n`);
      assert.ok(r.errors.length > 0, href);
      assert.doesNotMatch(r.html, /<img[^>]+src="(https?:|data:|\.\.)/, href);
    }
  });

  it('reports a missing, wrong-case or empty file', () => {
    assert.deepEqual(run('![t](img/nope.webp)\n').codes, ['E_IMG_MISSING']);
    assert.deepEqual(run('![t](img/A.webp)\n').codes, ['E_IMG_CASE']);
    assert.deepEqual(run('![t](img/empty.webp)\n').codes, ['E_IMG_UNREADABLE']);
  });

  it('makes a figure of a lone image and a bare img of an inline one', () => {
    assert.match(
      run('![x](img/a.webp "Cap")\n').html,
      /<figure[^>]*><img [^>]*>.*<figcaption>Cap<\/figcaption>/s,
    );
    const inline = run('text ![x](img/a.webp) more\n');
    assert.deepEqual(inline.codes, []);
    assert.doesNotMatch(inline.html, /<figure/);
  });

  it('puts two images of one gallery in two figures', () => {
    const r = run(':::: gallery\n![a](img/a.webp) ![b](img/b.webp)\n::::\n');
    assert.deepEqual(r.codes, []);
    assert.equal((r.html.match(/<figure/g) ?? []).length, 2);
  });
});

describe('blocks', () => {
  it('finds a block in a list item and in a quote, never in code', () => {
    const inList = run(
      '## T {#t}\n\n1. Step\n   ::: tip\n   Keep warm.\n   :::\n2. Next\n',
    );
    assert.deepEqual(inList.codes, []);
    assert.match(inList.html, /callout-tip/);
    const inQuote = run('> ::: tip\n> quoted\n> :::\n');
    assert.deepEqual(inQuote.codes, []);
    assert.match(inQuote.html, /<blockquote>[\s\S]*callout-tip/);
    for (const code of [
      '```\n::: tip\nx\n:::\n```\n',
      '````md\n```\n::: tip\n:::\n```\n````\n',
      '~~~\n::: tip\n~~~\n',
      '    ::: tip\n    x\n    :::\n',
      'inline `::: tip` code\n',
    ]) {
      const r = run(code);
      assert.deepEqual(r.codes, [], code);
      assert.doesNotMatch(r.html, /callout/, code);
      assert.deepEqual(r.leaks, [], code);
    }
  });

  it('reports an unclosed block, a stray closer and an unknown block', () => {
    assert.deepEqual(run('::: tip\nbody\n').codes, ['E_BLOCK_UNCLOSED']);
    assert.deepEqual(
      run(':::: flours\n::: flour img=a.webp A\n- x\n').codes.sort(),
      ['E_BLOCK_UNCLOSED', 'E_BLOCK_UNCLOSED'],
    );
    const stray = run('text\n\n:::\n\nmore\n');
    assert.deepEqual(stray.codes, ['E_BLOCK_STRAY_CLOSE']);
    assert.equal(stray.entries[0].line, 3);
    assert.deepEqual(stray.leaks, []);
    assert.deepEqual(run('::: foo\nx\n:::\n').codes, ['E_BLOCK_UNKNOWN']);
    assert.deepEqual(run(':::x\nbody\n:::\n').codes, ['E_BLOCK_UNKNOWN']);
  });

  it('reports a closing fence of another length', () => {
    assert.deepEqual(run(':::: gallery\n![a](img/a.webp)\n:::\n').codes, [
      'W_BLOCK_FENCE',
    ]);
  });

  it('refuses attributes and titles the block does not take', () => {
    assert.deepEqual(run('::: tip W=300 flour is strong\nx\n:::\n').codes, [
      'E_BLOCK_ATTR',
    ]);
    assert.deepEqual(run('::: tip #my-tip Title\nx\n:::\n').codes, [
      'E_BLOCK_ATTR',
    ]);
    assert.deepEqual(run('::: q #faq-x\nA\n:::\n').codes, ['E_BLOCK_TITLE']);
    assert.deepEqual(run('::: flour img=a.webp Card\n- x\n:::\n').codes, [
      'E_BLOCK_PARENT',
    ]);
  });

  it('renders a local block only in its language', () => {
    const text = '::: local lang=pl Uwaga\nTylko u nas.\n:::\n';
    assert.match(run(text, { code: 'pl' }).html, /Tylko u nas\./);
    const other = run(text, { code: 'en' });
    assert.deepEqual(other.codes, []);
    assert.doesNotMatch(other.html, /Tylko/);
  });

  it('treats an indented fence as text and reports it as a leak', () => {
    const r = run('  ::: tip\n  body\n  :::\n');
    assert.ok(r.leaks.some((l) => l.kind === ':::') || r.codes.length > 0);
  });
});

describe('headings and ids', () => {
  it('reports a missing, odd, empty, duplicate or reserved id', () => {
    assert.deepEqual(run('## T\n').codes, ['E_HEADING_ID']);
    assert.deepEqual(run('## T {#mąka}\n').codes, ['E_ID_CHARSET']);
    assert.deepEqual(run('## {#empty}\n').codes, ['E_HEADING_EMPTY']);
    assert.deepEqual(run('## A {#a} text\n').codes, ['E_HEADING_ID']);
    assert.deepEqual(run('## A {#dup}\n\n## B {#dup}\n').codes, ['E_DUP_ID']);
    assert.deepEqual(
      run('## A {#top}\n\n## B {#content}\n\n## C {#toc}\n').codes,
      ['E_ID_RESERVED', 'E_ID_RESERVED', 'E_ID_RESERVED'],
    );
    assert.deepEqual(run('Accidental setext\n---\n').codes, ['E_HEADING_ID']);
  });

  it('accepts an indented, quoted and setext heading with an id', () => {
    assert.deepEqual(run('## T {#t}\n\n  ## Indented {#indented}\n').ids, [
      't',
      'indented',
    ]);
    assert.deepEqual(run('> ## Quoted {#quoted}\n').ids, ['quoted']);
    assert.deepEqual(run('Setext {#setext}\n------\n').ids, ['setext']);
    assert.deepEqual(run('## A {#a} ##\n').codes, []);
  });

  it('escapes the heading text once in the table of contents', () => {
    const r = run("## Baker's dough & sauce {#b}\n\n## Use `a<b` here {#c}\n");
    assert.deepEqual(r.codes, []);
    assert.equal(r.toc.length, 2);
    for (const entry of r.toc)
      assert.doesNotMatch(entry.html, /&amp;(#39|lt|amp);/);
    assert.match(r.toc[0].html, /Baker&#39;s dough &amp; sauce/);
    assert.match(r.toc[1].html, /a&lt;b/);
  });

  it('names a duplicate by both places', () => {
    const r = run(
      '## A {#dup}\n\n## B {#dup}\n\n::: q #dup Question?\nAnswer\n:::\n',
    );
    assert.deepEqual(r.codes, ['E_DUP_ID', 'E_DUP_ID']);
    assert.deepEqual(
      r.entries.map((e) => e.line),
      [3, 5],
    );
  });

  it('warns about a level-1 heading and a skipped level', () => {
    assert.deepEqual(run('# H1 {#h1}\n\n#### Deep {#deep}\n').codes.sort(), [
      'W_H1',
      'W_HEADING_SKIP',
    ]);
  });
});

describe('odd bytes and sizes', () => {
  const clean = '## T {#t}\n\n::: tip\nbody\n:::\n';

  it('survives a BOM and CRLF line ends', () => {
    // The reader of files normalises before rendering; the renderer sees LF.
    const expected = run(clean).html;
    const crlf = clean.replaceAll('\n', '\r\n');
    for (const text of [
      `\uFEFF${clean}`,
      crlf,
      `\uFEFF${crlf}`,
      clean.replaceAll('\n', '\r'),
    ]) {
      const r = run(normalise(text));
      assert.equal(r.html, expected);
      assert.deepEqual(r.codes, []);
    }
    // A BOM that was not stripped is caught by the leak check, not published.
    assert.ok(run(`\uFEFF${clean}`).codes.includes('E_LEAK'));
    assert.doesNotMatch(run(crlf).html, /<script/);
  });

  it('survives NUL and control characters', () => {
    for (const char of [
      '\0',
      '\x01',
      '\x08',
      '\x0b',
      '\x1b',
      '\x7f',
      '\u2028',
      '\u2029',
      '\uFFFF',
      '\uD800',
    ]) {
      const r = run(
        `## T${char} {#t}\n\ntext${char}more ${char}\n\n::: tip${char}\nx\n:::\n${char}\n`,
      );
      assert.equal(typeof r.html, 'string');
      assert.doesNotMatch(r.html, /<script/);
    }
  });

  it('renders a megabyte of text', () => {
    const body = `${'word '.repeat(20)}\n\n`;
    const text = `## T {#t}\n\n${body.repeat(Math.ceil(1_000_000 / body.length))}`;
    assert.ok(text.length >= 1_000_000);
    const started = performance.now();
    const r = run(text);
    assert.deepEqual(r.codes, []);
    assert.ok(performance.now() - started < 5000);
  });

  it('survives a thousand nested quotes', () => {
    const text = `${'> '.repeat(1000)}deep\n`;
    const r = run(text);
    assert.equal(typeof r.html, 'string');
    assert.equal(unbalanced(r.html), null);
  });

  it('survives deeply nested lists and blocks', () => {
    const lists = Array.from(
      { length: 200 },
      (_, i) => `${'  '.repeat(i)}- item`,
    ).join('\n');
    assert.equal(unbalanced(run(`${lists}\n`).html), null);
    const blocks = `${'::: tip\n'.repeat(300)}x\n${':::\n'.repeat(300)}`;
    const r = run(blocks);
    assert.equal(unbalanced(r.html), null);
    assert.deepEqual(r.leaks, []);
  });

  it('stays fast on pathological lines', () => {
    const started = performance.now();
    run(`## ${' '.repeat(50_000)}{#${'}'.repeat(50_000)}\n`);
    run(`${'`'.repeat(50_000)}\n`);
    run(`${':'.repeat(50_000)}\n`);
    run(`::: ${'a '.repeat(25_000)}\nx\n:::\n`);
    run(`${'*'.repeat(20_000)}\n${'_a'.repeat(10_000)}\n`);
    assert.ok(performance.now() - started < 5000);
  });

  it('keeps 16,000 paragraphs in an unclosed block fast', () => {
    const text = `::: tip\n${Array.from({ length: 16_000 }, (_, i) => `p ${i}`).join('\n\n')}\n`;
    const started = performance.now();
    const r = run(text);
    assert.deepEqual(r.codes, ['E_BLOCK_UNCLOSED']);
    assert.ok(performance.now() - started < 5000);
  });
});

/** Markup that would run or load something; escaped text is harmless. */
const ACTIVE = /<(?:script|style|meta|iframe)\b|<[a-z][^>]*\son\w+=/i;

describe('a seeded fuzz', () => {
  const VOCABULARY = [
    ':::',
    '::: tip',
    '::: tip Title',
    '::: warning',
    '::: note',
    '::: q #faq-a Q?',
    '::: q #faq-b Q2?',
    ':::: flours',
    '::: flour img=a.webp Card',
    ':::: gallery',
    '::::',
    ':::::',
    '```',
    '```js',
    '~~~',
    '````',
    '## H {#h1}',
    '### S {#s1}',
    '## Bad heading',
    '- item',
    '1. one',
    '| a | b |',
    '| - | - |',
    '| 1 | 2 |',
    '![a](img/a.webp)',
    '![b](img/b.webp "cap")',
    '',
    'text line',
    '> quote',
    '    indented',
    '  ## indented heading {#ih}',
    'Setext',
    '---',
    '[x](#h1)',
    '[y](https://example.com)',
    '  ::: tip',
    '  :::',
    '> ::: note',
    '> :::',
    '- ## Listed {#lh}',
    '```code``` inline',
    '    ```',
    '1. one\n   ::: tip',
    '::: local lang=pl Note',
    '::: local lang=en Note',
    '::: foo',
    '::: tip #x',
    '## {#}',
    '# Top {#top-h}',
    '[z](#nope)',
    '\t::: tip',
    '::: tip   ',
    ':::   ',
    '<!--',
    '-->',
    '<table>',
    '</table>',
    '<div>',
    '</div>',
    '<script>x</script>',
    '<img src=x onerror=1>',
    '<b>x</b>',
  ];

  it('never throws, never leaks syntax, balances what it accepts', () => {
    // Park-Miller: a fixed seed, the same documents on every machine.
    let state = 20240607;
    const random = () => {
      state = (state * 48271) % 2147483647;
      return state / 2147483647;
    };
    const started = performance.now();
    let clean = 0;
    for (let i = 0; i < 400; i++) {
      const count = 2 + Math.floor(random() * 14);
      const text = Array.from(
        { length: count },
        () => VOCABULARY[Math.floor(random() * VOCABULARY.length)],
      ).join('\n');
      const r = run(text, { code: i % 2 ? 'pl' : 'en' });
      const lines = text.split('\n').length;
      for (const entry of r.entries)
        assert.ok(
          entry.line === undefined || (entry.line >= 1 && entry.line <= lines),
          `line ${entry.line} in ${JSON.stringify(text)}`,
        );
      assert.doesNotMatch(r.html, ACTIVE, JSON.stringify(text));
      if (r.errors.length > 0) continue;
      clean++;
      assert.deepEqual(r.leaks, [], JSON.stringify(text));
      assert.equal(unbalanced(r.html), null, JSON.stringify(text));
    }
    assert.ok(
      clean > 20,
      `only ${clean} error-free documents: the fuzz tests too little`,
    );
    assert.ok(performance.now() - started < 3000);
  });
});
