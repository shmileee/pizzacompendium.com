// The search dialog. On first use it reads the page's own text
// (titles, questions, paragraphs, list items, table rows) into an index and
// matches what is typed against it in the browser: no request, no data file.
// Everything down to `wantsSearch` is pure and runs in Node; `collect`,
// `option` and `init` touch the page.
import { debounce, foldText, query, queryAll } from './util.js';

const LIMIT = 10;
const SNIPPET = 150;
const FLASH_MS = 1800;
// How well a typed word matches a word of the page; `title` is a word that is
// only in the title above a hit.
const GRADE = { exact: 6, prefix: 4, stem: 2, title: 1 };
// An exact title comes first (0), then section titles, questions, body text.
const TIER = { chapter: 1, question: 2, text: 3 };
// A word: letters and digits, an apostrophe only inside (`м’ясо`, `don't`).
const WORD = /[\p{L}\p{N}\p{M}]+(?:['’‘`´][\p{L}\p{N}\p{M}]+)*/gu;
const VOWEL = /[aeiouyаеєиіїоуюя]$/;
const EMPTY = { id: '', text: '', words: [] };

/**
 * The words of a text and where they stand. A word is folded like `foldText`
 * folds and loses its apostrophes: `mąka` is `maka`, `м’ясо` is `мясо`.
 *
 * @param {string} text
 * @returns {{ start: number, end: number, word: string }[]}
 */
export function tokenize(text) {
  return [...text.matchAll(WORD)].map(({ 0: found, index }) => ({
    start: index,
    end: index + found.length,
    word: foldText(found).replaceAll("'", ''),
  }));
}

const wordsOf = (text) => tokenize(text).map(({ word }) => word);

/**
 * The start of a word that stands for its other forms: a plural `s` and one
 * final vowel go (`mąki`, `mąkę`, `mąka` share `mak`; `pizzas`, `pizza` share
 * `pizz`). It finds more, never less: the word itself still matches.
 *
 * @param {string} word A folded word.
 */
export function stem(word) {
  const one = word.length > 4 && word.endsWith('s') ? word.slice(0, -1) : word;
  return one.length > 3 && VOWEL.test(one) ? one.slice(0, -1) : one;
}

/**
 * What was typed, as the terms a hit must contain (none for a blank).
 *
 * @param {string} text
 * @returns {{ word: string, stem: string }[]}
 */
export const parseQuery = (text) =>
  wordsOf(text).map((word) => ({ word, stem: stem(word) }));

const matches = (word, terms) =>
  terms.some((term) => word.startsWith(term.stem));

/**
 * How well one term matches some of the words: the same word, a word that
 * begins with it, one that begins with its stem, or none (0).
 *
 * @param {string[]} words
 * @param {{ word: string, stem: string }} term
 */
export function grade(words, { word, stem: start }) {
  let best = 0;
  for (const candidate of words) {
    if (candidate === word) return GRADE.exact;
    if (candidate.startsWith(word)) best = GRADE.prefix;
    else if (best === 0 && candidate.startsWith(start)) best = GRADE.stem;
  }
  return best;
}

/**
 * The grade of a record for all terms. A term may be found in the title above
 * the record instead of in its own words, but not every one: a record whose
 * own words match nothing is no hit (0), and neither is one that lacks a term.
 */
function score(record, terms) {
  let total = 0;
  let own = false;
  for (const term of terms) {
    const found = grade(record.words, term);
    const above = found || (grade(record.whereWords, term) && GRADE.title);
    if (!above) return 0;
    total += above;
    own ||= found > 0;
  }
  return own ? total : 0;
}

/**
 * The records that contain every term, best first: an exact title, then
 * section titles, questions and text; within a kind the better match, then the
 * shorter text. A place appears once (a section and the text under it lead to
 * the same id).
 *
 * @param {ReturnType<typeof buildRecords>} records
 * @param {{ word: string, stem: string }[]} terms
 */
export function rank(records, terms) {
  const typed = terms.map(({ word }) => word).join(' ');
  const hits = [];
  for (const record of records) {
    const total = score(record, terms);
    if (total) {
      const exact = record.type !== 'text' && record.key === typed;
      hits.push({ record, total, tier: exact ? 0 : TIER[record.type] });
    }
  }
  hits.sort(
    (a, b) =>
      a.tier - b.tier || b.total - a.total || a.record.length - b.record.length,
  );
  const places = new Map();
  for (const { record } of hits)
    if (!places.has(record.id)) places.set(record.id, record);
  return [...places.values()].slice(0, LIMIT);
}

/**
 * The text cut into pieces, marked where a term matches a word: the page
 * builds `<mark>` elements from them.
 *
 * @param {string} text
 * @param {{ word: string, stem: string }[]} terms
 * @returns {{ text: string, mark: boolean }[]}
 */
export function segments(text, terms) {
  const pieces = [];
  let at = 0;
  for (const { start, end, word } of tokenize(text)) {
    if (!matches(word, terms)) continue;
    if (start > at) pieces.push({ text: text.slice(at, start), mark: false });
    pieces.push({ text: text.slice(start, end), mark: true });
    at = end;
  }
  if (at < text.length) pieces.push({ text: text.slice(at), mark: false });
  return pieces;
}

/**
 * A stretch of about `SNIPPET` characters that shows as many different terms
 * as it can (the earliest such stretch), cut between words, with `…` where
 * text was left out.
 *
 * @param {string} text
 * @param {{ word: string, stem: string }[]} terms
 */
export function excerpt(text, terms) {
  if (text.length <= SNIPPET) return text;
  const lead = SNIPPET / 4;
  const hits = tokenize(text).filter(({ word }) => matches(word, terms));
  let anchor = 0;
  let most = 0;
  for (const { start } of hits) {
    const kinds = new Set();
    for (const hit of hits)
      if (hit.start >= start && hit.end <= start - lead + SNIPPET)
        kinds.add(terms.findIndex((term) => hit.word.startsWith(term.stem)));
    if (kinds.size > most) {
      most = kinds.size;
      anchor = start;
    }
  }
  // A little before the first match, at the start of a word.
  const from =
    anchor > lead ? Math.min(anchor, text.indexOf(' ', anchor - lead) + 1) : 0;
  const to =
    from + SNIPPET >= text.length
      ? text.length
      : Math.max(from + SNIPPET / 2, text.lastIndexOf(' ', from + SNIPPET));
  const shown = text.slice(from, to).replace(/[\s,;:–—-]+$/, '');
  return `${from ? '…' : ''}${shown}${to < text.length ? '…' : ''}`;
}

/**
 * The records of the index, one per section title, question and block of text
 * of the page, in page order. A record knows the title it stands under
 * (`where`: a word of it counts for what is below), the element a choice
 * scrolls to and marks (`el`) and the one that takes focus (`focus`: the same,
 * except that the text of an answer leaves it to the question, whose summary
 * is always there to take it).
 *
 * @param {{
 *   kind: 'heading' | 'question' | 'text',
 *   level?: number,
 *   id?: string,
 *   el: unknown,
 *   text: string,
 *   inQuestion?: boolean,
 * }[]} entries What `collect` found, in page order; `el` is opaque here.
 */
export function buildRecords(entries) {
  const records = [];
  let chapter = EMPTY;
  let heading = EMPTY;
  let question = EMPTY;
  const add = (type, entry, above, id = entry.id, focus = entry.el) => {
    const words = wordsOf(entry.text);
    const record = {
      type,
      level: entry.level ?? 0,
      id,
      el: entry.el,
      focus,
      text: entry.text,
      where: above.text,
      whereWords: above.words,
      words,
      key: words.join(' '),
      length: entry.text.length,
    };
    records.push(record);
    return record;
  };
  for (const entry of entries) {
    if (entry.kind === 'heading') {
      heading = add('chapter', entry, entry.level === 3 ? chapter : EMPTY);
      if (entry.level === 2) chapter = heading;
    } else if (entry.kind === 'question') {
      question = add('question', entry, heading);
    } else {
      // Text above the first title leads nowhere and is left out. The text of
      // an answer is announced by its question.
      const section = entry.inQuestion ? question : heading;
      const focus = entry.inQuestion ? question.focus : entry.el;
      if (section.id) add('text', entry, section, section.id, focus);
    }
  }
  return records;
}

/**
 * What the line above the list says: the sections (nothing typed), that these
 * are the best matches (the list is cut at `LIMIT`, so no number is claimed),
 * or that there are none.
 *
 * @param {number} typed How many terms were typed.
 * @param {number} found How many results there are.
 * @param {{ browse: string, count: string, none: string }} strings
 * @returns {{ state: 'browse' | 'results' | 'none', message: string }}
 */
export function describe(typed, found, { browse, count, none }) {
  if (!typed) return { state: 'browse', message: browse };
  if (!found) return { state: 'none', message: none };
  return { state: 'results', message: count };
}

/** @param {string} platform `navigator.platform` */
export const shortcutLabel = (platform) =>
  /Mac|iPhone|iPad|iPod/.test(platform) ? '⌘K' : 'Ctrl K';

/**
 * Does the key press ask for the search: Ctrl or Cmd with K (the key by its
 * place, so every keyboard layout has it)? A bare character key is no
 * shortcut (WCAG 2.1.4).
 *
 * @param {{
 *   key: string,
 *   code: string,
 *   ctrlKey: boolean,
 *   metaKey: boolean,
 *   altKey: boolean,
 *   shiftKey: boolean,
 * }} event
 */
export function wantsSearch(event) {
  if (event.altKey) return false;
  const command = event.ctrlKey || event.metaKey;
  return event.code === 'KeyK' && command && !event.shiftKey;
}

const clean = (text) => text.replace(/\s+/g, ' ').trim();

/** A heading's title, without its permalink. */
function titleOf(heading) {
  const copy = heading.cloneNode(true);
  for (const anchor of queryAll('.hanchor', copy)) anchor.remove();
  return clean(copy.textContent);
}

/** A block's text; a table row reads cell by cell. */
const blockText = (block) =>
  clean(
    block.matches('tr')
      ? [...block.cells].map((cell) => cell.textContent).join(' · ')
      : block.textContent,
  );

const BLOCKS =
  'main h2[id], main h3[id], main details.faq[id], main p, main li, main tbody tr, main figcaption';

const CHROME = '[role="status"], .card-badge, .cards-filter';

/**
 * Reads the page: section titles, questions and every block of text that holds
 * no other block (a list item with a list in it is read item by item; a
 * paragraph with a button is a control, not text).
 *
 * @param {Document} root
 * @returns {Parameters<typeof buildRecords>[0]}
 */
export function collect(root) {
  return queryAll(BLOCKS, root).flatMap((el) => {
    if (el.matches('h2, h3'))
      return {
        kind: 'heading',
        level: Number(el.tagName[1]),
        id: el.id,
        el,
        text: titleOf(el),
      };
    if (el.matches('details')) {
      const summary = el.firstElementChild;
      return {
        kind: 'question',
        id: el.id,
        el: summary,
        text: clean(summary.textContent),
      };
    }
    // The page's own controls and notices are not guide text.
    if (el.closest(CHROME) || el.querySelector('ul, ol, p, table, button'))
      return [];
    return {
      kind: 'text',
      el,
      text: blockText(el),
      inQuestion: Boolean(el.closest('details')),
    };
  });
}

const SVG = 'http://www.w3.org/2000/svg';
const ICON = { chapter: 'hash', question: 'question', text: 'text' };

/** An element with a class and children (text, nodes). */
function make(root, tag, className, ...children) {
  const el = root.createElement(tag);
  if (className) el.className = className;
  el.append(...children);
  return el;
}

/** A line of a result: the text with its matches in `<mark>`. */
const line = (root, className, text, terms) =>
  make(
    root,
    'span',
    className,
    ...segments(text, terms).map((piece) =>
      piece.mark ? make(root, 'mark', '', piece.text) : piece.text,
    ),
  );

/** One result of the list, built from nodes: page text never becomes markup. */
function option(root, record, terms, labels, index) {
  const svg = root.createElementNS(SVG, 'svg');
  const use = root.createElementNS(SVG, 'use');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  use.setAttribute('href', `#pc-i-${ICON[record.type]}`);
  svg.append(use);
  const title =
    record.type === 'text' ? excerpt(record.text, terms) : record.text;
  const main = make(
    root,
    'span',
    'search-main',
    make(root, 'span', 'visually-hidden', `${labels[record.type]}: `),
    line(root, 'search-title', title, terms),
  );
  if (record.where)
    main.append(
      make(root, 'span', 'visually-hidden', '. '),
      line(root, 'search-where', record.where, terms),
    );
  const item = make(root, 'li', 'search-result', svg, main);
  item.id = `pc-search-opt-${index}`;
  item.setAttribute('role', 'option');
  item.setAttribute('aria-selected', 'false');
  item.dataset.type = record.type;
  item.dataset.id = record.id;
  return item;
}

/**
 * The search: the button and the keys open the dialog, the first opening
 * builds the index, typing fills the list, a choice scrolls to its place.
 *
 * @param {Document} root
 */
export function init(root = document) {
  const dialog = query('#pc-search', root);
  const input = query('#pc-search-input', root);
  const list = query('#pc-search-results', root);
  const caption = query('[data-search-caption]', root);
  const status = query('#pc-search-status', root);
  const html = root.documentElement;
  const strings = dialog.dataset;
  const labels = {
    chapter: strings.section,
    question: strings.question,
    text: strings.text,
  };
  let records = null;
  let results = [];
  let active = -1;
  let pending = null;
  const announce = debounce((text) => {
    status.textContent = text;
  }, 300);

  for (const kbd of queryAll('[data-search-kbd]', root))
    kbd.textContent = shortcutLabel(navigator.platform);

  const setActive = (next, scroll = true) => {
    list.children[active]?.setAttribute('aria-selected', 'false');
    active = next;
    const current = list.children[active];
    if (!current) {
      input.removeAttribute('aria-activedescendant');
      return;
    }
    current.setAttribute('aria-selected', 'true');
    input.setAttribute('aria-activedescendant', current.id);
    if (scroll) current.scrollIntoView({ block: 'nearest' });
  };

  const update = () => {
    const terms = parseQuery(input.value);
    results = terms.length
      ? rank(records, terms)
      : records.filter((r) => r.type === 'chapter' && r.level === 2);
    list.replaceChildren(
      ...results.map((record, index) =>
        option(root, record, terms, labels, index),
      ),
    );
    list.hidden = results.length === 0;
    input.setAttribute('aria-expanded', String(!list.hidden));
    const { state, message } = describe(terms.length, results.length, strings);
    caption.dataset.state = state;
    caption.textContent = message;
    announce(terms.length ? message : '');
    setActive(results.length ? 0 : -1);
  };

  const open = () => {
    if (dialog.open) return;
    records ??= buildRecords(collect(root));
    html.classList.add('search-open');
    update();
    dialog.showModal();
    input.select();
  };

  const choose = (index) => {
    pending = results[index];
    dialog.close();
  };

  const reveal = (record) => {
    html.classList.add('search-jump');
    for (
      let faq = record.el.closest('details');
      faq;
      faq = faq.parentElement.closest('details')
    )
      faq.open = true;
    // A block that is not drawn (a card hidden by a filter) leaves the visitor
    // at its section.
    const hidden = record.el.getClientRects().length === 0;
    const mark = hidden ? root.getElementById(record.id) : record.el;
    const focus = hidden ? mark : record.focus;
    if (location.hash !== `#${record.id}`)
      history.pushState(null, '', `#${record.id}`);
    // By hand, not scrollIntoView: an answer that is opening is clipped to
    // nothing for a moment, and a clipped element is not scrolled to. The
    // question comes along with its answer when both fit on the screen,
    // otherwise the visitor is taken to the text of the answer.
    const gap = parseFloat(getComputedStyle(html).scrollPaddingBlockStart);
    const both =
      mark.getBoundingClientRect().bottom - focus.getBoundingClientRect().top <=
      innerHeight - gap;
    const target = both ? focus : mark;
    scrollTo({
      top: target.getBoundingClientRect().top + scrollY - gap,
      behavior: 'instant',
    });
    if (target.tabIndex < 0) target.tabIndex = -1;
    target.focus({ preventScroll: true });
    html.classList.remove('search-jump');
    mark.classList.add('search-hit');
    setTimeout(() => mark.classList.remove('search-hit'), FLASH_MS);
  };

  const indexOf = (event) =>
    [...list.children].indexOf(event.target.closest('li'));

  input.addEventListener('input', update);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const by = event.key === 'ArrowDown' ? 1 : -1;
      if (results.length)
        setActive((active + by + results.length) % results.length);
    } else if (event.key === 'Enter' && active >= 0) {
      event.preventDefault();
      choose(active);
    }
  });
  // A press on the list does not take the focus from the field.
  list.addEventListener('mousedown', (event) => event.preventDefault());
  list.addEventListener('click', (event) => {
    const index = indexOf(event);
    if (index >= 0) choose(index);
  });
  list.addEventListener('pointermove', (event) => {
    const index = indexOf(event);
    if (index >= 0 && index !== active) setActive(index, false);
  });
  // The backdrop closes the dialog when the press began there too: a drag
  // that selects the text of the field and ends outside must not.
  let pressed = null;
  dialog.addEventListener('pointerdown', (event) => {
    pressed = event.target;
  });
  dialog.addEventListener('click', (event) => {
    const backdrop = event.target === dialog && pressed === dialog;
    if (backdrop || event.target.closest('[data-search-close]')) dialog.close();
  });
  dialog.addEventListener('close', () => {
    html.classList.remove('search-open');
    if (pending) reveal(pending);
    pending = null;
  });
  for (const opener of queryAll('[data-search-open]', root))
    opener.addEventListener('click', open);
  root.addEventListener('keydown', (event) => {
    if (!wantsSearch(event)) return;
    event.preventDefault();
    if (!html.classList.contains('toc-open')) open();
  });
}
