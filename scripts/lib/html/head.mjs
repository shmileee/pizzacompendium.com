import { cspMeta } from '../csp.mjs';
import { escapeHtml } from './escape.mjs';

const VIEWPORT =
  '<meta name="viewport" content="width=device-width, initial-scale=1">';

/**
 * `<head>` from its lines, in order. Falsy lines are skipped. The charset and
 * the policy always come first: the policy only governs what follows it.
 *
 * @param {object} options
 * @param {string[]} options.scripts The exact text of the inline scripts.
 * @param {(string | false)[]} options.lines
 * @returns {string}
 */
export function renderHead({ scripts, lines }) {
  const all = [
    '<meta charset="utf-8">',
    cspMeta(scripts),
    VIEWPORT,
    ...lines,
    ...scripts.map((text) => `<script>${text}</script>`),
  ];
  return `<head>\n${all.filter(Boolean).join('\n')}\n</head>`;
}

export const NOINDEX = '<meta name="robots" content="noindex">';
export const COLOR_SCHEME = '<meta name="color-scheme" content="light dark">';

/**
 * The language alternates every published page lists, `x-default` being the
 * root page that chooses a language.
 *
 * @param {{ siteUrl: string }} site
 * @param {import('../languages.mjs').Language[]} languages Published ones.
 * @returns {string}
 */
export const alternates = (site, languages) =>
  [
    ...languages.map(
      (lang) =>
        `<link rel="alternate" hreflang="${lang.htmlLang}" href="${site.siteUrl}/${lang.code}/">`,
    ),
    `<link rel="alternate" hreflang="x-default" href="${site.siteUrl}/">`,
  ].join('\n');

/**
 * The preview image and the Twitter card that shows it.
 *
 * @param {{ siteUrl: string }} site
 * @param {{ href: string, width: number, height: number }} image
 * @param {string} alt
 * @returns {string[]}
 */
export const socialImage = (site, image, alt) => [
  `<meta property="og:image" content="${site.siteUrl}/${image.href}">`,
  `<meta property="og:image:width" content="${image.width}">`,
  `<meta property="og:image:height" content="${image.height}">`,
  `<meta property="og:image:alt" content="${escapeHtml(alt)}">`,
  '<meta name="twitter:card" content="summary_large_image">',
  `<meta name="twitter:image:alt" content="${escapeHtml(alt)}">`,
];

/**
 * @param {{ themeColors: { content: string, media?: string }[] }} site
 * @returns {string[]}
 */
export const themeColor = (site) =>
  site.themeColors.map(
    ({ content, media }) =>
      `<meta name="theme-color" content="${content}"${media ? ` media="${media}"` : ''}>`,
  );

/**
 * The icons the web app manifest lists, as files of `static/` (the paths are
 * relative to the manifest; `renderManifest` adds the way up to the root).
 */
export const MANIFEST_ICONS = [
  { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
  { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
  {
    src: 'icon-maskable-512.png',
    sizes: '512x512',
    type: 'image/png',
    purpose: 'maskable',
  },
];

/** The files of `static/` that the page head and the manifest name. */
export const STATIC_ICONS = [
  'favicon-32.png',
  'apple-touch-icon.png',
  ...MANIFEST_ICONS.map((icon) => icon.src),
];

/**
 * @param {string[]} files The files `static/` puts into the site, relative to
 *   its root.
 * @returns {string[]} The icons the head and the manifest name that are not
 *   among them.
 */
export const missingIcons = (files) =>
  STATIC_ICONS.filter((icon) => !files.includes(icon));

/**
 * The icon of the browser tab (the SVG that `src/favicon.svg` becomes, a PNG
 * for browsers that do not draw it) and of a shortcut on a home screen.
 *
 * @param {string} prefix The way to the site's root from the page: `../`
 *   from a language page, nothing from the root page, the site's path from
 *   the 404 page.
 * @returns {string[]}
 */
export const iconLinks = (prefix) => [
  `<link rel="icon" href="${prefix}favicon.svg" type="image/svg+xml">`,
  `<link rel="icon" href="${prefix}favicon-32.png" sizes="32x32" type="image/png">`,
  `<link rel="apple-touch-icon" href="${prefix}apple-touch-icon.png">`,
];

/** Where a language's web app manifest is, inside that language's folder. */
export const MANIFEST_FILE = 'manifest.webmanifest';

/** @returns {string} The link a language page makes to its own manifest. */
export const manifestLink = () =>
  `<link rel="manifest" href="${MANIFEST_FILE}">`;
