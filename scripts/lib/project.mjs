import nodeFs from 'node:fs';
import { lintContent } from './content-rules.mjs';
import { loadLanguages } from './languages.mjs';
import { loadRules } from './rules.mjs';
import { loadSections } from './sections.mjs';

// What every command that reads the content starts from. Dependency-free,
// like the linter: `lint-content`, `i18n` and `new-language` run without the
// npm packages.

/**
 * The languages and the text of every section.
 *
 * @param {object} options
 * @param {typeof nodeFs} [options.fs]
 * @param {string} options.root
 * @param {import('./diagnostics.mjs').Reporter} options.reporter
 * @returns {{
 *   languages: import('./languages.mjs').Language[],
 *   source: import('./languages.mjs').Language,
 *   content: Map<string, import('./sections.mjs').LanguageContent>,
 * } | null} Null after reporting.
 */
export function loadProject({ fs = nodeFs, root, reporter }) {
  const loaded = loadLanguages({ fs, root, reporter });
  if (!loaded) return null;
  const content = loadSections({
    fs,
    root,
    languages: loaded.languages,
    reporter,
  });
  return content ? { ...loaded, content } : null;
}

/**
 * The hard content rules over the whole of `content/`, without building
 * anything: `mise run content:lint`, the commit hook and the build.
 *
 * @param {object} options
 * @param {typeof nodeFs} [options.fs]
 * @param {string} options.root
 * @param {import('./diagnostics.mjs').Reporter} options.reporter
 * @param {string | null} [options.only] A section file name: check just it.
 * @returns {void}
 */
export function lintProject({ fs = nodeFs, root, reporter, only = null }) {
  const project = loadProject({ fs, root, reporter });
  const rules = loadRules({ fs, root, reporter });
  if (project && rules)
    lintContent({
      rules,
      languages: project.languages,
      content: project.content,
      reporter,
      only,
    });
}
