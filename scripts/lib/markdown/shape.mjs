/**
 * The shape of a picture, by its proportions, so that the stylesheet can give
 * a portrait packshot less width than a landscape photograph.
 *
 * @param {number} width
 * @param {number} height
 * @returns {'portrait' | 'square' | 'landscape' | 'wide'}
 */
export function shapeOf(width, height) {
  const ratio = width / height;
  if (ratio < 0.9) return 'portrait';
  if (ratio <= 1.15) return 'square';
  return ratio <= 1.7 ? 'landscape' : 'wide';
}

/**
 * A picture narrower than this (in pixels) is a small source: the stylesheet
 * keeps it to 25 rem, where a 2x screen shows it at about 1.25 times its size
 * (at the reading width of 35 rem it would be 1.7 times).
 */
export const SMALL_IMAGE_WIDTH = 700;

/**
 * The classes of a `<figure>` that holds this picture: `photo`, its shape,
 * `photo-cutout` for a picture with an alpha channel (the stylesheet sets it
 * on a plate, so that it reads in dark mode too) and `photo-small` for a
 * small source.
 *
 * @param {{ width: number, height: number, alpha: boolean }} image
 * @returns {string}
 */
export const figureClass = ({ width, height, alpha }) =>
  [
    'photo',
    `photo-${shapeOf(width, height)}`,
    alpha && 'photo-cutout',
    width < SMALL_IMAGE_WIDTH && 'photo-small',
  ]
    .filter(Boolean)
    .join(' ');
