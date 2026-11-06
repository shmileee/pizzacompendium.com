import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { escapeHtml, uiText } from '../../scripts/lib/html/escape.mjs';

describe('escapeHtml', () => {
  it('escapes the four characters that matter in a body and an attribute', () => {
    assert.equal(
      escapeHtml(`<a href="x">Tom & Jerry</a>`),
      '&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&lt;/a&gt;',
    );
  });

  it('escapes the ampersand first, so an entity is not escaped twice by accident', () => {
    assert.equal(escapeHtml('&lt;'), '&amp;lt;');
    assert.equal(escapeHtml('<'), '&lt;');
  });

  it('escapes every occurrence, not the first only', () => {
    assert.equal(
      escapeHtml('<<>>""&&'),
      '&lt;&lt;&gt;&gt;&quot;&quot;&amp;&amp;',
    );
  });

  it('leaves plain and typographic text alone', () => {
    assert.equal(escapeHtml("it's 5–6 g, «ok»"), "it's 5–6 g, «ok»");
    assert.equal(escapeHtml(''), '');
  });
});

describe('uiText', () => {
  const text = uiText({ a: 'x < y', b: 'plain' });

  it('reads a UI string, escaped', () => {
    assert.equal(text('a'), 'x &lt; y');
    assert.equal(text('b'), 'plain');
  });

  it('is a function of its own ui', () => {
    assert.equal(uiText({ a: 'other' })('a'), 'other');
  });
});
