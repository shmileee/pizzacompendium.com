import nodeFs from 'node:fs';
import path from 'node:path';
import { buildAssets, collectStatic, storageKeyMismatches } from './assets.mjs';
import { lintContent } from './content-rules.mjs';
import { checkPages } from './csp.mjs';
import { createReporter } from './diagnostics.mjs';
import { MANIFEST_FILE, missingIcons } from './html/head.mjs';
import { heroBreakpointMismatches } from './html/hero.mjs';
import { renderNotFound } from './html/not-found.mjs';
import { renderRoot } from './html/root.mjs';
import { warnAboutTranslations } from './i18n-sync.mjs';
import { createImageResolver } from './images.mjs';
import * as inlineScripts from './inline-scripts.mjs';
import { renderLanguagePage } from './language-page.mjs';
import { published } from './languages.mjs';
import { checkOutDir, writeOutput } from './output.mjs';
import { loadProject } from './project.mjs';
import { loadRules } from './rules.mjs';
import { renderManifest, renderRobots, renderSitemap } from './seo.mjs';
import { loadSite } from './site-config.mjs';

const { inlineScript, LANG_KEY, redirect } = inlineScripts;

/** The names the inline scripts remember things under (`*_KEY` exports). */
const STORAGE_KEYS = Object.fromEntries(
  Object.entries(inlineScripts).filter(([name]) => name.endsWith('_KEY')),
);

/**
 * Builds the site into `outDir`. The output is written to `<outDir>.tmp` and
 * moved into place only when the build had no errors, so a failed build
 * leaves the previous output untouched. Everything that goes wrong is a
 * diagnostic on the reporter; nothing is printed here.
 *
 * @param {object} options
 * @param {string} options.root Repository root.
 * @param {string} [options.outDir] Relative to `root`; default `dist`.
 * @param {boolean} [options.strict] Every warning is an error.
 * @param {import('./diagnostics.mjs').Reporter} [options.reporter]
 *   Collects the diagnostics; a new one (honouring `strict`) by default.
 * @param {typeof nodeFs} [options.fs]
 * @param {(buffer: Uint8Array) => { width?: number, height?: number }} options.imageSize
 * @param {boolean} [options.fingerprint] Add `?v=<hash>` to asset URLs.
 * @returns {{
 *   ok: boolean,
 *   files: string[],
 *   languages: string[],
 *   reporter: import('./diagnostics.mjs').Reporter,
 * }} The files written (relative to `outDir`, sorted) and the codes of the
 *   languages built.
 */
export function build({
  root,
  outDir = 'dist',
  strict = false,
  reporter = createReporter({ strict }),
  fs = nodeFs,
  imageSize,
  fingerprint = true,
}) {
  const failed = { ok: false, files: [], languages: [], reporter };
  const out = path.resolve(root, outDir);
  if (!checkOutDir({ fs, root, out, reporter })) return failed;

  const site = loadSite({ fs, root, reporter });
  const project = loadProject({ fs, root, reporter });
  const rules = loadRules({ fs, root, reporter });
  if (!site || !project || !rules) return failed;
  const { languages, source, content } = project;

  const images = createImageResolver({
    fs,
    staticDir: path.join(root, 'static'),
    imageSize,
  });
  const image = images.resolve(site.ogImage);
  if (!image.ok) {
    reporter.error(image.code, image.message, { file: 'site.json' });
    return failed;
  }
  const assets = buildAssets({ fs, root, fingerprint, reporter });
  const scripts = [...assets.files]
    .filter(([file]) => file.endsWith('.js'))
    .map(([, text]) => text);
  for (const name of storageKeyMismatches(scripts, STORAGE_KEYS))
    reporter.error(
      'E_LANG_KEY',
      `no script in src/ defines ${name} as "${STORAGE_KEYS[name]}", the key inline-scripts.mjs uses`,
      { file: 'src' },
    );

  for (const query of heroBreakpointMismatches(
    assets.files.get('assets/style.css'),
  ))
    reporter.error(
      'E_HERO_BREAKPOINT',
      `no stylesheet rule uses ${query}, the width hero.mjs picks the photograph's crop by`,
      { file: 'src/css/32-hero.css' },
    );

  lintContent({ rules, languages, content, reporter });
  warnAboutTranslations({ fs, root, languages, content, reporter });

  const visible = published(languages);
  const files = new Map(assets.files);
  const pages = new Map();
  for (const lang of languages)
    pages.set(
      `${lang.code}/index.html`,
      renderLanguagePage({
        lang,
        source,
        visible,
        content: content.get(lang.code),
        site,
        images,
        image,
        assets,
        reporter,
      }),
    );
  pages.set(
    'index.html',
    renderRoot({
      site,
      source,
      languages: visible,
      assets,
      script: inlineScript(
        redirect,
        [visible.map((lang) => lang.code), source.code, LANG_KEY],
        ['window'],
      ),
      image,
    }),
  );
  pages.set(
    '404.html',
    renderNotFound({ site, source, languages: visible, assets }),
  );
  checkPages(pages, reporter);

  files.set('sitemap.xml', renderSitemap(site, visible));
  files.set('robots.txt', renderRobots(site));
  for (const lang of languages)
    files.set(`${lang.code}/${MANIFEST_FILE}`, renderManifest(site, lang));
  files.set('.nojekyll', '');
  for (const [file, html] of pages) files.set(file, html);

  const copies = collectStatic({ fs, root, reporter });
  for (const { to } of copies)
    if (files.has(to))
      reporter.error(
        'E_STATIC_CONFLICT',
        `static/${to} would replace a generated file`,
        {
          file: `static/${to}`,
        },
      );

  for (const icon of missingIcons(copies.map(({ to }) => to)))
    reporter.error(
      'E_STATIC_ICON',
      `static/${icon} is missing: the page head or the manifest names it`,
      { file: `static/${icon}` },
    );

  if (reporter.hasErrors()) return failed;
  const ok = writeOutput({ fs, out, files, copies, reporter });
  return {
    ok,
    files: ok ? [...files.keys(), ...copies.map(({ to }) => to)].sort() : [],
    languages: languages.map((lang) => lang.code),
    reporter,
  };
}
