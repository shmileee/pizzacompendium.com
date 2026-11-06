import nodeFs from 'node:fs';
import path from 'node:path';

/** Images are `img/<file>` under `static/`, nothing else. */
const IMG_PATH = /^img\/(?:[\w-]+\/)*[\w-]+(?:\.[\w-]+)+$/;

/** The largest image the generator reads to measure it. */
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

/**
 * @typedef {object} ResolvedImage
 * @property {true} ok
 * @property {string} href `img/x.webp`
 * @property {number} width Intrinsic size, so the browser can reserve space.
 * @property {number} height
 * @property {{ href: string, width: number }[]} variants Smaller copies named
 *   `x-480w.webp` next to the original, narrowest first.
 * @property {boolean} alpha True for a WebP with an alpha channel: a cut-out,
 *   which the stylesheet sets on a plate (see `webpHasAlpha`).
 *
 * @typedef {{ ok: false, code: string, message: string }} ImageProblem
 */

/**
 * Does a WebP carry transparency? `image-size` reads the dimensions only; the
 * extended header (`VP8X`) of a WebP has a flag byte whose bit 4 says "alpha".
 * A plain WebP (lossy or lossless without the extended header), another
 * format and a file too short to have the flag are not cut-outs.
 *
 * @param {Uint8Array} buffer
 * @returns {boolean}
 */
export const webpHasAlpha = (buffer) =>
  String.fromCharCode(...buffer.subarray(8, 16)) === 'WEBPVP8X' &&
  (buffer[20] & 0x10) !== 0;

/**
 * Looks images up under `static/` and reads their size. A lookup is exact
 * about case (GitHub Pages is case-sensitive, a Mac is not), refuses paths
 * outside `img/` and anything that is not a regular file of a sensible size
 * (a symbolic link could point at a device that never ends), and is
 * remembered, so an image used in three languages is read once.
 *
 * @param {object} options
 * @param {typeof nodeFs} [options.fs]
 * @param {string} options.staticDir
 * @param {(buffer: Uint8Array) => { width?: number, height?: number }} options.imageSize
 * @returns {{ resolve: (href: string) => ResolvedImage | ImageProblem }}
 */
export function createImageResolver({ fs = nodeFs, staticDir, imageSize }) {
  const listings = new Map();
  const results = new Map();

  /** @returns {string[]} Empty when the directory does not exist. */
  const list = (dir) => {
    if (!listings.has(dir)) {
      try {
        listings.set(dir, fs.readdirSync(dir));
      } catch {
        listings.set(dir, []);
      }
    }
    return listings.get(dir);
  };

  /** @returns {ResolvedImage | ImageProblem} */
  const lookup = (href) => {
    if (!IMG_PATH.test(href))
      return {
        ok: false,
        code: 'E_IMG_PATH',
        message: `images are written as img/<file>, not "${href}"`,
      };
    let target = staticDir;
    for (const part of href.split('/')) {
      const names = list(target);
      if (!names.includes(part)) {
        const near = names.find(
          (name) => name.toLowerCase() === part.toLowerCase(),
        );
        return near
          ? {
              ok: false,
              code: 'E_IMG_CASE',
              message: `static/${href}: the file is called "${near}" (GitHub Pages is case-sensitive)`,
            }
          : {
              ok: false,
              code: 'E_IMG_MISSING',
              message: `image not found: static/${href}`,
            };
      }
      target = path.join(target, part);
    }
    try {
      const stat = fs.lstatSync(target);
      if (!stat.isFile() || stat.size > MAX_IMAGE_BYTES)
        throw new Error('not a regular file, or larger than 20 MB');
      const bytes = fs.readFileSync(target);
      const { width, height } = imageSize(bytes);
      if (!(width > 0 && height > 0)) throw new Error('no dimensions');
      return {
        ok: true,
        href,
        width,
        height,
        variants: variants(href, width),
        alpha: webpHasAlpha(bytes),
      };
    } catch (error) {
      return {
        ok: false,
        code: 'E_IMG_UNREADABLE',
        message: `cannot read the size of static/${href}: ${error.message}`,
      };
    }
  };

  /** `x-480w.webp` next to `x.webp`, when narrower than the original. */
  const variants = (href, width) => {
    const ext = path.posix.extname(href);
    const prefix = `${path.posix.basename(href, ext)}-`;
    const suffix = `w${ext}`;
    const folder = path.posix.dirname(href);
    return list(path.join(staticDir, folder))
      .filter((name) => name.startsWith(prefix) && name.endsWith(suffix))
      .map((name) => ({
        href: `${folder}/${name}`,
        width: Number(name.slice(prefix.length, -suffix.length)),
      }))
      .filter(
        (variant) =>
          Number.isInteger(variant.width) &&
          variant.width > 0 &&
          variant.width < width,
      )
      .sort((a, b) => a.width - b.width);
  };

  return {
    resolve(href) {
      if (!results.has(href)) results.set(href, lookup(href));
      return results.get(href);
    },
  };
}

/**
 * `srcset` of a resolved image and its smaller copies, for a page one folder
 * below the site root.
 *
 * @param {{ href: string, width: number, variants: { href: string, width: number }[] }} found
 * @returns {string}
 */
export const srcsetOf = (found) =>
  [...found.variants, found]
    .map((file) => `../${file.href} ${file.width}w`)
    .join(', ');
