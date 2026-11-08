import { PAGE_IDS } from './html/ids.mjs';
import { parseFenceLine, parseInfo } from './markdown/container-syntax.mjs';
import { compareOutlines, outline, scan, unsupportedForms } from './parity.mjs';

// THE HARD CONTENT RULES. The engine is generic; what it forbids lives in
// content/rules.json (read by `rules.mjs`). Dependency-free: it runs from a
// commit hook without `marked`.

const codeOf = (level, id) =>
  `${level === 'error' ? 'E' : 'W'}_${id.toUpperCase().replace(/-/g, '_')}`;

/**
 * Checks every section of every language against the rules.
 *
 * What is checked, in one pass over the text (no rendering):
 *   - the Markdown is of the forms the outline reads: no fenced code
 *     (`E_CODE_BLOCK`), and none of the forms `unsupportedForms` names
 *     (`E_MARKDOWN_FORM`, with the form as the `field`);
 *   - every pattern rule of rules.json, line by line;
 *   - `::: local` blocks: `lang=` equal to the folder, a title, no headings
 *     or FAQ items inside;
 *   - every `](#id)` link must hit an id of the same language (left to the
 *     renderer by the build, which sees every link it writes: `anchors`);
 *   - for published translations: the same structure as the source section
 *     (fences, ids in order, heading levels, images, links, table rows, list
 *     items; local blocks do not count), the same ids overall, and the same
 *     `ui` keys in lang.json.
 * Drafts are checked by the pattern and anchor rules only.
 * Rule findings use the code `E_<ID>` or `W_<ID>`, such as `E_SMILEY`.
 *
 * @param {object} options
 * @param {import('./rules.mjs').RuleSet} options.rules
 * @param {import('./languages.mjs').Language[]} options.languages
 * @param {Map<string, import('./sections.mjs').LanguageContent>} options.content
 * @param {import('./diagnostics.mjs').Reporter} options.reporter
 * @param {string | null} [options.only] A section file name: check that file
 *   only (the whole-language id comparison is skipped).
 * @param {boolean} [options.anchors] Check the links to ids (the build turns
 *   it off: the renderer checks every link it writes, so each is reported
 *   once).
 * @returns {void}
 */
export function lintContent({
  rules,
  languages,
  content,
  reporter,
  only = null,
  anchors = true,
}) {
  const source = languages.find((language) => language.source);
  const sourceFiles = content.get(source.code).sections.map((s) => s.file);
  if (only && !sourceFiles.includes(only)) {
    reporter.error('E_LINT_FILE', `no section named ${only}`, {
      file: 'content',
    });
    return;
  }
  const emit = (level, id, message, where) =>
    reporter[level === 'error' ? 'error' : 'warn'](
      codeOf(level, id),
      message,
      where,
    );

  const scans = new Map();
  const scanned = (section) => {
    if (!scans.has(section.path)) {
      const shape = scan(section.text);
      scans.set(section.path, { shape, outline: outline(shape) });
    }
    return scans.get(section.path);
  };
  /** The ids a language defines (fallback sections included), and where. */
  const defined = new Map(
    languages.map((language) => {
      const ids = new Map();
      for (const section of content.get(language.code).sections)
        for (const id of scanned(section).outline.ids)
          if (!ids.has(id)) ids.set(id, section);
      return [language.code, ids];
    }),
  );

  for (const file of only ? [only] : sourceFiles) {
    const outlines = new Map();
    for (const language of languages) {
      const section = content
        .get(language.code)
        .sections.find((s) => s.file === file && !s.fallback);
      if (!section) continue;
      const { shape, outline: shapeOutline } = scanned(section);
      outlines.set(language.code, shapeOutline);
      lintForms(section, shape, reporter);
      lintLocalBlocks(language, section, shape, emit);
      lintLines(
        rules,
        language,
        section,
        shape,
        anchors ? defined.get(language.code) : null,
        emit,
      );
    }
    for (const language of languages) {
      if (
        language.source ||
        language.status !== 'published' ||
        !outlines.has(language.code)
      )
        continue;
      const section = content
        .get(language.code)
        .sections.find((s) => s.file === file);
      for (const { rule, message } of compareOutlines(
        outlines.get(source.code),
        outlines.get(language.code),
      ))
        emit('error', rule, message, { file: section.path });
    }
  }

  for (const language of languages) {
    if (language.source || language.status !== 'published') continue;
    for (const key of Object.keys(source.ui))
      if (!Object.hasOwn(language.ui, key))
        emit(
          'error',
          'lang-ui-missing',
          `ui.${key} is missing (the source language defines it)`,
          { file: language.file },
        );
    if (only) continue;
    const mine = defined.get(language.code);
    const theirs = defined.get(source.code);
    for (const [id, section] of theirs)
      if (!mine.has(id))
        emit(
          'error',
          'id-missing',
          `id "${id}" exists in ${source.code} but not here`,
          { file: `${language.folder}/${section.file}` },
        );
    for (const [id, section] of mine)
      if (!theirs.has(id))
        emit(
          'error',
          'id-extra',
          `id "${id}" does not exist in ${source.code}`,
          { file: section.path },
        );
  }
}

/** Markdown the outline cannot read, so that nothing escapes it. */
function lintForms(section, shape, reporter) {
  const found = [
    ...shape.codeStarts.map((index) => ({ index, form: 'code-block' })),
    ...unsupportedForms(shape),
  ].sort((a, b) => a.index - b.index);
  for (const { index, form } of found) {
    const where = { file: section.path, line: index + 1 };
    if (form === 'code-block')
      reporter.error(
        'E_CODE_BLOCK',
        'no code blocks: the guide has none, and the content rules cannot read one',
        where,
      );
    else
      reporter.error('E_MARKDOWN_FORM', `${FORM_HINTS[form]} (${form})`, {
        ...where,
        field: form,
      });
  }
}

/** What to write instead of each form `unsupportedForms` refuses. */
const FORM_HINTS = {
  'setext-heading':
    'a heading is written "## Title {#id}"; put a blank line before a rule (---)',
  'closing-hashes': 'a heading ends with its {#id}, not with #',
  blockquote: 'no quotes (>): use a ::: note or ::: tip block',
  'nested-structure':
    'headings, ::: blocks and tables start at the beginning of the line, outside lists',
  'plus-bullet': 'a list item starts with "- " or "* ", not "+ "',
  'paren-list': 'a numbered item is written "1. ", not "1) "',
  'stacked-list-marker': 'one list marker per line',
  'spaced-rule': 'a rule is written ---, without spaces',
  'table-without-leading-pipe':
    'every row of a table starts with |, and a blank line ends the table',
  'link-definition':
    'no reference links or link definitions: write [text](#id)',
};

function lintLocalBlocks(language, section, { structure, locals }, emit) {
  for (const block of locals) {
    const at = (index) => ({ file: section.path, line: index + 1 });
    const { attrs, title } = parseInfo(block.info);
    if (!attrs.lang)
      emit(
        'error',
        'local-block-needs-lang',
        'a local block needs lang=<code>, before the title',
        at(block.start),
      );
    else if (attrs.lang !== language.code)
      emit(
        'error',
        'local-block-wrong-language',
        `a lang=${attrs.lang} block inside the ${language.code} file`,
        at(block.start),
      );
    if (!title)
      emit(
        'error',
        'local-block-needs-title',
        'a local block needs a title',
        at(block.start),
      );
    for (let index = block.start + 1; index <= block.end; index++) {
      const fence = parseFenceLine(structure[index]);
      if (
        /^ {0,3}#{1,6}(\s|$)/.test(structure[index]) ||
        (fence?.kind === 'open' && fence.name === 'q')
      )
        emit(
          'error',
          'local-block-has-structure',
          'headings and FAQ items are not allowed inside a local block',
          at(index),
        );
    }
  }
}

/**
 * A line that starts a block of its own, so a paragraph does not run on
 * into it: a heading, a `:::` fence, a table row, a list item.
 */
const STARTS_BLOCK = /^[ \t]*(?:#{1,6}(?:[ \t]|$)|:::|\||(?:[-*]|\d+\.)[ \t])/;

/**
 * What one rule finds in a section: for each line (0-based), the matches
 * that start on it. A rule reads every line through its view; a rule that
 * reads `acrossLines` also reads each paragraph with its lines joined by a
 * space, and a match that runs over a line break counts on the line it
 * starts on.
 *
 * @returns {Map<number, Set<string>>}
 */
function findMatches(rules, rule, { lines, inLocal }) {
  const read = (line) =>
    rule.view
      ? rules.views
          .get(rule.view)
          .reduce((text, [re, to]) => text.replace(re, () => to), line)
      : line;
  const seen = lines.map((line, index) =>
    !line.trim() ||
    (rule.localExempt && inLocal[index]) ||
    rule.skip?.test(line)
      ? null
      : read(line),
  );
  const hits = new Map();
  const hit = (index, text) => {
    if (rule.allow.has(text)) return;
    if (!hits.has(index)) hits.set(index, new Set());
    hits.get(index).add(text);
  };
  const matches = (text) =>
    rule.regexps.flatMap((regexp) => [...text.matchAll(regexp)]);
  seen.forEach((text, index) => {
    if (text !== null) for (const [match] of matches(text)) hit(index, match);
  });
  if (!rule.acrossLines) return hits;
  // Paragraphs: runs of lines the rule reads, a new block ends one.
  let run = [];
  const flush = () => {
    if (run.length > 1) {
      const starts = [];
      let joined = '';
      for (const index of run) {
        starts.push(joined.length);
        joined += `${seen[index].trim()} `;
      }
      const lineAt = (offset) =>
        run[starts.findLastIndex((start) => start <= offset)];
      for (const match of matches(joined)) {
        const first = lineAt(match.index);
        if (first !== lineAt(match.index + match[0].length - 1))
          hit(first, match[0]);
      }
    }
    run = [];
  };
  seen.forEach((text, index) => {
    if (text === null || STARTS_BLOCK.test(lines[index])) flush();
    if (text !== null) run.push(index);
  });
  flush();
  return hits;
}

function lintLines(rules, language, section, shape, ids, emit) {
  const { lines, structure } = shape;
  const applied = rules.rules.filter(
    (rule) => !rule.languages || rule.languages.has(language.code),
  );
  const found = applied.map((rule) => findMatches(rules, rule, shape));
  lines.forEach((line, index) => {
    if (!line.trim()) return;
    const where = { file: section.path, line: index + 1 };
    applied.forEach((rule, at) => {
      const texts = found[at].get(index);
      if (texts)
        emit(
          rule.level,
          rule.id,
          `${rule.message}: "${[...texts].join('", "')}"`,
          where,
        );
    });
    for (const [, id] of ids
      ? structure[index].matchAll(/\]\(#([\w-]+)\)/g)
      : [])
      if (!ids.has(id) && !PAGE_IDS.includes(id))
        emit(
          'error',
          'broken-anchor',
          `the link #${id} points at nothing`,
          where,
        );
  });
}
