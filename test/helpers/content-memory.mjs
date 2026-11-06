// A compendium in memory, for the tests of the content rules: the languages
// and the sections as `lintContent` and `sectionStates` take them, with no
// files and no build. `memory({ pl: {...}, en: {...} })`.

import { compileRules } from '../../scripts/lib/rules.mjs';
import { rulesJson } from './repo.mjs';

/**
 * @param {Record<string, { source?: boolean, status?: string, ui?: object,
 *   files?: Record<string, string>, extra?: string[] }>} spec Language code ->
 *   its files (a file the source has and the language lacks is a fallback
 *   section: it shows the source text). The source is the first language
 *   unless one says `source: true`.
 * @returns {{ languages: any[], content: Map<string, any> }}
 */
export function memory(spec) {
  const codes = Object.keys(spec);
  const sourceCode = codes.find((code) => spec[code].source) ?? codes[0];
  const sourceFiles = spec[sourceCode].files ?? {};
  const languages = codes.map((code, index) => ({
    code,
    name: code,
    folder: `content/${code}`,
    file: `content/${code}/lang.json`,
    order: index + 1,
    source: code === sourceCode,
    status:
      spec[code].status ?? (code === sourceCode ? 'published' : 'published'),
    ui: spec[code].ui ?? { a: 'a' },
  }));
  const content = new Map();
  for (const code of codes) {
    const own = spec[code].files ?? {};
    const folder = `content/${code}`;
    content.set(code, {
      sections: Object.keys(sourceFiles).map((file) => {
        const fallback = !Object.hasOwn(own, file);
        return {
          file,
          path: `${fallback ? `content/${sourceCode}` : folder}/${file}`,
          text: fallback ? sourceFiles[file] : own[file],
          fallback,
        };
      }),
      extra: spec[code].extra ?? [],
    });
  }
  return { languages, content };
}

/** The small default rules, compiled. */
export const defaultRules = () => compileRules(rulesJson()).set;

/** One heading with the id `intro`, then `body`. */
export const section = (body) => `## Intro {#intro}\n\n${body}\n`;
