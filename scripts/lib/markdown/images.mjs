import { escapeHtml } from '../html/escape.mjs';
import { srcsetOf } from '../images.mjs';
import { figureClass } from './shape.mjs';

// `sizes` for the `srcset` an image gets when smaller copies exist. A gallery
// is two columns from 561 px (one below), at most 50 rem wide: a figure is
// 394 px at the widest, (100vw - 3rem) / 2 beside the contents, and the page
// width less its gutters (16 to 32 px each side) when stacked.
const SIZES = {
  figure: '(min-width: 640px) 560px, calc(100vw - 2.5rem)',
  gallery:
    '(min-width: 800px) 394px, (min-width: 561px) calc((100vw - 3rem) / 2), calc(100vw - 2rem)',
  card: '96px',
};

/**
 * The `<img>` of a resolved image: lazy, with its size, and with a `srcset`
 * when smaller copies exist.
 *
 * @param {any} found A successful `images.resolve` result.
 * @param {string} alt
 * @param {keyof typeof SIZES} kind Where it is shown (decides `sizes`).
 * @returns {string}
 */
export function imageTag(found, alt, kind) {
  const srcset =
    found.variants.length > 0
      ? ` srcset="${srcsetOf(found)}" sizes="${SIZES[kind]}"`
      : '';
  return `<img src="../${found.href}"${srcset} alt="${escapeHtml(alt)}" loading="lazy" decoding="async" width="${found.width}" height="${found.height}">`;
}

/**
 * A `<figure>` around an image tag (already rendered; empty when the file is
 * missing) and an optional caption (already rendered inline HTML).
 *
 * @param {any} found Result of `images.resolve`, successful or not.
 * @param {string} img
 * @param {string} caption
 * @returns {string}
 */
export function figureTag(found, img, caption) {
  const classes = found.ok ? figureClass(found) : 'photo';
  const text = caption ? `<figcaption>${caption}</figcaption>` : '';
  return `<figure class="${classes}">${img}${text}</figure>\n`;
}
