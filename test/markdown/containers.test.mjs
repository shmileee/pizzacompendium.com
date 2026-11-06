import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Marked } from 'marked';
import { containerExtension } from '../../scripts/lib/markdown/containers.mjs';

const marked = (render = (token) => `[${token.name ?? 'stray'}]`) =>
  new Marked({ extensions: [containerExtension(render)] });

const lex = (src) => marked().lexer(src);

/** Every container token in the tree, in document order. */
function containers(tokens, found = []) {
  for (const token of tokens) {
    if (token.type === 'container') found.push(token);
    for (const child of [token.tokens, token.items].filter(Boolean))
      containers(child, found);
  }
  return found;
}

const first = (src) => containers(lex(src))[0];

describe('containerExtension: after a one-character paragraph', () => {
  it('still finds the container', () => {
    assert.equal(first('a\n::: note Hello\nbody\n:::').name, 'note');
  });
});

describe('containerExtension: one block', () => {
  it('reads name, attributes, title and body', () => {
    const token = first('::: q #faq-a Why?\nBecause.\n:::\n');
    assert.equal(token.type, 'container');
    assert.equal(token.name, 'q');
    assert.deepEqual(token.attrs, { id: 'faq-a' });
    assert.equal(token.title, 'Why?');
    assert.equal(token.fence, 3);
    assert.equal(token.closeFence, 3);
    assert.equal(token.tokens[0].type, 'paragraph');
    assert.equal(token.tokens[0].text, 'Because.');
    assert.equal(token.raw, '::: q #faq-a Why?\nBecause.\n:::\n');
  });

  it('reads key=value attributes before the title', () => {
    const token = first('::: flour img=a.webp w=3 The Title\nx\n:::');
    assert.deepEqual(token.attrs, { img: 'a.webp', w: '3' });
    assert.equal(token.title, 'The Title');
  });

  it('has an empty title and attributes for a bare name', () => {
    const token = first('::: tip\nx\n:::');
    assert.deepEqual(token.attrs, {});
    assert.equal(token.title, '');
  });

  it('records the length of the fences', () => {
    const token = first(':::::: gallery\nx\n::::');
    assert.equal(token.fence, 6);
    assert.equal(token.closeFence, 4);
  });

  it('accepts a closing fence without a final newline and with trailing blanks', () => {
    assert.equal(first('::: tip\nx\n:::').closeFence, 3);
    assert.equal(first('::: tip\nx\n:::  \t\n').closeFence, 3);
  });

  it('lexes the body as Markdown', () => {
    const token = first('::: tip\n- a\n- b\n\n## H {#h}\n:::');
    const types = token.tokens.map((t) => t.type);
    assert.ok(types.includes('list'));
    assert.ok(types.includes('heading'));
    assert.equal(token.tokens.find((t) => t.type === 'list').items.length, 2);
  });

  it('has an empty body for an empty block', () => {
    const token = first('::: tip\n:::\n');
    assert.deepEqual(token.tokens, []);
    assert.equal(token.closeFence, 3);
  });

  it('keeps the text before and after as ordinary blocks', () => {
    const tokens = lex('before\n\n::: tip\nx\n:::\n\nafter\n');
    assert.deepEqual(
      tokens.filter((t) => t.type !== 'space').map((t) => t.type),
      ['paragraph', 'container', 'paragraph'],
    );
  });

  it('interrupts a paragraph that has no blank line before it', () => {
    const tokens = lex('text\n::: tip\nx\n:::\n');
    assert.deepEqual(
      tokens.map((t) => t.type),
      ['paragraph', 'container'],
    );
    assert.equal(tokens[0].text, 'text');
  });

  it('is not triggered by colons inside a line or by two colons', () => {
    assert.equal(containers(lex('a ::: b\n')).length, 0);
    assert.equal(containers(lex('x\n:: tip\ny\n::\n')).length, 0);
  });
});

describe('containerExtension: nesting', () => {
  it('nests a block in a block and ends each one at its own closer', () => {
    const outer = first(
      ':::: flours\n::: flour a=b One\n- x\n:::\n::: flour a=c Two\n- y\n:::\n::::\nafter\n',
    );
    assert.equal(outer.name, 'flours');
    assert.equal(outer.closeFence, 4);
    const inner = containers(outer.tokens);
    assert.deepEqual(
      inner.map((t) => t.title),
      ['One', 'Two'],
    );
    assert.equal(outer.raw.endsWith('::::\n'), true);
  });

  it('counts closers by depth, not by length', () => {
    const outer = first('::: a\n:::: b\nx\n::\n:::\n:::\ntail\n');
    // the inner opener takes the first closer, the outer one the second
    assert.equal(outer.closeFence, 3);
    assert.equal(outer.tokens.filter((t) => t.type === 'container').length, 1);
    assert.equal(outer.raw.endsWith(':::\n'), true);
    assert.equal(outer.raw.includes('tail'), false);
  });

  it('reads three levels', () => {
    const all = containers(lex('::: a\n::: b\n::: c\nx\n:::\n:::\n:::\n'));
    assert.deepEqual(
      all.map((t) => t.name),
      ['a', 'b', 'c'],
    );
    assert.ok(all.every((t) => t.closeFence === 3));
  });

  it('lets an unclosed inner block take the closer of the outer one', () => {
    const [outer, inner] = containers(lex('::: a\n::: b\nx\n:::\n'));
    assert.equal(outer.closeFence, null);
    assert.equal(inner.closeFence, 3);
  });
});

describe('containerExtension: unclosed and stray', () => {
  it('runs an unclosed block to the end of the document', () => {
    const token = first('::: tip\nx\n\ny\n');
    assert.equal(token.closeFence, null);
    assert.equal(token.raw, '::: tip\nx\n\ny\n');
    assert.equal(token.tokens.filter((t) => t.type === 'paragraph').length, 2);
  });

  it('runs an unclosed block with no body to the end', () => {
    const token = first('::: tip');
    assert.equal(token.closeFence, null);
    assert.deepEqual(token.tokens, []);
    assert.equal(first('::: tip\n').closeFence, null);
  });

  it('marks a bare ::: with nothing open as stray', () => {
    const [token] = containers(lex('text\n\n:::\n\nmore\n'));
    assert.equal(token.stray, true);
    assert.equal(token.name, undefined);
    assert.equal(token.tokens, undefined);
    assert.equal(token.raw.trim(), ':::');
  });

  it('marks a second closer as stray', () => {
    const all = containers(lex('::: tip\nx\n:::\n:::\n'));
    assert.deepEqual(
      all.map((t) => t.stray === true),
      [false, true],
    );
  });
});

describe('containerExtension: where Markdown puts them', () => {
  it('does not find one inside a fenced code block', () => {
    assert.equal(containers(lex('```\n::: tip\nx\n:::\n```\n')).length, 0);
    assert.equal(
      containers(lex('````md\n```\n::: tip\n:::\n```\n````\n')).length,
      0,
    );
    assert.equal(containers(lex('~~~\n::: tip\n~~~\n')).length, 0);
  });

  it('does not find one inside an indented code block', () => {
    assert.equal(containers(lex('    ::: tip\n    x\n    :::\n')).length, 0);
  });

  it('does not let a fence inside a block close it', () => {
    const token = first('::: tip\n```\n:::\n```\nx\n:::\ntail\n');
    assert.equal(token.closeFence, 3);
    assert.ok(token.raw.endsWith(':::\n'));
    assert.equal(token.raw.includes('tail'), false);
    assert.equal(token.tokens[0].type, 'code');
  });

  it('does not let a comment inside a block close or open anything', () => {
    const token = first('::: tip\n<!--\n:::\n-->\nx\n:::\n');
    assert.equal(token.closeFence, 3);
    assert.equal(token.raw.split('\n').length, 7);
    assert.equal(containers(token.tokens).length, 0);
  });

  it('does not treat an indented ::: as a fence', () => {
    assert.equal(containers(lex('  ::: tip\n  x\n  :::\n')).length, 0);
    const token = first('::: tip\n  :::\nx\n:::\n');
    assert.ok(token.raw.endsWith('x\n:::\n'));
  });

  it('finds one inside a list item', () => {
    const token = first(
      '1. Step\n   ::: tip\n   Keep warm.\n   :::\n2. Next\n',
    );
    assert.equal(token.name, 'tip');
    assert.equal(token.tokens[0].text, 'Keep warm.');
  });

  it('finds one inside a quote', () => {
    const token = first('> ::: tip\n> quoted\n> :::\n');
    assert.equal(token.name, 'tip');
    assert.equal(token.closeFence, 3);
  });

  it('finds one directly after a list line', () => {
    assert.equal(first('- a\n- b\n::: note\nbody\n:::\n').name, 'note');
  });
});

describe('containerExtension: rendering', () => {
  it('hands the token and the parser to render', () => {
    const seen = [];
    const html = new Marked({
      extensions: [
        containerExtension((token, parser) => {
          seen.push([token.name, typeof parser.parse]);
          return `<div class="${token.name}">${parser.parse(token.tokens)}</div>`;
        }),
      ],
    }).parse('::: tip\nhello *you*\n:::\n');
    assert.deepEqual(seen, [['tip', 'function']]);
    assert.equal(
      html.trim(),
      '<div class="tip"><p>hello <em>you</em></p>\n</div>',
    );
  });

  it('renders nested blocks inside out', () => {
    const html = marked((token) => `(${token.name})`).parse(
      '::: a\n::: b\nx\n:::\n:::\n',
    );
    assert.equal(html, '(a)');
  });

  it('walks the body tokens (childTokens)', () => {
    const seen = [];
    const instance = new Marked({
      extensions: [containerExtension(() => '')],
      walkTokens: (token) => seen.push(token.type),
    });
    instance.parse('::: tip\n**x**\n:::\n');
    assert.ok(seen.includes('strong'));
  });
});

describe('containerExtension: time', () => {
  it('lexes 16,000 paragraphs in one unclosed block in linear time', () => {
    const src = `::: tip\n${Array.from({ length: 16_000 }, (_, i) => `paragraph ${i}`).join('\n\n')}\n`;
    const started = performance.now();
    const token = first(src);
    const elapsed = performance.now() - started;
    assert.equal(token.closeFence, null);
    assert.equal(
      token.tokens.filter((t) => t.type === 'paragraph').length,
      16_000,
    );
    assert.ok(elapsed < 3000, `took ${elapsed} ms`);
  });

  it('lexes 16,000 closed blocks in a row in linear time', () => {
    const src = Array.from(
      { length: 16_000 },
      (_, i) => `::: tip\nitem ${i}\n:::\n`,
    ).join('\n');
    const started = performance.now();
    const found = containers(lex(src));
    const elapsed = performance.now() - started;
    assert.equal(found.length, 16_000);
    assert.ok(found.every((t) => t.closeFence === 3));
    assert.ok(elapsed < 3000, `took ${elapsed} ms`);
  });

  it('lexes 16,000 stray closers and 16,000 unclosed openers fast', () => {
    const started = performance.now();
    assert.equal(containers(lex(':::\n'.repeat(16_000))).length, 16_000);
    const nested = containers(lex('::: a\n'.repeat(2_000)));
    assert.equal(nested.length, 2_000);
    assert.ok(performance.now() - started < 5000);
  });
});
