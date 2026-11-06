import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { codes, errorCodes, find, view } from '../helpers/capture.mjs';
import { renderer, renderOnce } from '../helpers/render.mjs';

const Q = (id, title = 'Why?', body = 'Because.') =>
  `::: q #${id} ${title}\n${body}\n:::\n`;

describe('the q block', () => {
  it('is a collapsible item with the id as its anchor, the question and the answer', () => {
    const { html, reporter } = renderOnce(Q('faq-one'));
    assert.deepEqual(codes(reporter), []);
    assert.match(
      html,
      /<details class="faq" id="faq-one"><summary><span class="faq-q">Why\?<\/span><svg class="icon faq-chevron" [^>]*><use href="#pc-i-chevron-down"\/><\/svg><\/summary><div class="faq-body"><p>Because\.<\/p>\n<\/div><\/details>\n$/,
    );
  });

  it('renders Markdown in the question and keeps it in one flex item', () => {
    const { html } = renderOnce(Q('a', 'Is **this** `ok`?'));
    assert.match(
      html,
      /<span class="faq-q">Is <strong>this<\/strong> <code>ok<\/code>\?<\/span>/,
    );
  });

  it('brings the expand button and the template of the answer footer before the first question', () => {
    const { html } = renderOnce(Q('a'), {
      ui: {
        expandAll: 'Open <all>',
        collapseAll: 'Close "all"',
        linkCopied: 'Copied',
        copyFailed: 'Failed',
        copyLink: 'Copy',
      },
    });
    assert.ok(html.startsWith('<div class="faq-tools">'));
    assert.match(
      html,
      /data-faq-toggle data-expand="Open &lt;all&gt;" data-collapse="Close &quot;all&quot;"/,
    );
    assert.match(
      html,
      /<template id="pc-faq-foot" data-copied="Copied" data-failed="Failed">/,
    );
    assert.match(
      html,
      /<button type="button" class="btn btn-quiet faq-copy" data-faq-copy>[\s\S]*<span>Copy<\/span><\/button>/,
    );
    assert.ok(html.indexOf('faq-tools') < html.indexOf('<details'));
  });

  it('brings them once for the whole page, not once for each question or section', () => {
    const r = renderer();
    const first = r.render(Q('a') + '\n' + Q('b'));
    const second = r.render(Q('c'));
    assert.equal((first.match(/class="faq-tools"/g) ?? []).length, 1);
    assert.equal((first.match(/pc-faq-foot/g) ?? []).length, 1);
    assert.equal((second.match(/faq-tools|pc-faq-foot/g) ?? []).length, 0);
    assert.ok(second.startsWith('<details class="faq" id="c">'));
    assert.match(first, /<\/details>\n<details class="faq" id="b">/);
    assert.equal((first.match(/<details/g) ?? []).length, 2);
  });

  it('brings them again for a new page', () => {
    assert.match(renderOnce(Q('a')).html, /faq-tools/);
    assert.match(renderOnce(Q('a')).html, /faq-tools/);
  });

  it('needs an id', () => {
    const { reporter, html } = renderOnce('::: q Why?\nBecause.\n:::\n');
    assert.deepEqual(view(reporter), [
      { level: 'error', code: 'E_BLOCK_ATTR', file: 'case.md', line: 1 },
    ]);
    assert.equal(html, '');
  });

  it('needs a title', () => {
    const { reporter } = renderOnce('::: q #a\nBecause.\n:::\n');
    assert.deepEqual(codes(reporter), ['E_BLOCK_TITLE']);
  });

  it('refuses a duplicate id, at the second question', () => {
    const { reporter } = renderOnce(Q('same') + '\n' + Q('same'));
    const dup = find(reporter, 'E_DUP_ID');
    assert.equal(dup.line, 5);
    assert.deepEqual(errorCodes(reporter), ['E_DUP_ID']);
  });

  it('refuses an id that the page uses itself', () => {
    const { reporter } = renderOnce(Q('top'), {
      isReserved: (id) => id === 'top',
    });
    assert.deepEqual(codes(reporter), ['E_ID_RESERVED']);
  });

  it('does not take an id with a character that an id may not have', () => {
    const { reporter, html } = renderOnce(Q('a.b'));
    assert.deepEqual(codes(reporter), ['E_BLOCK_ATTR']);
    assert.equal(html, '');
  });

  it('shares its ids with the headings', () => {
    const { reporter } = renderOnce('## Head {#same}\n\n' + Q('same'));
    assert.deepEqual(codes(reporter), ['E_DUP_ID']);
  });

  it('takes blocks and lists in the answer', () => {
    const { html } = renderOnce(Q('a', 'Why?', '::: tip\nInner.\n:::\n\n- x'));
    assert.match(
      html,
      /<div class="faq-body"><div class="callout callout-tip"/,
    );
    assert.match(html, /<ul>\n<li>x<\/li>/);
  });
});
