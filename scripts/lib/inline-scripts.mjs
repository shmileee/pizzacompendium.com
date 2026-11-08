// The only inline scripts the site has: the `js` class, the stored theme and
// the root page's language redirect. Each is a plain function, so it can be
// tested on its own, and is written into the page as its source text: the
// Content-Security-Policy allows it by the hash of exactly that text. Never
// write `</script` or `<!--` in here.

/** The key the chosen language is remembered under (`src/js/lang.js` writes it). */
export const LANG_KEY = 'pizzacompendium-lang';

/** The key the chosen theme is remembered under (`src/js/theme.js` writes it). */
export const THEME_KEY = 'pizzacompendium-theme';

/**
 * The text of an inline script that calls `fn`. `args` are JSON values;
 * `globals` are names of browser globals passed as they are. The text has
 * `\n` line endings whatever the source file has (a checkout with Windows
 * line endings must build the same page), which is also the text a browser
 * hashes.
 *
 * @param {Function} fn
 * @param {unknown[]} [args]
 * @param {string[]} [globals]
 * @returns {string}
 */
export const inlineScript = (fn, args = [], globals = []) =>
  `(${fn})(${[...args.map((arg) => JSON.stringify(arg)), ...globals].join(', ')})`.replace(
    /\r\n?/g,
    '\n',
  );

/**
 * Marks the page as scripted before it is painted, so the stylesheet can
 * style the parts that only work with JavaScript, and makes jumps instant
 * (`jump-instant`) until the page has loaded: the address the page is opened
 * at is scrolled to while it loads, long before the scripts start, and a
 * smooth scroll over the whole page would still be under way when they
 * change it. `src/js/progress.js` lets smooth scrolling back in once the page
 * has loaded.
 *
 * @param {{ documentElement: { classList: { add(name: string): void } } }} doc
 * @returns {void}
 */
export function markScripted(doc) {
  doc.documentElement.classList.add('js');
  doc.documentElement.classList.add('jump-instant');
}

/**
 * Puts the theme the reader chose on the page before it is painted, so that a
 * dark page does not flash light: `light` or `dark` becomes `data-theme` on
 * `<html>`; anything else (nothing chosen, `auto`, storage blocked) leaves the
 * colour scheme of the system in charge. (No comments inside: they would be
 * written into every page.)
 *
 * @param {string} key
 * @param {Window} win
 * @returns {void}
 */
export function applyTheme(key, win) {
  try {
    const saved = win.localStorage.getItem(key);
    if (saved === 'light' || saved === 'dark')
      win.document.documentElement.dataset.theme = saved;
  } catch {}
}

/**
 * The text of the inline script that applies the stored theme.
 *
 * @returns {string}
 */
export const themeScript = () =>
  inlineScript(applyTheme, [THEME_KEY], ['window']);

/**
 * The root page sends a visitor to a language: the one they chose before,
 * else the first of their browser languages that has a page (`pt-BR`
 * matches `pt-br`, `pt-PT` matches the only Portuguese page), else the
 * fallback. The query and the fragment come along. Storage may be blocked,
 * then the browser languages decide. (No comments inside: they would be
 * written into every page.)
 *
 * @param {string[]} codes Language folders, e.g. `pl`, `pt-BR`.
 * @param {string} fallback
 * @param {string} key
 * @param {Window} win
 * @returns {void}
 */
export function redirect(codes, fallback, key, win) {
  const lower = new Map(codes.map((code) => [code.toLowerCase(), code]));
  const match = (tag) => {
    const wanted = tag.toLowerCase();
    const base = wanted.split('-')[0];
    return (
      lower.get(wanted) ||
      lower.get(base) ||
      codes.find((code) => code.split('-')[0] === base)
    );
  };
  let pick;
  try {
    const saved = win.localStorage.getItem(key);
    if (codes.includes(saved)) pick = saved;
  } catch {}
  const { navigator, location } = win;
  for (const tag of navigator.languages || [navigator.language || '']) {
    if (!pick) pick = match(tag);
  }
  location.replace(`${pick || fallback}/${location.search}${location.hash}`);
}
