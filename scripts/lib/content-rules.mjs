import { PAGE_IDS } from './html/ids.mjs';
import { parseFenceLine, parseInfo } from './markdown/container-syntax.mjs';
import { compareOutlines, outline, scan } from './parity.mjs';

// THE HARD CONTENT RULES. The engine is generic; what it forbids lives in
// content/rules.json (read by `rules.mjs`). Dependency-free: it runs from a
// commit hook without `marked`.

const codeOf = (level, id) =>
  `${level === 'error' ? 'E' : 'W'}_${id.toUpperCase().replace(/-/g, '_')}`;

/**
 * Checks every section of every language against the rules.
 *
 * What is checked, in one pass over the text (no rendering):
 *   - every pattern rule of rules.json, line by line, outside fenced code;
 *   - `::: local` blocks: `lang=` equal to the folder, a title, no headings
 *     or FAQ items inside;
 *   - every `](#id)` link must hit an id of the same language;
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
 * @returns {void}
 */
export function lintContent({
  rules,
  languages,
  content,
  reporter,
  only = null,
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
      lintLocalBlocks(language, section, shape, emit);
      lintLines(
        rules,
        language,
        section,
        shape,
        defined.get(language.code),
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

function lintLines(
  rules,
  language,
  section,
  { lines, structure, inLocal },
  ids,
  emit,
) {
  lines.forEach((line, index) => {
    if (!line.trim()) return;
    const where = { file: section.path, line: index + 1 };
    for (const rule of rules.rules) {
      if (rule.languages && !rule.languages.has(language.code)) continue;
      if (rule.localExempt && inLocal[index]) continue;
      if (rule.skip?.test(line)) continue;
      const seen = rule.view
        ? rules.views
            .get(rule.view)
            .reduce((text, [re, to]) => text.replace(re, () => to), line)
        : line;
      const found = rule.regexps
        .flatMap((regexp) => [...seen.matchAll(regexp)])
        .map((match) => match[0])
        .filter((text) => !rule.allow.has(text));
      if (found.length > 0)
        emit(
          rule.level,
          rule.id,
          `${rule.message}: "${[...new Set(found)].join('", "')}"`,
          where,
        );
    }
    for (const [, id] of structure[index].matchAll(/\]\(#([\w-]+)\)/g))
      if (!ids.has(id) && !PAGE_IDS.includes(id))
        emit(
          'error',
          'broken-anchor',
          `the link #${id} points at nothing`,
          where,
        );
  });
}
