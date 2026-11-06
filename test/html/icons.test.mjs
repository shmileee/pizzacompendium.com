import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { icon, sprite } from '../../scripts/lib/html/icons.mjs';

/** The names of the symbols of the sprite. */
const names = () =>
  [...sprite().matchAll(/<symbol id="pc-i-([\w-]+)"/g)].map((m) => m[1]);

describe('sprite', () => {
  it('is one hidden svg with a symbol of 24 by 24 for every icon', () => {
    const html = sprite();
    assert.match(
      html,
      /^<svg class="pc-sprite" id="pc-icons" aria-hidden="true">/,
    );
    assert.ok(html.endsWith('</svg>'));
    assert.equal((html.match(/<symbol /g) ?? []).length, names().length);
    assert.equal(
      (html.match(/viewBox="0 0 24 24"/g) ?? []).length,
      names().length,
    );
    assert.equal((html.match(/<\/symbol>/g) ?? []).length, names().length);
  });

  it('lists the icons the page templates use, each once', () => {
    const list = names();
    for (const name of [
      'search',
      'menu',
      'close',
      'sun',
      'moon',
      'auto',
      'globe',
      'chevron-down',
      'arrow-up',
      'arrow-right',
      'link',
      'check',
      'tip',
      'warning',
      'note',
      'local',
      'sprout',
    ])
      assert.ok(list.includes(name), name);
    assert.equal(new Set(list).size, list.length);
  });

  it('draws only shapes: no scripts, no handlers, no style', () => {
    assert.doesNotMatch(sprite(), /<script|\son\w+=|style=/);
  });

  it('is the same text every time', () => {
    assert.equal(sprite(), sprite());
  });
});

describe('icon', () => {
  it('points at the symbol of its name and hides from assistive technology', () => {
    assert.equal(
      icon('search'),
      '<svg class="icon" width="24" height="24" aria-hidden="true"><use href="#pc-i-search"/></svg>',
    );
  });

  it('adds the extra class after icon', () => {
    assert.match(
      icon('globe', 'lang-chevron'),
      /^<svg class="icon lang-chevron" /,
    );
  });

  it('exists in the sprite for every name the sprite lists', () => {
    for (const name of names()) {
      assert.match(icon(name), new RegExp(`href="#pc-i-${name}"`));
    }
  });

  it('throws for a name that is not in the set', () => {
    assert.throws(() => icon('nonexistent'), /unknown icon "nonexistent"/);
  });

  it('throws for a name that only the prototype of an object has', () => {
    for (const name of [
      'constructor',
      'toString',
      '__proto__',
      'hasOwnProperty',
    ])
      assert.throws(() => icon(name), /unknown icon/, name);
  });
});
