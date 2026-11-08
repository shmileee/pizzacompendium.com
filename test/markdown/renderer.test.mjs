import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NBSP } from '../../scripts/lib/markdown/typography.mjs';
import {
  codes,
  errorCodes,
  find,
  findAll,
  view,
  warningCodes,
} from '../helpers/capture.mjs';
import { renderer, renderOnce } from '../helpers/render.mjs';

const IMG = { 'img/a.webp': { width: 960, height: 640 } };

/** A block of our own, to look at what a block is given. */
const probe = (name, extra = {}) => ({
  name,
  render: (c) => {
    probe.seen = c;
    return `[${name}]`;
  },
  ...extra,
});

describe('headings', () => {
  it('gets an id and an anchor, in the level it was written in', () => {
    const { html, reporter } = renderOnce(
      '## Dough {#dough}\n\n### Water {#water}\n',
    );
    assert.deepEqual(codes(reporter), []);
    assert.equal(
      html,
      '<h2 id="dough">Dough<a class="hanchor" href="#dough" aria-labelledby="dough">#</a></h2>\n<h3 id="water">Water<a class="hanchor" href="#water" aria-labelledby="water">#</a></h3>\n',
    );
  });

  it('renders inline Markdown in the title', () => {
    const { html } = renderOnce('## The *best* `dough` {#d}\n');
    assert.match(html, /<h2 id="d">The <em>best<\/em> <code>dough<\/code><a /);
  });

  it('needs an {#id}', () => {
    const { html, reporter } = renderOnce('\n## No id\n');
    assert.deepEqual(view(reporter), [
      { level: 'error', code: 'E_HEADING_ID', file: 'case.md', line: 2 },
    ]);
    assert.equal(html, '');
  });

  it('refuses an id with a character an id may not have', () => {
    const { html, reporter } = renderOnce('## Title {#a.b}\n');
    assert.deepEqual(codes(reporter), ['E_ID_CHARSET']);
    assert.equal(html, '');
    assert.deepEqual(
      renderOnce('## Title {#}\n').reporter.entries.map((e) => e.code),
      ['E_ID_CHARSET'],
    );
  });

  it('refuses a heading without text', () => {
    const { html, reporter } = renderOnce('## {#empty}\n');
    assert.deepEqual(codes(reporter), ['E_HEADING_EMPTY']);
    assert.equal(html, '');
  });

  it('refuses a duplicate id, naming the first place in the message', () => {
    const r = renderer();
    r.render('## A {#same}\n', 'one.md');
    r.render('\n## B {#same}\n', 'two.md');
    const dup = find(r.reporter, 'E_DUP_ID');
    assert.equal(dup.file, 'two.md');
    assert.equal(dup.line, 2);
    assert.match(dup.message, /one\.md:1/);
  });

  it('refuses an id that the page template uses', () => {
    const { reporter } = renderOnce('## A {#top}\n', {
      isReserved: (id) => id === 'top',
    });
    assert.deepEqual(codes(reporter), ['E_ID_RESERVED']);
  });

  it('allows any id when nothing is reserved', () => {
    assert.deepEqual(codes(renderOnce('## A {#top}\n').reporter), []);
  });

  it('warns about an h1: the title of the page is the only one', () => {
    const { html, reporter } = renderOnce('# Big {#big}\n');
    assert.deepEqual(view(reporter), [
      { level: 'warning', code: 'W_H1', file: 'case.md', line: 1 },
    ]);
    assert.match(html, /<h1 id="big">/);
  });

  it('warns about a jump of more than one level, from the level before', () => {
    const { reporter } = renderOnce(
      '## A {#a}\n\n#### B {#b}\n\n### C {#c}\n\n##### D {#d}\n',
    );
    assert.deepEqual(
      reporter.entries.map((e) => [e.code, e.line]),
      [
        ['W_HEADING_SKIP', 3],
        ['W_HEADING_SKIP', 7],
      ],
    );
  });

  it('does not warn about a step down by one, or up by any number', () => {
    const { reporter } = renderOnce(
      '## A {#a}\n\n### B {#b}\n\n#### C {#c}\n\n## D {#d}\n',
    );
    assert.deepEqual(codes(reporter), []);
  });

  it('counts the first heading of a page from h1', () => {
    assert.deepEqual(warningCodes(renderOnce('### A {#a}\n').reporter), [
      'W_HEADING_SKIP',
    ]);
    assert.deepEqual(codes(renderOnce('## A {#a}\n').reporter), []);
  });

  it('goes on from the level of the section before it', () => {
    const r = renderer();
    r.render('## A {#a}\n');
    r.render('#### B {#b}\n');
    assert.deepEqual(warningCodes(r.reporter), ['W_HEADING_SKIP']);
  });

  it('collects h2 and h3 for the table of contents, as text, not as markup', () => {
    const r = renderer();
    r.render(
      '# One {#one}\n\n## Two *em* & {#two}\n\n### Three `c` {#three}\n\n#### Four {#four}\n',
    );
    assert.deepEqual(r.toc, [
      { level: 2, id: 'two', html: 'Two em &amp;' },
      { level: 3, id: 'three', html: 'Three c' },
    ]);
  });

  it('keeps the table of contents across sections, in order', () => {
    const r = renderer();
    r.render('## A {#a}\n');
    r.render('## B {#b}\n');
    assert.deepEqual(
      r.toc.map((e) => e.id),
      ['a', 'b'],
    );
  });

  it('puts nothing in the table of contents for a heading it refused', () => {
    const r = renderer();
    r.render('## No id\n\n## {#empty}\n\n## X {#a.b}\n');
    assert.deepEqual(r.toc, []);
  });
});

describe('paragraphs, figures and images', () => {
  it('is a paragraph for text, which ends with a new line', () => {
    assert.equal(
      renderOnce('Hello *world*.\n').html,
      '<p>Hello <em>world</em>.</p>\n',
    );
  });

  it('is a figure for an image alone in its paragraph, with its caption', () => {
    const { html, reporter } = renderOnce(
      '![A "pie"](img/a.webp "The **title**")\n',
      { images: IMG },
    );
    assert.deepEqual(codes(reporter), []);
    assert.equal(
      html,
      '<figure class="photo photo-landscape"><img src="../img/a.webp" alt="A &quot;pie&quot;" loading="lazy" decoding="async" width="960" height="640"><figcaption>The <strong>title</strong></figcaption></figure>\n',
    );
  });

  it('is a figure without a caption when there is no title', () => {
    const { html } = renderOnce('![x](img/a.webp)\n', { images: IMG });
    assert.doesNotMatch(html, /figcaption/);
    assert.match(html, /^<figure class="photo photo-landscape"><img /);
  });

  it('ignores blanks around the image when it decides', () => {
    const { html } = renderOnce('![x](img/a.webp) \n', { images: IMG });
    assert.match(html, /^<figure/);
  });

  it('is a bare image inside the paragraph when there is text or another image', () => {
    const text = renderOnce('See ![x](img/a.webp) here.\n', {
      images: IMG,
    }).html;
    assert.match(
      text,
      /^<p>See <img src="\.\.\/img\/a\.webp" alt="x" [^>]*> here\.<\/p>\n$/,
    );
    const two = renderOnce('![x](img/a.webp) ![y](img/a.webp)\n', {
      images: IMG,
    }).html;
    assert.match(
      two,
      /^<p><img [^>]*alt="x"[^>]*> <img [^>]*alt="y"[^>]*><\/p>\n$/,
    );
    assert.doesNotMatch(two, /figure/);
  });

  it('gives a figure a srcset and the sizes of a figure when smaller copies exist', () => {
    const { html } = renderOnce('![x](img/a.webp)\n', {
      images: {
        'img/a.webp': {
          width: 960,
          height: 640,
          variants: [{ href: 'img/a-480w.webp', width: 480 }],
        },
      },
    });
    assert.match(
      html,
      /srcset="\.\.\/img\/a-480w\.webp 480w, \.\.\/img\/a\.webp 960w" sizes="\(min-width: 640px\) 560px, calc\(100vw - 2\.5rem\)"/,
    );
  });

  it('gives the class of the shape, the cut-out and the small source', () => {
    const cls = (over) =>
      /<figure class="([^"]*)"/.exec(
        renderOnce('![x](img/a.webp)\n', { images: { 'img/a.webp': over } })
          .html,
      )[1];
    assert.equal(cls({ width: 800, height: 800 }), 'photo photo-square');
    assert.equal(cls({ width: 800, height: 1000 }), 'photo photo-portrait');
    assert.equal(cls({ width: 1900, height: 900 }), 'photo photo-wide');
    assert.equal(
      cls({ width: 1000, height: 1000, alpha: true }),
      'photo photo-square photo-cutout',
    );
    assert.equal(
      cls({ width: 600, height: 400 }),
      'photo photo-landscape photo-small',
    );
    assert.equal(
      cls({ width: 699, height: 699, alpha: true }),
      'photo photo-square photo-cutout photo-small',
    );
    assert.equal(cls({ width: 700, height: 700 }), 'photo photo-square');
  });

  it('reports a missing image at its line and keeps the figure with its caption', () => {
    const { html, reporter } = renderOnce(
      'x\n\n![x](img/gone.webp "Caption")\n',
    );
    assert.deepEqual(view(reporter), [
      { level: 'error', code: 'E_IMG_MISSING', file: 'case.md', line: 3 },
    ]);
    assert.equal(
      html,
      '<p>x</p>\n<figure class="photo"><figcaption>Caption</figcaption></figure>\n',
    );
  });

  it('passes the code of any problem of the picture on', () => {
    const { reporter } = renderOnce(
      '![x](img/bad.webp)\n![y](img/path.webp)\n',
      {
        images: {
          'img/bad.webp': { ok: false, code: 'E_IMG_UNREADABLE' },
          'img/path.webp': { ok: false, code: 'E_IMG_CASE' },
        },
      },
    );
    assert.deepEqual(codes(reporter), ['E_IMG_UNREADABLE', 'E_IMG_CASE']);
  });

  it('reports a missing bare image once and leaves nothing in its place', () => {
    const { html, reporter } = renderOnce('See ![x](img/gone.webp) here.\n');
    assert.deepEqual(codes(reporter), ['E_IMG_MISSING']);
    assert.equal(html, '<p>See  here.</p>\n');
  });

  it('asks the resolver for the href as it was written', () => {
    const r = renderer({ images: IMG });
    r.render('![x](img/a.webp)\n');
    assert.deepEqual(r.images.asked, ['img/a.webp', 'img/a.webp']);
  });
});

describe('links', () => {
  it('keeps a link to an id of the page', () => {
    const { html, reporter } = renderOnce(
      'See [dough](#dough-1_x) and [more](#a "Title").\n',
    );
    assert.deepEqual(codes(reporter), []);
    assert.equal(
      html,
      '<p>See <a href="#dough-1_x">dough</a> and <a href="#a" title="Title">more</a>.</p>\n',
    );
  });

  it('keeps a reference-style link to an id', () => {
    const { html, reporter } = renderOnce('See [dough][d].\n\n[d]: #dough\n');
    assert.deepEqual(codes(reporter), []);
    assert.match(html, /<a href="#dough">dough<\/a>/);
  });

  for (const href of [
    'https://example.test/',
    'http://example.test',
    '//example.test',
    'mailto:a@example.test',
    'javascript:alert(1)',
    'data:text/html,x',
    'img/a.webp',
    '../x',
    'other.md',
    '#',
    '#a.b',
    '#a/b',
    'x#a',
  ])
    it(`refuses a link to ${href}, at its line, and drops it`, () => {
      const { html, reporter } = renderOnce(`Text\n\n[link](${href})\n`);
      assert.deepEqual(view(reporter), [
        { level: 'error', code: 'E_LINK_TARGET', file: 'case.md', line: 3 },
      ]);
      assert.doesNotMatch(html, /<a |href/);
    });

  it('refuses a reference-style link to the outside', () => {
    const { reporter } = renderOnce('[x][r]\n\n[r]: https://example.test\n');
    assert.deepEqual(codes(reporter), ['E_LINK_TARGET']);
  });

  it('refuses an outside link in the title of a block, at the line of the block', () => {
    const { reporter } = renderOnce(
      '\n::: note [x](https://example.test)\nBody\n:::\n',
    );
    assert.deepEqual(view(reporter), [
      { level: 'error', code: 'E_LINK_TARGET', file: 'case.md', line: 2 },
    ]);
  });

  it('knows the link definitions of the document in a block title', () => {
    const { html, reporter } = renderOnce(
      '::: note [x][d]\nBody\n:::\n\n[d]: #dough\n',
    );
    assert.deepEqual(codes(reporter), []);
    assert.match(html, /<a href="#dough">x<\/a>/);
  });

  it('forgets the definitions of the section before', () => {
    const r = renderer();
    r.render('[d]: #dough\n');
    r.render('::: note [x][d]\nBody\n:::\n');
    assert.doesNotMatch(r.render('::: note [x][d]\nBody\n:::\n'), /<a href/);
  });
});

describe('raw HTML', () => {
  it('drops a comment, between blocks and in a line', () => {
    const { html, reporter } = renderOnce(
      '<!-- note -->\n\nText <!-- inline --> more.\n\n<!--\nmulti\nline\n-->\n',
    );
    assert.deepEqual(codes(reporter), []);
    assert.equal(html, '<p>Text  more.</p>\n');
  });

  it('drops two comments in a row', () => {
    const { html, reporter } = renderOnce('<!-- a -->\n<!-- b -->\n');
    assert.deepEqual(codes(reporter), []);
    assert.equal(html, '');
  });

  it('refuses a tag, at its line, and drops it', () => {
    const { html, reporter } = renderOnce('Text\n\n<div class="x">y</div>\n');
    assert.deepEqual(view(reporter), [
      { level: 'error', code: 'E_RAW_HTML', file: 'case.md', line: 3 },
    ]);
    assert.doesNotMatch(html, /<div|class="x"/);
  });

  it('refuses a tag in a line, and keeps the text around it', () => {
    const { html, reporter } = renderOnce('x <b>y</b> z\n');
    assert.deepEqual(codes(reporter), ['E_RAW_HTML', 'E_RAW_HTML']);
    assert.equal(html, '<p>x y z</p>\n');
  });

  it('does not take a comment followed by something else for a comment', () => {
    assert.deepEqual(codes(renderOnce('<!-- a --> tail\n').reporter), [
      'E_RAW_HTML',
    ]);
    assert.deepEqual(
      codes(renderOnce('<!-- a --><script>x</script>\n').reporter),
      ['E_RAW_HTML'],
    );
  });

  it('shows the start of the first line of the HTML in the message, not more', () => {
    const { reporter } = renderOnce(
      `<script>${'x'.repeat(100)}</script>\nsecond\n`,
    );
    const { message } = find(reporter, 'E_RAW_HTML');
    assert.ok(message.includes('<script>'));
    assert.ok(!message.includes('x'.repeat(41)));
    assert.ok(!message.includes('second'));
    const indented = renderOnce('  <div>x</div>\n').reporter;
    assert.match(find(indented, 'E_RAW_HTML').message, /: <div>/);
  });
});

describe('task lists', () => {
  it('refuses each box, at its line, and renders the text without it', () => {
    const { html, reporter } = renderOnce('- [ ] one\n- [x] two\n');
    assert.deepEqual(view(reporter), [
      { level: 'error', code: 'E_TASK_LIST', file: 'case.md', line: 1 },
      { level: 'error', code: 'E_TASK_LIST', file: 'case.md', line: 2 },
    ]);
    assert.doesNotMatch(html, /<input|checkbox/);
    assert.match(html, /<li>one<\/li>/);
  });
});

describe('lists', () => {
  it('marks an ordered list as a list, once', () => {
    const { html, reporter } = renderOnce('1. a\n2. b\n');
    assert.deepEqual(codes(reporter), []);
    assert.equal(html, '<ol role="list">\n<li>a</li>\n<li>b</li>\n</ol>\n');
  });

  it('marks nested ordered lists, each once', () => {
    const { html } = renderOnce('1. a\n   1. inner\n2. b\n');
    assert.equal((html.match(/role="list"/g) ?? []).length, 2);
    assert.equal((html.match(/<ol role="list">/g) ?? []).length, 2);
  });

  it('leaves a bullet list as it is', () => {
    assert.equal(
      renderOnce('- a\n- b\n').html,
      '<ul>\n<li>a</li>\n<li>b</li>\n</ul>\n',
    );
  });

  it('warns about an ordered list that does not start at 1, and keeps the start', () => {
    const { html, reporter } = renderOnce('x\n\n3. a\n4. b\n');
    assert.deepEqual(view(reporter), [
      { level: 'warning', code: 'W_LIST_START', file: 'case.md', line: 3 },
    ]);
    assert.match(html, /<ol role="list" start="3">/);
  });

  it('warns about a list that starts at 0', () => {
    assert.deepEqual(codes(renderOnce('0. a\n').reporter), ['W_LIST_START']);
  });

  it('does not warn about a bullet list or about 1', () => {
    assert.deepEqual(codes(renderOnce('- a\n\n1. b\n').reporter), []);
  });

  it('says in the message where the list starts', () => {
    assert.match(
      find(renderOnce('7. a\n').reporter, 'W_LIST_START').message,
      /7/,
    );
  });
});

describe('text and typography', () => {
  const typography = { nbspAfter: ['i'], units: ['g'] };
  const run = (text) => renderOnce(text, { typography }).html;

  it('ties short words and units to what follows, in running text', () => {
    assert.equal(
      run('Mąka i woda, 250 g.\n'),
      `<p>Mąka i${NBSP}woda, 250${NBSP}g.</p>\n`,
    );
  });

  it('wraps a numeric range so that it does not break', () => {
    assert.match(run('Wait 5–6 hours.\n'), /<span class="nowrap">5–6<\/span>/);
  });

  it('does it in list items, table cells, titles and headings too', () => {
    assert.match(run('- a i b\n'), new RegExp(`a i${NBSP}b`));
    assert.match(
      run('| a | b |\n|-|-|\n| x i y | 2 |\n'),
      new RegExp(`x i${NBSP}y`),
    );
    assert.match(run('## A i B {#a}\n'), new RegExp(`A i${NBSP}B`));
    assert.match(run('::: tip A i B\nx\n:::\n'), new RegExp(`A i${NBSP}B`));
  });

  it('does not touch code, whether inline or a block', () => {
    const html = run('`a i b 250 g 5–6`\n\n```\na i b 250 g 5–6\n```\n');
    assert.ok(!html.includes(NBSP));
    assert.doesNotMatch(html, /nowrap/);
  });

  it('does not touch the address of a link or an attribute', () => {
    const html = run('[a i b](#x-i-y)\n');
    assert.match(html, /href="#x-i-y"/);
  });

  it('adds only ranges when the language says nothing', () => {
    const html = renderOnce('a i b 250 g 5–6\n').html;
    assert.ok(!html.includes(NBSP));
    assert.match(html, /nowrap/);
  });

  it('keeps entities as they are', () => {
    assert.equal(renderOnce('a & b < c\n').html, '<p>a &amp; b &lt; c</p>\n');
  });
});

describe('tables', () => {
  const table = (text, options) => renderOnce(text, options).html;

  it('is a scrolling region named by its columns, with a head and a body', () => {
    assert.equal(
      table(
        '| Name | Strength |\n|------|----------|\n| Flour | W330 |\n| Water | 0 |\n',
      ),
      '<div class="table-wrap" role="region" tabindex="0" aria-label="Name, Strength">' +
        '<table><thead><tr><th scope="col">Name</th>\n<th scope="col">Strength</th></tr></thead>' +
        '<tbody><tr><td data-label="Name"><span class="cell">Flour</span></td>\n<td data-label="Strength"><span class="cell">W330</span></td></tr>' +
        '\n<tr><td data-label="Name"><span class="cell">Water</span></td>\n<td data-label="Strength"><span class="cell">0</span></td></tr></tbody></table></div>\n',
    );
  });

  it('has no body for a table with a header only', () => {
    const html = table('| a | b |\n|---|---|\n');
    assert.doesNotMatch(html, /tbody|<td/);
    assert.ok(html.endsWith('</tr></thead></table></div>\n'));
    assert.match(html, /<thead>/);
  });

  it('carries the alignment of each column on its head and its cells', () => {
    const html = table(
      '| a | b | c | d |\n|:--|:-:|--:|---|\n| 1 | 2 | 3 | 4 |\n',
    );
    assert.deepEqual(
      [...html.matchAll(/<th scope="col"( align="\w+")?>/g)].map((m) => m[1]),
      [' align="left"', ' align="center"', ' align="right"', undefined],
    );
    assert.deepEqual(
      [...html.matchAll(/<td data-label="\w"( align="\w+")?>/g)].map(
        (m) => m[1],
      ),
      [' align="left"', ' align="center"', ' align="right"', undefined],
    );
  });

  it('labels a cell with the plain text of its column: no markup, plain spaces', () => {
    const html = table('| **Big** `x` | 250 g |\n|-|-|\n| 1 | 2 |\n', {
      typography: { units: ['g'] },
    });
    assert.ok(html.includes(`<th scope="col">250${NBSP}g</th>`));
    assert.ok(html.includes('data-label="250 g"'));
    assert.ok(html.includes('aria-label="Big x, 250 g"'));
    assert.ok(html.includes('data-label="Big x"'));
  });

  it('does not end a label with a space that a comment left behind', () => {
    const html = table('| Stir <!-- note --> |\n|-|\n| 1 |\n');
    assert.ok(html.includes('data-label="Stir"'));
    assert.ok(html.includes('aria-label="Stir"'));
    assert.ok(html.includes('<th scope="col">Stir </th>'));
  });

  it('trims the label and escapes it for an attribute', () => {
    const html = table('| a "q" & b |\n|-|\n| 1 |\n');
    assert.ok(html.includes('data-label="a &quot;q&quot; &amp; b"'));
    assert.ok(html.includes('aria-label="a &quot;q&quot; &amp; b"'));
  });

  it('renders Markdown in a cell, inside a span', () => {
    const html = table('| a |\n|-|\n| [x](#id) and *y* |\n');
    assert.match(
      html,
      /<span class="cell"><a href="#id">x<\/a> and <em>y<\/em><\/span>/,
    );
  });

  it('gives a row without a cell for a column an empty one', () => {
    const html = table('| a | b |\n|-|-|\n| 1 |\n');
    assert.equal((html.match(/<td /g) ?? []).length, 2);
    assert.match(html, /<td data-label="b"><span class="cell"><\/span><\/td>/);
  });

  it('refuses an outside link in a cell', () => {
    const { reporter } = renderOnce(
      '| a |\n|-|\n| [x](https://example.test) |\n',
    );
    assert.deepEqual(codes(reporter), ['E_LINK_TARGET']);
  });
});

describe('blocks: the way a block is found, checked and given its content', () => {
  const blocks = (...list) => Object.fromEntries(list.map((b) => [b.name, b]));

  it('uses the blocks of the guide unless it is given others', () => {
    assert.match(renderOnce('::: tip\nx\n:::\n').html, /callout-tip/);
    const own = renderOnce('::: tip\nx\n:::\n', {
      blocks: blocks(probe('mine')),
    });
    assert.deepEqual(codes(own.reporter), ['E_BLOCK_UNKNOWN']);
  });

  it('keeps what blocks record, across sections and in the order of the text', () => {
    const tag = probe('tag', {
      render: ({ attrs, record }) => {
        record({ type: 'tag', id: attrs.id });
        return '';
      },
      attrs: { id: 'required' },
    });
    const r = renderer({ blocks: blocks(tag) });
    assert.deepEqual(r.records, []);
    r.render('::: tag #a\n:::\n\n::: tag #b\n:::\n');
    r.render('::: tag #c\n:::\n', 'two.md');
    assert.deepEqual(codes(r.reporter), []);
    assert.deepEqual(
      r.records.map(({ id }) => id),
      ['a', 'b', 'c'],
    );
  });

  it('reports an unknown block, at its line, and renders nothing for it', () => {
    const { html, reporter } = renderOnce('a\n\n::: nope\nBody\n:::\n\nb\n');
    assert.deepEqual(view(reporter), [
      { level: 'error', code: 'E_BLOCK_UNKNOWN', file: 'case.md', line: 3 },
    ]);
    assert.equal(html, '<p>a</p>\n<p>b</p>\n');
  });

  it('reports a closing fence that closes nothing', () => {
    const { html, reporter } = renderOnce('a\n\n:::\n\nb\n');
    assert.deepEqual(view(reporter), [
      { level: 'error', code: 'E_BLOCK_STRAY_CLOSE', file: 'case.md', line: 3 },
    ]);
    assert.equal(html, '<p>a</p>\n<p>b</p>\n');
  });

  it('reports a block that is never closed, and still renders it to the end', () => {
    const { html, reporter } = renderOnce('::: tip\nBody\n');
    assert.deepEqual(codes(reporter), ['E_BLOCK_UNCLOSED']);
    assert.match(html, /<p>Body<\/p>/);
  });

  it('warns when the closing fence is not as long as the opening one', () => {
    const matching = renderOnce('::::: tip\nBody\n:::::\n');
    assert.deepEqual(codes(matching.reporter), []);
    const mismatch = renderOnce('::: tip\nBody\n::::\n');
    assert.deepEqual(view(mismatch.reporter), [
      { level: 'warning', code: 'W_BLOCK_FENCE', file: 'case.md', line: 1 },
    ]);
    assert.match(mismatch.html, /callout-tip/);
  });

  it('does not render a block that does not conform, but renders the others', () => {
    const { html, reporter } = renderOnce('::: q\nBody\n:::\n\nafter\n');
    assert.ok(codes(reporter).length > 0);
    assert.equal(html, '<p>after</p>\n');
  });

  describe('attributes and titles', () => {
    const run = (line, block, extra = '') =>
      renderOnce(`::: ${line}\nBody\n:::\n${extra}`, { blocks: blocks(block) });

    it('hands over the attributes, title, line and tokens of a conforming block', () => {
      const block = probe('b', {
        attrs: { k: 'optional', id: 'optional' },
        title: 'required',
      });
      const { html, reporter } = run('b #the-id k=v/a.b-c_d The title', block);
      assert.deepEqual(codes(reporter), []);
      assert.equal(html, '[b]');
      const seen = probe.seen;
      assert.deepEqual(seen.attrs, { id: 'the-id', k: 'v/a.b-c_d' });
      assert.equal(seen.title, 'The title');
      assert.equal(seen.line, 1);
      assert.equal(
        seen.tokens.find((t) => t.type === 'paragraph').text,
        'Body',
      );
      assert.equal(seen.parent, undefined);
      assert.equal(seen.lang.code, 'en');
      assert.equal(seen.ui.tip, 'tip');
      assert.equal(typeof seen.body, 'function');
    });

    it('refuses an attribute the block does not declare', () => {
      const { html, reporter } = run('b k=v', probe('b'));
      assert.deepEqual(codes(reporter), ['E_BLOCK_ATTR']);
      assert.equal(html, '');
    });

    it('refuses a value with a character that could break the markup', () => {
      for (const value of [
        'a<b',
        'a"b',
        "a'b",
        'a&b',
        'a b=c'.split(' ')[0] + '>',
      ]) {
        const { reporter, html } = run(
          `b k=${value}`,
          probe('b', { attrs: { k: 'optional' } }),
        );
        assert.deepEqual(codes(reporter), ['E_BLOCK_ATTR'], value);
        assert.equal(html, '');
      }
    });

    it('needs a required attribute, and says #id for the id', () => {
      const keyed = run('b', probe('b', { attrs: { k: 'required' } }));
      assert.deepEqual(codes(keyed.reporter), ['E_BLOCK_ATTR']);
      assert.match(find(keyed.reporter, 'E_BLOCK_ATTR').message, /k=/);
      const ided = run('b', probe('b', { attrs: { id: 'required' } }));
      assert.deepEqual(codes(ided.reporter), ['E_BLOCK_ATTR']);
      assert.match(find(ided.reporter, 'E_BLOCK_ATTR').message, /#id/);
    });

    it('does not take id=x for an attribute', () => {
      const { reporter, html } = run(
        'b id=x Title',
        probe('b', { attrs: { id: 'optional' } }),
      );
      assert.deepEqual(codes(reporter), ['E_BLOCK_ATTR']);
      assert.match(find(reporter, 'E_BLOCK_ATTR').message, /#id/);
      assert.equal(html, '');
    });

    it('refuses an attribute written after the title, which would have been dropped', () => {
      const { reporter } = run(
        'b Title k=x',
        probe('b', { attrs: { k: 'optional' } }),
      );
      assert.deepEqual(codes(reporter), ['E_BLOCK_ATTR']);
      assert.match(find(reporter, 'E_BLOCK_ATTR').message, /k=/);
    });

    it('lets a title hold a word that looks like an attribute the block has not got', () => {
      const { reporter } = run('b Why k=x', probe('b'));
      assert.deepEqual(codes(reporter), []);
    });

    it('does not take "id=" in a title for an attribute after it', () => {
      const { reporter } = run(
        'b #a Why id=5?',
        probe('b', { attrs: { id: 'required' } }),
      );
      assert.deepEqual(codes(reporter), []);
    });

    it('needs a title when it requires one and takes none when it says none', () => {
      assert.deepEqual(
        codes(run('b', probe('b', { title: 'required' })).reporter),
        ['E_BLOCK_TITLE'],
      );
      assert.deepEqual(
        codes(run('b Title', probe('b', { title: 'none' })).reporter),
        ['E_BLOCK_TITLE'],
      );
      assert.deepEqual(
        codes(run('b', probe('b', { title: 'none' })).reporter),
        [],
      );
      assert.deepEqual(codes(run('b', probe('b')).reporter), []);
      assert.deepEqual(codes(run('b Title', probe('b')).reporter), []);
    });

    it('reports every fault of a block, not only the first', () => {
      const { reporter } = run(
        'b zzz=1 id=x',
        probe('b', { title: 'none', attrs: { id: 'required' } }),
      );
      assert.deepEqual(codes(reporter), [
        'E_BLOCK_ATTR',
        'E_BLOCK_ATTR',
        'E_BLOCK_ATTR',
        'E_BLOCK_TITLE',
      ]);
    });
  });

  describe('nesting', () => {
    const kid = probe('kid', { parent: 'boss' });
    const boss = {
      name: 'boss',
      render: (c) => `<boss>${c.body()}</boss>`,
    };
    const other = {
      name: 'other',
      render: (c) => `<other>${c.body()}</other>`,
    };
    const opts = { blocks: blocks(kid, boss, other) };

    it('lets a block that wants a parent sit in it, and tells it who that is', () => {
      const { html, reporter } = renderOnce(
        '::: boss\n::: kid\n:::\n:::\n',
        opts,
      );
      assert.deepEqual(codes(reporter), []);
      assert.equal(html, '<boss>[kid]</boss>');
      assert.equal(probe.seen.parent, 'boss');
    });

    it('refuses it at the top of the page and in the wrong parent', () => {
      assert.deepEqual(codes(renderOnce('::: kid\n:::\n', opts).reporter), [
        'E_BLOCK_PARENT',
      ]);
      const wrong = renderOnce(
        '::: boss\n::: other\n::: kid\n:::\n:::\n:::\n',
        opts,
      );
      assert.deepEqual(codes(wrong.reporter), ['E_BLOCK_PARENT']);
    });

    it('needs the direct parent, not an ancestor', () => {
      const { reporter } = renderOnce(
        '::: boss\n::: boss\n::: kid\n:::\n:::\n:::\n',
        opts,
      );
      assert.deepEqual(codes(reporter), []);
    });

    it('forgets the parents when a block went wrong in the section before', () => {
      const boom = {
        name: 'boom',
        render: () => {
          throw new TypeError('x');
        },
      };
      const r = renderer({ blocks: blocks(boom, kid, boss) });
      assert.equal(r.render('::: boom\n:::\n'), '');
      assert.deepEqual(codes(r.reporter), ['E_RENDER']);
      r.render('::: kid\n:::\n');
      assert.deepEqual(codes(r.reporter), ['E_RENDER', 'E_BLOCK_PARENT']);
    });

    it('does not leave a block as the parent after it was rendered', () => {
      const r = renderer({ blocks: blocks(kid, boss) });
      r.render('::: boss\n:::\n\n::: kid\n:::\n');
      assert.deepEqual(codes(r.reporter), ['E_BLOCK_PARENT']);
    });
  });

  describe('the helpers a block is given', () => {
    const run = (fn, options = {}) => {
      const r = renderer({
        ...options,
        blocks: blocks({ name: 'h', render: (c) => String(fn(c)) }),
      });
      return { ...r, html: r.render('::: h\nBody\n:::\n', 'sec.md') };
    };

    it('error() reports at the file being rendered and the line given', () => {
      const { reporter } = run((c) => c.error('E_CUSTOM', 'bad', 7));
      assert.deepEqual(view(reporter), [
        { level: 'error', code: 'E_CUSTOM', file: 'sec.md', line: 7 },
      ]);
    });

    it('registerId() takes an id once', () => {
      const { reporter } = run((c) => {
        c.registerId('one', 1);
        c.registerId('two', 2);
      });
      assert.deepEqual(codes(reporter), []);
    });

    it('registerId() refuses a duplicate, naming the first place', () => {
      const { reporter } = run((c) => {
        c.registerId('one', 1);
        c.registerId('one', 5);
      });
      const dup = find(reporter, 'E_DUP_ID');
      assert.equal(dup.line, 5);
      assert.match(dup.message, /sec\.md:1/);
    });

    it('registerId() refuses a character an id may not have', () => {
      const { reporter } = run((c) => {
        c.registerId('a.b', 3);
        c.registerId('', 3);
        c.registerId('a b', 3);
      });
      assert.deepEqual(codes(reporter), [
        'E_ID_CHARSET',
        'E_ID_CHARSET',
        'E_ID_CHARSET',
      ]);
    });

    it('registerId() does not remember an id it refused', () => {
      const { reporter } = run(
        (c) => {
          c.registerId('top', 1);
          c.registerId('top', 2);
        },
        { isReserved: (id) => id === 'top' },
      );
      assert.deepEqual(codes(reporter), ['E_ID_RESERVED', 'E_ID_RESERVED']);
    });

    it('registerId() looks at the characters before it looks at the reserved ids', () => {
      const { reporter } = run((c) => c.registerId('a.b', 1), {
        isReserved: () => true,
      });
      assert.deepEqual(codes(reporter), ['E_ID_CHARSET']);
    });

    it('once() is true the first time for a key and false after, for the whole page', () => {
      const seen = [];
      const r = renderer({
        blocks: blocks({
          name: 'h',
          render: (c) => {
            seen.push(c.once('a'), c.once('a'), c.once('b'));
            return '';
          },
        }),
      });
      r.render('::: h\n:::\n\n::: h\n:::\n');
      r.render('::: h\n:::\n');
      assert.deepEqual(seen, [
        true,
        false,
        true,
        false,
        false,
        false,
        false,
        false,
        false,
      ]);
    });

    it('image() gives the tag, or reports and gives nothing', () => {
      const ok = run((c) => c.image('img/a.webp', 'Alt "x"', 4), {
        images: IMG,
      });
      assert.match(
        ok.html,
        /^<img src="\.\.\/img\/a\.webp" alt="Alt &quot;x&quot;" loading="lazy" /,
      );
      const gone = run((c) => c.image('img/gone.webp', 'x', 4));
      assert.equal(gone.html, '');
      assert.deepEqual(view(gone.reporter), [
        { level: 'error', code: 'E_IMG_MISSING', file: 'sec.md', line: 4 },
      ]);
    });

    it('image() sizes the picture for the place it is shown', () => {
      const images = {
        'img/a.webp': {
          width: 960,
          height: 640,
          variants: [{ href: 'img/a-480w.webp', width: 480 }],
        },
      };
      assert.match(
        run((c) => c.image('img/a.webp', '', 1, 'card'), { images }).html,
        /sizes="96px"/,
      );
      assert.match(
        run((c) => c.image('img/a.webp', '', 1, 'gallery'), { images }).html,
        /sizes="\(min-width: 800px\)/,
      );
      assert.match(
        run((c) => c.image('img/a.webp', '', 1), { images }).html,
        /sizes="\(min-width: 640px\) 560px/,
      );
    });

    it('figure() gives a figure with a rendered caption', () => {
      const { html } = run(
        (c) =>
          c.figure(
            { href: 'img/a.webp', text: 'x', title: '*cap*', line: 1 },
            'gallery',
          ),
        { images: IMG },
      );
      assert.match(
        html,
        /^<figure class="photo photo-landscape"><img [^>]*><figcaption><em>cap<\/em><\/figcaption><\/figure>\n$/,
      );
    });

    it('figure() has no caption without a title', () => {
      const { html } = run(
        (c) =>
          c.figure({ href: 'img/a.webp', text: 'x', title: null, line: 1 }),
        { images: IMG },
      );
      assert.doesNotMatch(html, /figcaption/);
    });

    it('inline() renders Markdown without a paragraph, on the given line', () => {
      const { html, reporter } = run((c) =>
        c.inline('a **b** [x](https://example.test)', 9),
      );
      assert.equal(html, 'a <strong>b</strong> ');
      assert.deepEqual(view(reporter), [
        { level: 'error', code: 'E_LINK_TARGET', file: 'sec.md', line: 9 },
      ]);
    });

    it('lang and ui are the ones of the page', () => {
      const { html } = run((c) => `${c.lang.code}|${c.ui.search}`, {
        code: 'uk',
        ui: { search: 'Пошук' },
      });
      assert.equal(html, 'uk|Пошук');
    });

    it('body() renders the block content as Markdown', () => {
      const r = renderer({
        blocks: blocks({ name: 'h', render: (c) => `<${c.body()}>` }),
      });
      assert.equal(
        r.render('::: h\n## H {#h}\n\n- a\n:::\n'),
        '<<h2 id="h">H<a class="hanchor" href="#h" aria-labelledby="h">#</a></h2>\n<ul>\n<li>a</li>\n</ul>\n>',
      );
    });
  });

  it('takes a block of our own with no attrs and no title given, as an optional-title one', () => {
    const { reporter } = renderOnce('::: free Any title\nx\n:::\n', {
      blocks: blocks(probe('free')),
    });
    assert.deepEqual(codes(reporter), []);
  });

  it('finds a block in a list item and a quote, and not in code', () => {
    const own = { blocks: blocks(probe('b')) };
    assert.match(
      renderOnce('- item\n\n  ::: b\n  x\n  :::\n', own).html,
      /\[b\]/,
    );
    assert.match(renderOnce('> ::: b\n> x\n> :::\n', own).html, /\[b\]/);
    assert.doesNotMatch(
      renderOnce('```\n::: b\nx\n:::\n```\n', own).html,
      /\[b\]/,
    );
  });
});

describe('render', () => {
  it('reports at the file it was given', () => {
    const r = renderer();
    r.render('## No id\n', 'content/en/05-x.md');
    assert.equal(find(r.reporter, 'E_HEADING_ID').file, 'content/en/05-x.md');
  });

  it('reports a leak of authoring syntax, at the line of the block it came from', () => {
    const { reporter } = renderOnce(
      '## A {#a}\n\nfine\n\ntext with {#stray} id\n',
    );
    assert.deepEqual(view(reporter), [
      { level: 'error', code: 'E_LEAK', file: 'case.md', line: 5 },
    ]);
  });

  it('reports a leaked fence and a leaked image', () => {
    const fence = renderOnce('a\n  ::: x\nb\n');
    assert.deepEqual(codes(fence.reporter), ['E_LEAK']);
    assert.match(find(fence.reporter, 'E_LEAK').message, /:::/);
    const image = renderOnce('ok\n\n![alt][nope]\n');
    assert.match(find(image.reporter, 'E_LEAK').message, /!\[/);
    assert.equal(find(image.reporter, 'E_LEAK').line, 3);
  });

  it('allows the syntax in code', () => {
    const { reporter } = renderOnce('`{#a}` and\n\n```\n::: x\n![a](b)\n```\n');
    assert.deepEqual(codes(reporter), []);
  });

  it('puts the line of a leak inside a block at the line of the block', () => {
    const { reporter } = renderOnce('a\n\n::: tip\nBody {#leak} here\n:::\n');
    assert.deepEqual(view(reporter), [
      { level: 'error', code: 'E_LEAK', file: 'case.md', line: 4 },
    ]);
  });

  it('reports a text it cannot get through, and gives nothing, never an exception', () => {
    const { html, reporter } = renderOnce('> '.repeat(20000) + 'x\n');
    assert.equal(html, '');
    assert.deepEqual(codes(reporter), ['E_RENDER']);
    assert.equal(find(reporter, 'E_RENDER').file, 'case.md');
  });

  it('reports a block that throws as E_RENDER, with the name of the error', () => {
    const { html, reporter } = renderOnce('a\n\n::: boom\n:::\n', {
      blocks: {
        boom: {
          name: 'boom',
          render: () => {
            throw new RangeError('x');
          },
        },
      },
    });
    assert.equal(html, '');
    assert.deepEqual(codes(reporter), ['E_RENDER']);
    assert.match(find(reporter, 'E_RENDER').message, /RangeError/);
  });

  it('goes on with the next section after a text it could not render', () => {
    const r = renderer();
    assert.equal(r.render('> '.repeat(20000) + 'x\n'), '');
    assert.equal(r.render('fine\n'), '<p>fine</p>\n');
  });

  it('renders the same text to the same HTML every time', () => {
    const text =
      '## A {#a}\n\n::: tip\nx\n:::\n\n| a |\n|-|\n| 1 |\n\n1. one\n';
    assert.equal(renderOnce(text).html, renderOnce(text).html);
  });

  it('gives an empty text and a text of blanks as nothing', () => {
    assert.equal(renderOnce('').html, '');
    assert.equal(renderOnce('\n\n  \n').html, '');
  });

  it('reports every diagnostic of a document in its order', () => {
    const { reporter } = renderOnce(
      '## A\n\n[x](https://x.test)\n\n<b>y</b>\n\n- [ ] t\n',
    );
    assert.deepEqual(errorCodes(reporter), [
      'E_HEADING_ID',
      'E_LINK_TARGET',
      'E_RAW_HTML',
      'E_RAW_HTML',
      'E_TASK_LIST',
    ]);
    assert.equal(findAll(reporter, 'E_RAW_HTML').length, 2);
  });
});
