/**
 * The icon set. Every icon is a 24 by 24 line drawing that takes its colour
 * and size from the text around it (`currentColor`, `1.25em`; see `.icon` in
 * `src/css/10-base.css`). A page carries one inline sprite of `<symbol>`s
 * (`sprite()`, first in `<body>`) and every use is a small `<svg>` that points
 * at one symbol (`icon(name)`), so no icon is ever fetched or inlined twice.
 *
 * Add an icon: one line in `ICONS` (paths only, no `fill` or `stroke`
 * unless the shape must be filled: then `fill="currentColor" stroke="none"`).
 */
const ICONS = {
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>',
  moon: '<path d="M20 14.2A8.2 8.2 0 0 1 9.8 4a8.2 8.2 0 1 0 10.2 10.2z"/>',
  auto: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" stroke="none"/>',
  globe:
    '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.4 2.6 3.7 5.6 3.7 9s-1.3 6.4-3.7 9c-2.4-2.6-3.7-5.6-3.7-9S9.6 5.6 12 3z"/>',
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
  'arrow-up': '<path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/>',
  'arrow-right': '<path d="M5 12h14M12.5 5.5 19 12l-6.5 6.5"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  tip: '<path d="M9.2 18h5.6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.4 10.9c.6.5 1 1.2 1 2.1h4.8c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
  warning:
    '<path d="M12 4 2.9 19.6A1 1 0 0 0 3.8 21h16.4a1 1 0 0 0 .9-1.4z"/><path d="M12 10v4.5M12 17.6h.01"/>',
  note: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.7h.01"/>',
  local:
    '<path d="M12 21s-6.5-5.7-6.5-11a6.5 6.5 0 0 1 13 0c0 5.3-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  hash: '<path d="M5 9h14M5 15h14M10 4 8 20M16 4l-2 16"/>',
  question:
    '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.6 2.2c-.8.5-1.2 1-1.2 1.9M12 17h.01"/>',
  text: '<path d="M5 6.5h14M5 11.5h14M5 16.5h9"/>',
  sprout:
    '<path d="M12 21v-8"/><path d="M12 13c-4 0-6.5-2-6.5-6 4 0 6.5 2 6.5 6zM12 15c0-3.5 2.2-6 6.5-6 0 3.5-2.2 6-6.5 6z"/>',
};

/** The names of the sprite, in order. */
const ICON_NAMES = Object.keys(ICONS);

/** The id of a symbol in the sprite. */
const symbolId = (name) => `pc-i-${name}`;

/**
 * The sprite: every symbol, in one hidden `<svg id="pc-icons">`. Put it once
 * at the start of `<body>`.
 *
 * @returns {string}
 */
export const sprite = () =>
  `<svg class="pc-sprite" id="pc-icons" aria-hidden="true">${ICON_NAMES.map(
    (name) =>
      `<symbol id="${symbolId(name)}" viewBox="0 0 24 24">${ICONS[name]}</symbol>`,
  ).join('')}</svg>`;

/**
 * One icon, hidden from assistive technology: whatever it says must also be
 * said in text (a label on the button, the title next to it). The stylesheet
 * sizes it (`1.25em`); `width` and `height` are what it is without one (an
 * `<svg>` with neither is 300 by 150).
 *
 * @param {string} name One of `ICON_NAMES`.
 * @param {string} [className] Extra classes next to `icon`.
 * @returns {string}
 * @throws {Error} For a name that is not in the set.
 */
export function icon(name, className = '') {
  if (!Object.hasOwn(ICONS, name)) throw new Error(`unknown icon "${name}"`);
  return `<svg class="icon${className ? ` ${className}` : ''}" width="24" height="24" aria-hidden="true"><use href="#${symbolId(name)}"/></svg>`;
}
