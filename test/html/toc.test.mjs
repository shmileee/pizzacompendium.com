import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  groupToc,
  renderToc,
  renderTocList,
} from '../../scripts/lib/html/toc.mjs';
import { ui } from '../helpers/render.mjs';

const h = (level, id, html = id) => ({ level, id, html });

describe('groupToc', () => {
  it('puts each h3 under the h2 before it', () => {
    const groups = groupToc([
      h(2, 'a'),
      h(3, 'a1'),
      h(3, 'a2'),
      h(2, 'b'),
      h(3, 'b1'),
    ]);
    assert.deepEqual(
      groups.map((g) => [g.id, g.kids.map((k) => k.id)]),
      [
        ['a', ['a1', 'a2']],
        ['b', ['b1']],
      ],
    );
  });

  it('lets an h3 before any h2 stand on its own', () => {
    const groups = groupToc([h(3, 'x'), h(3, 'y'), h(2, 'a'), h(3, 'a1')]);
    assert.deepEqual(
      groups.map((g) => [g.level, g.id, g.kids.map((k) => k.id)]),
      [
        [3, 'x', []],
        [3, 'y', []],
        [2, 'a', ['a1']],
      ],
    );
  });

  it('is empty for no entries and does not change its input', () => {
    assert.deepEqual(groupToc([]), []);
    const entries = [h(2, 'a'), h(3, 'a1')];
    groupToc(entries);
    assert.equal('kids' in entries[0], false);
  });

  it('keeps the other fields of an entry', () => {
    const [group] = groupToc([h(2, 'a', 'Dough &amp; water')]);
    assert.equal(group.html, 'Dough &amp; water');
    assert.equal(group.level, 2);
  });

  it('does not nest an entry of another level under the chapter', () => {
    const groups = groupToc([h(2, 'a'), h(4, 'deep'), h(3, 'a1')]);
    assert.deepEqual(
      groups.map((g) => [g.id, g.kids.map((k) => k.id)]),
      [
        ['a', ['a1']],
        ['deep', []],
      ],
    );
  });
});

describe('renderTocList', () => {
  it('is an empty list for no entries', () => {
    assert.equal(renderTocList([]), '<ul class="toc-list"></ul>');
  });

  it('numbers the chapters from 01 and links every entry', () => {
    const html = renderTocList([
      h(2, 'a', 'A'),
      h(3, 'a1', 'A one'),
      h(2, 'b', 'B'),
    ]);
    assert.equal(
      html,
      '<ul class="toc-list">' +
        '<li class="toc-chapter"><a href="#a" data-number="01">A</a><ul><li><a href="#a1">A one</a></li></ul></li>' +
        '<li class="toc-chapter"><a href="#b" data-number="02">B</a></li>' +
        '</ul>',
    );
  });

  it('pads to two digits and goes on past nine', () => {
    const entries = Array.from({ length: 12 }, (_, i) => h(2, `c${i + 1}`));
    const numbers = [
      ...renderTocList(entries).matchAll(/data-number="(\d+)"/g),
    ].map((m) => m[1]);
    assert.deepEqual(numbers, [
      '01',
      '02',
      '03',
      '04',
      '05',
      '06',
      '07',
      '08',
      '09',
      '10',
      '11',
      '12',
    ]);
  });

  it('gives an h3 on its own no number, and does not count it', () => {
    const html = renderTocList([h(3, 'x'), h(2, 'a')]);
    assert.match(html, /<a href="#x" data-number="">/);
    assert.match(html, /<a href="#a" data-number="01">/);
  });

  it('writes the already escaped text as it is', () => {
    assert.match(renderTocList([h(2, 'a', 'A &amp; B')]), />A &amp; B<\/a>/);
  });

  it('has no nested list for a chapter without sections', () => {
    assert.doesNotMatch(renderTocList([h(2, 'a'), h(2, 'b')]), /<li><a/);
  });
});

describe('renderToc', () => {
  it('is a labelled navigation with the close button and the list', () => {
    const html = renderToc({ toc: [h(2, 'a', 'A')], ui: ui() });
    assert.match(html, /^<nav class="toc" id="toc" aria-label="toc">/);
    assert.match(html, /<p class="toc-title">toc<\/p>/);
    assert.match(
      html,
      /<button type="button" [^>]*data-toc-close aria-label="tocClose">/,
    );
    assert.ok(html.includes(renderTocList([h(2, 'a', 'A')])));
    assert.ok(html.endsWith('</nav>'));
  });

  it('escapes the strings it takes from the language', () => {
    const html = renderToc({
      toc: [],
      ui: ui({ toc: 'a "b" <c>', tocClose: '<x>' }),
    });
    assert.match(html, /aria-label="a &quot;b&quot; &lt;c&gt;"/);
    assert.match(html, /aria-label="&lt;x&gt;"/);
    assert.doesNotMatch(html, /<c>|<x>/);
  });
});
