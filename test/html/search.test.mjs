import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { renderSearch } from '../../scripts/lib/html/search.mjs';
import { ui } from '../helpers/render.mjs';

describe('renderSearch', () => {
  const html = renderSearch({ ui: ui() });

  it('has the button that opens the dialog, with the shortcut hint slot', () => {
    assert.match(
      html,
      /<button type="button" class="btn btn-quiet search-btn" data-search-open aria-haspopup="dialog" aria-keyshortcuts="Control\+K Meta\+K">/,
    );
    assert.match(html, /<span class="search-btn-label">search<\/span>/);
    assert.match(
      html,
      /<kbd class="search-kbd" aria-hidden="true" data-search-kbd><\/kbd>/,
    );
  });

  it('has a modal dialog named by its label', () => {
    assert.match(
      html,
      /<dialog class="search" id="pc-search" aria-labelledby="pc-search-label"/,
    );
    assert.match(
      html,
      /<label class="visually-hidden" id="pc-search-label" for="pc-search-input">searchLabel<\/label>/,
    );
    assert.match(
      html,
      /<input class="search-input" id="pc-search-input" type="text"[^>]* role="combobox"[^>]* aria-controls="pc-search-results"[^>]* placeholder="searchLabel" autofocus>/,
    );
  });

  it('is a combobox that is open and that the browser does not spell-check', () => {
    const input = /<input [^>]*>/.exec(html)[0];
    assert.match(input, / aria-expanded="true"/);
    assert.match(input, / spellcheck="false"/);
    assert.match(input, / autocomplete="off"/);
    assert.match(input, / aria-autocomplete="list"/);
  });

  it('hands the strings the script needs over as data attributes of the dialog', () => {
    const dialog = /<dialog [^>]*>/.exec(html)[0];
    for (const [attribute, key] of [
      ['count', 'searchCount'],
      ['browse', 'searchBrowse'],
      ['none', 'searchNone'],
      ['section', 'searchSection'],
      ['question', 'searchQuestion'],
      ['text', 'searchText'],
    ])
      assert.ok(dialog.includes(` data-${attribute}="${key}"`), attribute);
  });

  it('has the close button, the caption, the hidden results and the status line', () => {
    assert.match(
      html,
      /class="btn btn-quiet btn-icon search-close" data-search-close aria-label="searchClose"/,
    );
    assert.match(
      html,
      /<p class="search-caption" data-search-caption aria-hidden="true"><\/p>/,
    );
    assert.match(
      html,
      /<ul class="search-results" id="pc-search-results" role="listbox" tabindex="-1" aria-label="searchResults" hidden><\/ul>/,
    );
    assert.match(
      html,
      /<p class="visually-hidden" id="pc-search-status" role="status"><\/p>/,
    );
    assert.ok(html.trimEnd().endsWith('</dialog>'));
  });

  it('ends with a line break and the indentation of the next button', () => {
    assert.match(html, /<\/dialog>\n {6}$/);
  });

  it('escapes every string it takes from the language', () => {
    const bad = '"><b>';
    const safe = renderSearch({
      ui: ui({
        search: bad,
        searchLabel: bad,
        searchResults: bad,
        searchClose: bad,
        searchCount: bad,
        searchBrowse: bad,
        searchNone: bad,
        searchSection: bad,
        searchQuestion: bad,
        searchText: bad,
      }),
    });
    assert.doesNotMatch(safe, /<b>/);
    assert.equal((safe.match(/&quot;&gt;&lt;b&gt;/g) ?? []).length, 11);
  });
});
