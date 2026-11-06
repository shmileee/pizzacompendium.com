// Derived images of the site: `mise run images`.
//
// WHAT IT WRITES (and only this)
//   static/img/<name>-480w.webp, <name>-800w.webp   smaller copies of a photo;
//       the build turns them into `srcset` (scripts/lib/images.mjs). A photo
//       wider than 700 px gets the 480w copy, one that is 1000 px or more the
//       800w copy as well. Cards, tiles and anything narrower get none.
//   static/img/og.jpg                                the 1200x630 social card,
//       a copy of the hero (static/img/hero.webp, same 1.905:1 shape)
//   static/icon-192.png, icon-512.png, icon-maskable-512.png,
//   apple-touch-icon.png, favicon-32.png, favicon.ico
//       the app icons, drawn from src/favicon.svg
//
// WHAT IT POINTS OUT (and does not change)
//   A `note:` line that lists every master (a photo or og.jpg) which no
//   section, no generator module, no stylesheet and not site.json names:
//   usually a picture that is ready and waits to be used, now and then one a
//   rewrite left behind. It is a note, not an error: the exit code stays 0.
//
// WHAT IT CANNOT DO
//   The photographs themselves were cropped, retouched and cut out once, by
//   hand, from the pictures of the source document, which are not in the
//   repository. The files in static/img/ are the source of truth now and this
//   script never rewrites one of them. That includes hero.webp and
//   hero-mobile.webp: they were cut from the 1950 px original of the
//   napoletana-2 photo, and the shipped napoletana-2.webp is too small to
//   cut them again. Only their smaller copies and the social card are derived.
//   It also cannot make a good crop: that is an editorial decision, taken
//   before the file lands here.
//
// ADDING A PHOTO
//   1. Crop it to the aspect ratio of the gallery it joins (a gallery is
//      one flush row: every image in it has the same ratio) or to a sensible
//      ratio for a single figure (3:2, 4:3, 1:1 or the subject's own). Keep the
//      long side at 1400 px or less and the file at about 130 kB.
//   2. Save it as WebP, quality about 82, in static/img/<name>.webp. A product
//      cut-out keeps a real alpha channel (no white backdrop, no shadow).
//   3. `mise run images` writes its -480w / -800w copies. Commit all of them.
//   4. Use it in the Markdown as `img/<name>.webp`; the same file serves every
//      language.
//
// The output is deterministic for a given version of sharp (pinned in
// package.json): a second run changes no byte, so `git status` stays clean.

import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '../..');
const IMG_DIR = path.join(ROOT, 'static', 'img');
const STATIC_DIR = path.join(ROOT, 'static');
const FAVICON = path.join(ROOT, 'src', 'favicon.svg');

/** The WebP copies the build looks for next to a photo, and who gets them. */
const VARIANTS = [
  { width: 480, applies: (master) => master > 700 },
  { width: 800, applies: (master) => master >= 1000 },
];
const VARIANT_NAME = /-\d+w\.webp$/;
const VARIANT_QUALITY = 72;

const OG = { name: 'og.jpg', width: 1200, height: 630, quality: 84 };
const HERO = 'hero.webp';

/** Share of an icon's side taken by the badge on a full-bleed square. */
const MASKABLE_BADGE = 0.84;

/**
 * The copies a photo of this width gets.
 *
 * @param {number} width Width of the master in pixels.
 * @returns {number[]} Widths, narrowest first.
 */
export function variantWidths(width) {
  return VARIANTS.filter(({ applies }) => applies(width)).map((v) => v.width);
}

/**
 * The colour of the badge: the first `<circle>` of the favicon.
 *
 * @param {string} svg
 * @returns {string} `#rrggbb`
 */
export function badgeColour(svg) {
  const match = svg.match(/<circle\b[^>]*\bfill="(#[0-9a-f]{6})"/i);
  if (!match) throw new Error('src/favicon.svg: no <circle fill="#rrggbb">');
  return match[1];
}

/**
 * Packs PNG images into an `.ico` (PNG-compressed entries, which every
 * browser since IE 9 reads).
 *
 * @param {{ size: number, data: Buffer }[]} images
 * @returns {Buffer}
 */
export function packIco(images) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, data }, index) => {
    const entry = 6 + 16 * index;
    header.writeUInt8(size % 256, entry); // width (0 means 256)
    header.writeUInt8(size % 256, entry + 1);
    header.writeUInt16LE(1, entry + 4); // colour planes
    header.writeUInt16LE(32, entry + 6); // bits per pixel
    header.writeUInt32LE(data.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images.map(({ data }) => data)]);
}

/**
 * The images that nothing refers to: a file name that appears in none of the
 * texts (a section writes `img/<name>`, a card `img=<name>`, the generator
 * and the stylesheets the bare name).
 *
 * @param {string[]} names File names of the masters.
 * @param {string[]} texts Contents of the files that may refer to them.
 * @returns {string[]}
 */
export function unreferenced(names, texts) {
  return names.filter((name) => !texts.some((text) => text.includes(name)));
}

/** Where a picture can be named: what the generator reads or writes. */
const REFERENCE_SOURCES = ['content', 'scripts/lib', 'src', 'site.json'];
const TEXT_FILE = /\.(md|json|mjs|js|css|svg)$/;

/** @returns {AsyncGenerator<string>} The text files under a file or folder. */
async function* textFiles(entry) {
  const stat = await fs.stat(entry).catch(() => null);
  if (stat?.isDirectory()) {
    for (const name of await fs.readdir(entry)) {
      yield* textFiles(path.join(entry, name));
    }
  } else if (stat && TEXT_FILE.test(entry)) {
    yield entry;
  }
}

/** Writes a file only when its content differs. @returns {Promise<boolean>} */
async function writeIfChanged(file, data) {
  const current = await fs.readFile(file).catch(() => null);
  if (current?.equals(data)) return false;
  await fs.writeFile(file, data);
  return true;
}

const kB = (bytes) => `${(bytes / 1000).toFixed(1)} kB`;
const rel = (file) => path.relative(ROOT, file);

async function report(file, data, log) {
  const changed = await writeIfChanged(file, data);
  log(
    `${changed ? 'wrote    ' : 'unchanged'} ${rel(file)} (${kB(data.length)})`,
  );
}

/** The -480w / -800w copies of every photo, and no stale ones. */
async function deriveVariants(log) {
  const names = (await fs.readdir(IMG_DIR)).filter((n) => n.endsWith('.webp'));
  const masters = names.filter((n) => !VARIANT_NAME.test(n));
  const wanted = new Set();
  for (const name of masters) {
    const file = path.join(IMG_DIR, name);
    const { width } = await sharp(file).metadata();
    const stem = name.slice(0, -'.webp'.length);
    for (const w of variantWidths(width)) {
      const target = `${stem}-${w}w.webp`;
      wanted.add(target);
      const data = await sharp(file)
        .resize({ width: w, kernel: 'lanczos3' })
        .webp({ quality: VARIANT_QUALITY, effort: 6, alphaQuality: 100 })
        .toBuffer();
      await report(path.join(IMG_DIR, target), data, log);
    }
  }
  for (const name of names) {
    if (VARIANT_NAME.test(name) && !wanted.has(name)) {
      await fs.rm(path.join(IMG_DIR, name));
      log(`removed   ${rel(path.join(IMG_DIR, name))} (no master wants it)`);
    }
  }
}

/** The social card, cut from the hero. */
async function deriveSocialCard(log) {
  const data = await sharp(path.join(IMG_DIR, HERO))
    .resize(OG.width, OG.height, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: OG.quality, mozjpeg: true, chromaSubsampling: '4:2:0' })
    .toBuffer();
  await report(path.join(IMG_DIR, OG.name), data, log);
}

/** The app icons, drawn from the favicon. */
async function deriveIcons(log) {
  const svg = await fs.readFile(FAVICON);
  const badge = badgeColour(svg.toString());
  // Rendered at twice the size and scaled down: crisp at 16 px as well.
  const render = (size) =>
    sharp(svg, { density: Math.max(72, (72 * size * 2) / 64) })
      .resize(size, size)
      .png({ compressionLevel: 9 })
      .toBuffer();
  const fullBleed = async (size) =>
    sharp({
      create: { width: size, height: size, channels: 3, background: badge },
    })
      .composite([{ input: await render(Math.round(size * MASKABLE_BADGE)) }])
      .png({ compressionLevel: 9 })
      .toBuffer();

  const files = {
    'icon-192.png': await render(192),
    'icon-512.png': await render(512),
    'icon-maskable-512.png': await fullBleed(512),
    'apple-touch-icon.png': await fullBleed(180),
    'favicon-32.png': await render(32),
    'favicon.ico': packIco(
      await Promise.all(
        [16, 32, 48].map(async (size) => ({ size, data: await render(size) })),
      ),
    ),
  };
  for (const [name, data] of Object.entries(files)) {
    await report(path.join(STATIC_DIR, name), data, log);
  }
}

/** Masters that nothing names yet: worth a look, never an error. */
async function noteUnreferenced(log) {
  const masters = (await fs.readdir(IMG_DIR)).filter(
    (n) => /\.(webp|jpg)$/.test(n) && !VARIANT_NAME.test(n),
  );
  const texts = [];
  for (const source of REFERENCE_SOURCES) {
    for await (const file of textFiles(path.join(ROOT, source))) {
      texts.push(await fs.readFile(file, 'utf8'));
    }
  }
  const orphans = unreferenced(masters, texts);
  if (orphans.length > 0) {
    log(
      `note:     not named by any section, module, stylesheet or site.json: ${orphans.join(', ')}`,
    );
  }
}

/**
 * @param {(line: string) => void} [log]
 */
export async function main(log = console.log) {
  await deriveVariants(log);
  await deriveSocialCard(log);
  await deriveIcons(log);
  await noteUnreferenced(log);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
