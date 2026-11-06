import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { activeIndex, around, scrollTarget } from '../../src/js/toc.js';

describe('activeIndex', () => {
  it('is the last heading that reached the line', () => {
    assert.equal(activeIndex([-300, -10, 40, 500], 50, false), 2);
    assert.equal(activeIndex([-300, -10, 40, 500], 0, false), 1);
  });

  it('counts a heading exactly on the line', () => {
    assert.equal(activeIndex([10, 50, 90], 50, false), 1);
  });

  it('is -1 before the first heading and for none', () => {
    assert.equal(activeIndex([10, 20], 5, false), -1);
    assert.equal(activeIndex([], 5, false), -1);
  });

  it('is the last heading at the end of the page', () => {
    assert.equal(activeIndex([-300, 400, 900], 50, true), 2);
    assert.equal(activeIndex([], 50, true), -1);
  });
});

describe('scrollTarget', () => {
  const box = { top: 100, bottom: 700, height: 600 };

  it('is null when the link is well inside the box', () => {
    assert.equal(scrollTarget({ top: 200, bottom: 230 }, box, 40), null);
  });

  it('keeps the edge margin: touching it counts as in view', () => {
    assert.equal(scrollTarget({ top: 148, bottom: 180 }, box, 0), null);
    assert.equal(scrollTarget({ top: 600, bottom: 652 }, box, 0), null);
  });

  it('scrolls when the link is too near the top', () => {
    assert.equal(
      scrollTarget({ top: 147, bottom: 170 }, box, 50),
      50 + 47 - 200,
    );
  });

  it('scrolls when the link is too near the bottom', () => {
    assert.equal(scrollTarget({ top: 600, bottom: 653 }, box, 0), 500 - 200);
  });

  it('puts the link a third of the way down', () => {
    const target = scrollTarget({ top: 900, bottom: 920 }, box, 10);
    assert.equal(target, 10 + 800 - 200);
  });
});

describe('around', () => {
  const tree = () => {
    const make = (name, children = []) => {
      const n = { name, children, parentElement: null };
      for (const c of children) c.parentElement = n;
      return n;
    };
    const toc = make('toc', [make('toc-a')]);
    const main = make('main');
    const header = make('header');
    const body = make('body', [header, toc, main]);
    const html = make('html', [make('head'), body]);
    return { toc, main, header, body, html };
  };

  it('lists the siblings of the element and of each ancestor', () => {
    const { toc } = tree();
    assert.deepEqual(
      around(toc).map((n) => n.name),
      ['header', 'main', 'head'],
    );
  });

  it('never lists the element or its ancestors', () => {
    const { toc, body, html } = tree();
    const others = around(toc);
    for (const n of [toc, body, html]) assert.ok(!others.includes(n));
  });

  it('is empty for an element without a parent', () => {
    assert.deepEqual(around({ parentElement: null, children: [] }), []);
  });
});
