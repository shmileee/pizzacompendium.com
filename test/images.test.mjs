import assert from 'node:assert/strict';
import nodeFs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { imageSize } from 'image-size';
import {
  createImageResolver,
  MAX_IMAGE_BYTES,
  srcsetOf,
  webpHasAlpha,
} from '../scripts/lib/images.mjs';
import { counting, failing } from './helpers/fake-fs.mjs';
import { createTree, webp } from './helpers/repo.mjs';

let tree;
beforeEach(() => {
  tree = createTree();
});
afterEach(() => tree.cleanup());

const resolver = (fs = nodeFs, size = imageSize) =>
  createImageResolver({ fs, staticDir: tree.path('static'), imageSize: size });

/** A VP8X WebP header with the given flag byte. */
const vp8x = (flags, length = 30) => {
  const buffer = Buffer.alloc(length);
  buffer.write('RIFF', 0);
  buffer.write('WEBPVP8X', 8);
  buffer[20] = flags;
  return buffer;
};

describe('webpHasAlpha', () => {
  it('is true when the VP8X alpha bit is set', () => {
    assert.equal(webpHasAlpha(vp8x(0x10)), true);
    assert.equal(webpHasAlpha(vp8x(0xff)), true);
  });

  it('is false when the bit is clear', () => {
    assert.equal(webpHasAlpha(vp8x(0x00)), false);
    assert.equal(webpHasAlpha(vp8x(0xef)), false);
  });

  it('is false for a plain WebP, another format or a short file', () => {
    assert.equal(webpHasAlpha(webp(2, 2)), false);
    assert.equal(webpHasAlpha(Buffer.alloc(40, 0xff)), false);
    assert.equal(webpHasAlpha(vp8x(0x10, 20)), false);
    assert.equal(webpHasAlpha(vp8x(0x10, 21)), true);
    assert.equal(webpHasAlpha(new Uint8Array(0)), false);
  });
});

describe('createImageResolver', () => {
  it('resolves an image with its size, no variants and no alpha', () => {
    tree.write('static/img/a.webp', webp(960, 640));
    assert.deepEqual(resolver().resolve('img/a.webp'), {
      ok: true,
      href: 'img/a.webp',
      width: 960,
      height: 640,
      variants: [],
      alpha: false,
    });
  });

  it('finds narrower variants, narrowest first, ignoring the rest', () => {
    tree.write('static/img/a.webp', webp(960, 640));
    tree.write('static/img/a-480w.webp', webp(480, 320));
    tree.write('static/img/a-240w.webp', webp(240, 160));
    tree.write('static/img/a-960w.webp', webp(960, 640));
    tree.write('static/img/a-1200w.webp', webp(1200, 800));
    tree.write('static/img/a-0w.webp', webp(1, 1));
    tree.write('static/img/a-1.5w.webp', webp(1, 1));
    tree.write('static/img/a-xw.webp', webp(1, 1));
    tree.write('static/img/a-480w.png', webp(1, 1));
    tree.write('static/img/b-100w.webp', webp(1, 1));
    const { variants } = resolver().resolve('img/a.webp');
    assert.deepEqual(variants, [
      { href: 'img/a-240w.webp', width: 240 },
      { href: 'img/a-480w.webp', width: 480 },
    ]);
  });

  it('finds variants next to an image in a sub-folder', () => {
    tree.write('static/img/sub/a.webp', webp(960, 640));
    tree.write('static/img/sub/a-480w.webp', webp(480, 320));
    assert.deepEqual(resolver().resolve('img/sub/a.webp').variants, [
      { href: 'img/sub/a-480w.webp', width: 480 },
    ]);
  });

  it('says alpha for a cut-out', () => {
    tree.write('static/img/a.webp', webp(2, 2));
    const bytes = Buffer.from(vp8x(0x10, 30));
    // A real VP8X file with a canvas size, so that image-size can read it.
    bytes.writeUIntLE(1, 24, 3);
    bytes.writeUIntLE(1, 27, 3);
    tree.write('static/img/cut.webp', bytes);
    assert.equal(resolver().resolve('img/cut.webp').alpha, true);
  });

  for (const href of [
    'a.webp',
    'img/',
    'img/a',
    '/img/a.webp',
    'img/../a.webp',
    'img/a b.webp',
    'img//a.webp',
    'img/a.webp/',
    'static/img/a.webp',
    'IMG/a.webp',
    'https://x.test/img/a.webp',
    'img/a.webp\n',
  ]) {
    it(`refuses ${JSON.stringify(href)} as a path`, () => {
      assert.equal(resolver().resolve(href).code, 'E_IMG_PATH');
    });
  }

  it('reports a missing image', () => {
    tree.write('static/img/other.webp', webp(1, 1));
    const result = resolver().resolve('img/a.webp');
    assert.equal(result.ok, false);
    assert.equal(result.code, 'E_IMG_MISSING');
  });

  it('reports a missing static folder as a missing image', () => {
    assert.equal(resolver().resolve('img/a.webp').code, 'E_IMG_MISSING');
  });

  it('is exact about case, as GitHub Pages is', () => {
    tree.write('static/img/Photo.webp', webp(1, 1));
    assert.equal(resolver().resolve('img/photo.webp').code, 'E_IMG_CASE');
    tree.write('static/img/Pizza.PNG', webp(1, 1));
    assert.equal(resolver().resolve('img/pizza.png').code, 'E_IMG_CASE');
    tree.write('static/img/Dir/a.webp', webp(1, 1));
    assert.equal(resolver().resolve('img/dir/a.webp').code, 'E_IMG_CASE');
  });

  it('refuses a symbolic link, even to a good image', () => {
    tree.write('static/real.webp', webp(1, 1));
    tree.symlink('static/img/a.webp', '../real.webp');
    assert.equal(resolver().resolve('img/a.webp').code, 'E_IMG_UNREADABLE');
  });

  it('refuses a folder named like an image', () => {
    tree.write('static/img/a.webp/x', 'x');
    assert.equal(resolver().resolve('img/a.webp').code, 'E_IMG_UNREADABLE');
  });

  it('refuses an image over the size limit without reading it', () => {
    tree.write('static/img/a.webp', webp(1, 1));
    const fs = {
      ...nodeFs,
      lstatSync: () => ({ isFile: () => true, size: MAX_IMAGE_BYTES + 1 }),
      readFileSync: () => assert.fail('must not read'),
    };
    assert.equal(resolver(fs).resolve('img/a.webp').code, 'E_IMG_UNREADABLE');
  });

  it('accepts an image of exactly the limit', () => {
    tree.write('static/img/a.webp', webp(3, 3));
    const fs = {
      ...nodeFs,
      lstatSync: () => ({ isFile: () => true, size: MAX_IMAGE_BYTES }),
    };
    assert.equal(resolver(fs).resolve('img/a.webp').ok, true);
  });

  it('reports bytes that are not an image', () => {
    tree.write('static/img/a.webp', 'not an image');
    assert.equal(resolver().resolve('img/a.webp').code, 'E_IMG_UNREADABLE');
  });

  it('reports an image with no dimensions', () => {
    tree.write('static/img/a.webp', webp(1, 1));
    for (const size of [
      () => ({}),
      () => ({ width: 0, height: 5 }),
      () => ({ width: 5, height: 0 }),
      () => ({ width: 5 }),
      () => ({ width: Number.NaN, height: 5 }),
    ])
      assert.equal(
        resolver(nodeFs, size).resolve('img/a.webp').code,
        'E_IMG_UNREADABLE',
      );
  });

  for (const code of ['EACCES', 'EMFILE', 'EISDIR']) {
    it(`reports E_IMG_UNREADABLE, not an exception, for ${code}`, () => {
      tree.write('static/img/a.webp', webp(1, 1));
      const fs = failing(nodeFs, { op: 'readFileSync', code });
      assert.equal(resolver(fs).resolve('img/a.webp').code, 'E_IMG_UNREADABLE');
    });
  }

  it('treats an unlistable folder as empty', () => {
    tree.write('static/img/a.webp', webp(1, 1));
    const fs = failing(nodeFs, { op: 'readdirSync', code: 'EACCES' });
    assert.equal(resolver(fs).resolve('img/a.webp').code, 'E_IMG_MISSING');
  });

  it('remembers results and listings', () => {
    tree.write('static/img/a.webp', webp(1, 1));
    tree.write('static/img/b.webp', webp(1, 1));
    const fs = counting(nodeFs);
    const images = resolver(fs);
    const first = images.resolve('img/a.webp');
    assert.equal(images.resolve('img/a.webp'), first);
    images.resolve('img/b.webp');
    images.resolve('img/missing.webp');
    assert.equal(fs.count('readFileSync'), 2);
    assert.equal(
      fs.count('readdirSync', path.join(tree.root, 'static/img')),
      1,
    );
  });

  it('remembers a problem too', () => {
    const fs = counting(nodeFs);
    const images = resolver(fs);
    const first = images.resolve('img/none.webp');
    assert.equal(images.resolve('img/none.webp'), first);
    assert.equal(fs.count('readdirSync'), 1);
  });
});

describe('srcsetOf', () => {
  it('lists the variants and then the image, as paths below the site root', () => {
    assert.equal(
      srcsetOf({
        href: 'img/a.webp',
        width: 800,
        variants: [{ href: 'img/a-400.webp', width: 400 }],
      }),
      '../img/a-400.webp 400w, ../img/a.webp 800w',
    );
  });

  it('lists just the image when it has no variants', () => {
    assert.equal(
      srcsetOf({ href: 'img/a.webp', width: 800, variants: [] }),
      '../img/a.webp 800w',
    );
  });
});
