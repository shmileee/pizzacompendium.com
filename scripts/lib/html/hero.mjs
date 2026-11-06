import { srcsetOf } from '../images.mjs';
import { createTypography } from '../markdown/typography.mjs';
import { escapeHtml } from './escape.mjs';
import { icon } from './icons.mjs';

/** The photographs of the hero (`static/img/`): wide, and cut 4:3. */
export const HERO_WIDE = 'img/hero.webp';
export const HERO_SQUARE = 'img/hero-mobile.webp';

/**
 * The ids of the content that the two buttons lead to: the quick start (a
 * chapter of `00-intro.md`) and the FAQ.
 */
export const HERO_TARGETS = { start: 'quick-start', faq: 'faq' };

/**
 * The widths of the screen at which the layout of `src/css/32-hero.css`
 * changes. Up to `PHONE_MAX` the photograph is as wide as the screen and cut
 * 4:3; up to `SPLIT_MIN` it is as wide as the screen and wide; from
 * `SPLIT_MIN` the text and the photograph stand side by side and the 4:3 cut
 * comes back, as tall as the text beside it.
 */
export const PHONE_MAX = 640;
export const SPLIT_MIN = 960;

/**
 * `src/css/32-hero.css` spells the two widths itself; a change in one place
 * only would show the wrong crop of the photograph.
 *
 * @param {string} css The stylesheet of the site.
 * @returns {string[]} The media queries the stylesheet does not contain.
 */
export const heroBreakpointMismatches = (css) =>
  [`(width > ${PHONE_MAX}px)`, `(width >= ${SPLIT_MIN}px)`].filter(
    (query) => !css.includes(`@media ${query}`),
  );

/** How wide the 4:3 photograph is, by the width of the screen. */
const SIZES_SQUARE = `(min-width: 1152px) 608px, (min-width: ${SPLIT_MIN}px) 52vw, 100vw`;

/**
 * The photograph of the hero: a `<picture>` that gives a phone and a wide
 * screen the 4:3 cut and a tablet the wide one. It is the first thing on the
 * page, so it is not lazy but asked for first (`fetchpriority`), and every
 * part has its size, so that nothing moves when it arrives. A missing file is
 * a diagnostic and the hero goes without it.
 *
 * @param {object} options
 * @param {{ resolve: (href: string) => any }} options.images
 * @param {import('../diagnostics.mjs').Reporter} options.reporter
 * @param {string} options.alt
 * @param {string} options.page The page it is for (`pl`), named in a
 *   diagnostic: every language page has a hero.
 * @returns {string} Empty when a file is missing.
 */
export function heroPicture({ images, reporter, alt, page }) {
  const wide = images.resolve(HERO_WIDE);
  const square = images.resolve(HERO_SQUARE);
  const missing = [wide, square].filter((found) => !found.ok);
  for (const found of missing)
    reporter.error(found.code, `hero of the ${page} page: ${found.message}`, {
      file: 'scripts/lib/html/hero.mjs',
    });
  if (missing.length > 0) return '';
  return `<picture class="hero-media"><source media="(max-width: ${PHONE_MAX}px), (min-width: ${SPLIT_MIN}px)" srcset="${srcsetOf(square)}" sizes="${SIZES_SQUARE}" width="${square.width}" height="${square.height}"><img src="../${wide.href}" srcset="${srcsetOf(wide)}" sizes="100vw" width="${wide.width}" height="${wide.height}" alt="${escapeHtml(alt)}" fetchpriority="high" loading="eager" decoding="async"></picture>`;
}

/**
 * The top of the page: the photograph, the title (the one `<h1>` of the
 * page), a lead (the description of the language) and two buttons, one to the
 * quick start and one to the FAQ. The page puts it in a band as wide as the
 * page, at the top of `<main>`, and leaves out its own title.
 *
 * @param {object} model The same model as `renderPage`.
 * @param {import('../languages.mjs').Language} model.lang
 * @param {Record<string, string>} model.ui
 * @param {{ resolve: (href: string) => any }} model.images
 * @param {import('../diagnostics.mjs').Reporter} model.reporter
 * @param {{ id: string }[]} [model.toc] The headings of the page: a button
 *   whose target is not among them is E_HERO_TARGET.
 * @returns {string}
 */
export function renderHero({ lang, ui, images, reporter, toc = [] }) {
  const typography = createTypography(lang.typography);
  const ids = new Set(toc.map((entry) => entry.id));
  for (const target of Object.values(HERO_TARGETS))
    if (!ids.has(target))
      reporter.error(
        'E_HERO_TARGET',
        `hero of the ${lang.code} page: a button leads to #${target}, which no heading has`,
        { file: 'scripts/lib/html/hero.mjs' },
      );
  const picture = heroPicture({
    images,
    reporter,
    alt: ui.heroAlt,
    page: lang.code,
  });
  return `<div class="hero" id="pc-hero">
      <div class="hero-inner">
        ${picture}
        <div class="hero-text">
          <h1>${escapeHtml(lang.title)}</h1>
          <p class="hero-lead">${typography(escapeHtml(lang.description))}</p>
          <div class="hero-actions">
            <a class="btn btn-primary" href="#${HERO_TARGETS.start}">${escapeHtml(ui.heroStart)}${icon('arrow-right')}</a>
            <a class="btn" href="#${HERO_TARGETS.faq}">${escapeHtml(ui.heroFaq)}</a>
          </div>
        </div>
      </div>
    </div>`;
}
