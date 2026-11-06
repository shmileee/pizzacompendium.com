import nodeFs from 'node:fs';
import path from 'node:path';
import { exists } from './files.mjs';
import { LANG_CODE, RESERVED_CODES } from './languages.mjs';
import { withoutLocalBlocks } from './parity.mjs';
import { loadProject } from './project.mjs';

/**
 * Starts a language as a draft: a copy of the source language's sections and
 * lang.json under `content/<code>/`, built into `dist/<code>/` with
 * `noindex` but left out of the picker, hreflang, the sitemap and the root
 * redirect until `"status": "published"`. The source's `::: local` blocks are
 * not copied: they are notes for its own country. The folder is assembled
 * next to its final place and renamed, so a failure never leaves half a
 * language.
 *
 * @param {object} options
 * @param {typeof nodeFs} [options.fs]
 * @param {string} options.root
 * @param {string} options.code e.g. `de` or `pt-BR`
 * @param {string} options.name The language's name in itself, e.g. `Deutsch`.
 * @param {import('./diagnostics.mjs').Reporter} options.reporter
 * @returns {{ files: string[], source: import('./languages.mjs').Language } | null}
 *   Null after reporting.
 */
export function scaffoldLanguage({ fs = nodeFs, root, code, name, reporter }) {
  const label = name.trim();
  if (!LANG_CODE.test(code) || RESERVED_CODES.has(code)) {
    reporter.error(
      'E_LANG_CODE',
      `"${code}" is not a language code such as "de" or "pt-BR"`,
    );
    return null;
  }
  if (!label) {
    reporter.error('E_LANG_NAME', 'the language needs a name, e.g. "Deutsch"');
    return null;
  }
  const project = loadProject({ fs, root, reporter });
  if (!project || reporter.hasErrors()) return null;
  const { languages, source, content } = project;
  const target = path.join(root, 'content', code);
  if (
    languages.some((lang) => lang.code.toLowerCase() === code.toLowerCase()) ||
    exists(fs, target)
  ) {
    reporter.error('E_LANG_EXISTS', `content/${code} already exists`);
    return null;
  }

  const meta = {
    code,
    name: label,
    htmlLang: code,
    order: Math.max(...languages.map((lang) => lang.order)) + 1,
    status: 'draft',
    title: source.title,
    description: source.description,
    ...(source.ogImageAlt && { ogImageAlt: source.ogImageAlt }),
    ui: source.ui,
  };
  const sections = content.get(source.code).sections;
  const temp = path.join(root, 'content', `.new-${code}`);
  try {
    fs.rmSync(temp, { recursive: true, force: true });
    fs.mkdirSync(temp);
    for (const { file, text } of sections)
      fs.writeFileSync(path.join(temp, file), withoutLocalBlocks(text));
    fs.writeFileSync(
      path.join(temp, 'lang.json'),
      `${JSON.stringify(meta, null, 2)}\n`,
    );
    fs.renameSync(temp, target);
  } catch (error) {
    fs.rmSync(temp, { recursive: true, force: true });
    reporter.error('E_WRITE', `cannot create content/${code}: ${error.code}`);
    return null;
  }
  return { files: [...sections.map((s) => s.file), 'lang.json'], source };
}

/**
 * What to do after `scaffoldLanguage`.
 *
 * @param {string} code
 * @param {import('./languages.mjs').Language} source
 * @returns {string}
 */
export const nextSteps = (
  code,
  source,
) => `Created content/${code}/ as a draft, a copy of ${source.name} (${source.code}).
Next steps:
  1. edit content/${code}/lang.json: name, title, description, the ui strings
     (add "ogLocale", e.g. "de_DE", before you publish it if the code is not a
     plain language, and "dir": "rtl" for a right-to-left language)
  2. translate content/${code}/*.md (see TRANSLATING.md; keep the {#ids} and ::: blocks)
  3. mise run serve to read it at /${code}/, mise run i18n:status to see what is left
  4. when every file is translated, set "status": "published" in lang.json,
     then mise run i18n:sync ${code} to record that the files match ${source.code}
A draft is built but stays out of the language picker, hreflang, the sitemap
and search engines (noindex); untranslated files show the ${source.code} text.`;
