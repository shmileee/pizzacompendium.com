import { createHash } from 'node:crypto';
import nodeFs from 'node:fs';
import path from 'node:path';
import { readDir } from './files.mjs';

const CSS_PATH = 'assets/style.css';
const JS_PATH = 'assets/app.js';
const FAVICON_PATH = 'favicon.svg';

/**
 * The fonts a page preloads (`static/fonts/`, declared in `src/css/05-fonts.css`),
 * each for the script it draws: a page starts the file its title needs, the
 * rest are fetched when the text asks for them.
 */
const PRELOADED_FONTS = [
  { path: 'fonts/vollkorn-latin.woff2', script: /\p{Script=Latin}/u },
  { path: 'fonts/vollkorn-cyrillic.woff2', script: /\p{Script=Cyrillic}/u },
];

/**
 * @param {string} text The title of a page.
 * @returns {string[]} The paths (in `dist/`) of the fonts it should preload.
 */
export const fontsFor = (text) =>
  PRELOADED_FONTS.filter(({ script }) => script.test(text)).map(
    ({ path: file }) => file,
  );

/**
 * The storage keys that the inline scripts of `inline-scripts.mjs` and the
 * client code both use: a script that remembers a choice under another name
 * than the one the page reads is a silent bug, so some script of `src/` must
 * define each key as the same text (`LANG_KEY = 'pizzacompendium-lang'`).
 *
 * @param {string[]} scripts The text of every script of the site.
 * @param {Record<string, string>} keys Name and value of every key.
 * @returns {string[]} The names that no script defines with that value.
 */
export const storageKeyMismatches = (scripts, keys) =>
  Object.entries(keys)
    .filter(
      ([name, value]) =>
        !scripts.some((text) =>
          ["'", '"'].some((quote) =>
            text.includes(`${name} = ${quote}${value}${quote}`),
          ),
        ),
    )
    .map(([name]) => name);

/**
 * @typedef {{ path: string, v: string | null }} Asset The path in `dist/` and
 *   its fingerprint (null when fingerprinting is off).
 */

/**
 * The URL of an asset from a page, with the cache-busting fingerprint.
 *
 * @param {string} prefix `../` from a language page, `` from the root.
 * @param {Asset} asset
 * @returns {string}
 */
export const assetUrl = (prefix, asset) =>
  `${prefix}${asset.path}${asset.v ? `?v=${asset.v}` : ''}`;

/** Dotfiles and OS or editor leftovers: never content, never published. */
const isJunk = (name) =>
  name.startsWith('.') ||
  name === 'Thumbs.db' ||
  name === 'desktop.ini' ||
  name.endsWith('~');

/**
 * What `static/` may hold: pictures, fonts, the licence text that goes with
 * them, a web app manifest and the `CNAME` file. Nothing a browser would
 * execute when it is opened (`.html`, `.svg`, `.js`): a page served from
 * `static/` would run on the site's own origin, outside the page policy.
 * `src/favicon.svg` is the one SVG, and it is only ever loaded as an image.
 */
const STATIC_TYPE =
  /(?:^|\/)CNAME$|\.(?:webp|avif|png|jpe?g|gif|ico|woff2|txt|webmanifest)$/i;

/**
 * Every regular file below `rel`, as paths relative to it. Dotfiles and OS or
 * editor junk are skipped; a symbolic link (the Pages artifact would publish
 * whatever it points at) or anything else that is not a file or a folder is
 * an error, and so is a `rel` that is itself a link.
 *
 * @param {object} options
 * @param {typeof nodeFs} options.fs
 * @param {string} options.root
 * @param {string} options.rel `static` or `src`
 * @param {import('./diagnostics.mjs').Reporter} options.reporter
 * @returns {string[]}
 */
function walk({ fs, root, rel, reporter }, inside = '') {
  const entries = readDir({
    fs,
    root,
    rel: path.posix.join(rel, inside),
    reporter,
  });
  const files = [];
  for (const entry of entries ?? []) {
    const name = path.posix.join(inside, entry.name);
    if (isJunk(entry.name)) continue;
    if (entry.isSymbolicLink()) {
      reporter.error('E_SYMLINK', 'symbolic links are not allowed', {
        file: path.posix.join(rel, name),
      });
    } else if (entry.isDirectory()) {
      files.push(...walk({ fs, root, rel, reporter }, name));
    } else if (entry.isFile()) {
      files.push(name);
    } else {
      reporter.error('E_NOT_REGULAR', 'only files and folders are allowed', {
        file: path.posix.join(rel, name),
      });
    }
  }
  return files;
}

/**
 * What `static/` puts into `dist/`, as it is: the files of a type that
 * `STATIC_TYPE` allows.
 *
 * @param {Omit<Parameters<typeof walk>[0], 'rel'>} options
 * @returns {{ from: string, to: string }[]}
 */
export function collectStatic({ fs = nodeFs, root, reporter }) {
  const files = walk({ fs, root, rel: 'static', reporter });
  for (const file of files)
    if (!STATIC_TYPE.test(file))
      reporter.error(
        'E_STATIC_TYPE',
        "static/ holds pictures, fonts, text and a manifest only (an HTML page, a script or an SVG would run on the site's own origin)",
        { file: `static/${file}` },
      );
  return files.map((file) => ({
    from: path.join(root, 'static', file),
    to: file,
  }));
}

const sha256 = (content) =>
  createHash('sha256').update(content).digest('hex').slice(0, 8);

/**
 * Appends the fingerprint to the relative imports of a script, so that a
 * changed module is fetched again (a query on the entry script is not
 * inherited by the modules it imports). Static imports and `import('...')` with a plain string.
 *
 * @param {string} source
 * @param {string} version
 */
const fingerprintImports = (source, version) =>
  source.replace(
    /(\b(?:import|export)\b[^'";]*?\bfrom\s*|\bimport\s*\(?\s*)(['"])(\.{1,2}\/[^'"]+)\2/g,
    `$1$2$3?v=${version}$2`,
  );

/**
 * The client assets: every `src/**\/*.css` concatenated into one stylesheet
 * (in the order of the file names), every `src/**\/*.js` copied under
 * `assets/` with its path (`app.js` is the entry, the others are the modules
 * it imports) and the favicon. With `fingerprint` the pages ask for
 * `?v=<hash of the content>`.
 *
 * @param {object} options
 * @param {typeof nodeFs} [options.fs]
 * @param {string} options.root
 * @param {boolean} options.fingerprint
 * @param {import('./diagnostics.mjs').Reporter} options.reporter
 * @returns {{
 *   files: Map<string, string | Buffer>,
 *   css: Asset,
 *   js: Asset,
 *   modules: Asset[],
 * }} `js` is the entry script, `modules` every other script (a page
 *   preloads them, so that the entry does not fetch them one after another).
 */
export function buildAssets({ fs = nodeFs, root, fingerprint, reporter }) {
  const files = new Map();
  const sources = walk({ fs, root, rel: 'src', reporter });
  const read = (file, encoding) => {
    try {
      return fs.readFileSync(path.join(root, 'src', file), encoding);
    } catch (error) {
      reporter.error('E_READ', `cannot read src/${file}: ${error.code}`, {
        file: `src/${file}`,
      });
      return '';
    }
  };
  const version = (content) => (fingerprint ? sha256(content) : null);

  const stylesheets = sources.filter((file) => file.endsWith('.css'));
  const css = stylesheets.map((file) => read(file, 'utf8')).join('\n');
  files.set(CSS_PATH, css);

  const scripts = sources.filter((file) => file.endsWith('.js'));
  const originals = scripts.map((file) => read(file, 'utf8'));
  const jsVersion = version(originals.join(''));
  scripts.forEach((file, index) => {
    files.set(
      `assets/${file}`,
      jsVersion
        ? fingerprintImports(originals[index], jsVersion)
        : originals[index],
    );
  });

  for (const [needed, found] of [
    ['a stylesheet (src/*.css)', stylesheets.length > 0],
    ['the entry script src/app.js', scripts.includes('app.js')],
    ['src/favicon.svg', sources.includes('favicon.svg')],
  ])
    if (!found) reporter.error('E_ASSET', `missing ${needed}`, { file: 'src' });
  if (sources.includes('favicon.svg'))
    files.set(FAVICON_PATH, read('favicon.svg'));

  return {
    files,
    css: { path: CSS_PATH, v: version(css) },
    js: { path: JS_PATH, v: jsVersion },
    modules: scripts
      .filter((file) => file !== 'app.js')
      .map((file) => ({ path: `assets/${file}`, v: jsVersion })),
  };
}
