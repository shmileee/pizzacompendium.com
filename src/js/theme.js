// The theme button: auto, light, dark, auto, remembered. The
// page is coloured by `data-theme` on <html> (absent: the system decides);
// the inline script of the head applies the remembered choice before the
// first paint, this module changes it when the button is pressed.
import { query, queryAll, storage, THEME_KEY } from './util.js';

/** The modes, in the order the button goes through them. */
export const MODES = ['auto', 'light', 'dark'];

/**
 * @param {string} mode
 * @returns {string} The mode the next press of the button switches to.
 */
export const nextMode = (mode) =>
  MODES[(MODES.indexOf(mode) + 1) % MODES.length];

/**
 * The colour of the bars the browser draws around the page (the address bar
 * of a phone): the page's own pair follows the system, so a mode the reader
 * chose against the system needs the colour of that mode in both.
 *
 * @param {string} mode
 * @param {string} own The colour the page declared for this bar.
 * @param {{ light: string, dark: string }} colours The page's two colours.
 * @returns {string}
 */
export const barColour = (mode, own, colours) =>
  mode === 'auto' ? own : colours[mode];

/**
 * Wires the theme button and puts the saved choice on the page.
 *
 * @param {Document} [root]
 */
export function init(root = document) {
  const html = root.documentElement;
  const bars = queryAll('meta[name="theme-color"][media]', root).map(
    (meta) => ({
      meta,
      scheme: meta.media.includes('dark') ? 'dark' : 'light',
      own: meta.content,
    }),
  );
  const colours = Object.fromEntries(bars.map((bar) => [bar.scheme, bar.own]));

  const apply = (mode) => {
    if (mode === 'auto') delete html.dataset.theme;
    else html.dataset.theme = mode;
    for (const bar of bars)
      bar.meta.content = barColour(mode, bar.own, colours);
  };

  apply(html.dataset.theme ?? 'auto');
  const status = query('#pc-theme-status', root);
  query('#pc-theme', root).addEventListener('click', () => {
    const mode = nextMode(html.dataset.theme ?? 'auto');
    apply(mode);
    status.textContent = query(
      `.visually-hidden.theme-${mode}`,
      root,
    ).textContent;
    storage.set(THEME_KEY, mode);
  });
}
