import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import gallery from '../../scripts/lib/blocks/gallery.mjs';
import { codes, view } from '../helpers/capture.mjs';
import { renderOnce } from '../helpers/render.mjs';

const IMAGES = {
  'img/a.webp': { width: 960, height: 640 },
  'img/b.webp': { width: 960, height: 640 },
  'img/c.webp': { width: 960, height: 640 },
};

const run = (text, options = {}) =>
  renderOnce(text, { images: IMAGES, ...options });

describe('the gallery block', () => {
  it('takes no title', () => {
    assert.equal(gallery.name, 'gallery');
    assert.equal(gallery.title, 'none');
  });

  it('is a row of figures that says how many there are', () => {
    const { html, reporter } = run(
      '::: gallery\n![A](img/a.webp "Peel A")\n\n![B](img/b.webp "Peel B")\n:::\n',
    );
    assert.deepEqual(codes(reporter), []);
    assert.match(
      html,
      /^<div class="gallery" data-count="2"><figure class="photo [^"]*">/,
    );
    assert.equal((html.match(/<figure /g) ?? []).length, 2);
    assert.match(html, /<figcaption>Peel A<\/figcaption>/);
    assert.match(
      html,
      /<figcaption>Peel B<\/figcaption><\/figure>\n<\/div>\n$/,
    );
  });

  it('counts three pictures, even on one line', () => {
    const { html, reporter } = run(
      '::: gallery\n![A](img/a.webp "1") ![B](img/b.webp "2") ![C](img/c.webp "3")\n:::\n',
    );
    assert.deepEqual(codes(reporter), []);
    assert.match(html, /data-count="3"/);
    assert.equal((html.match(/<figure /g) ?? []).length, 3);
  });

  it('captions a picture with its alternative text when it has no title, and then gives it none', () => {
    const { html } = run(
      '::: gallery\n![The **first** one](img/a.webp)\n:::\n',
    );
    assert.match(html, /<img [^>]*alt=""/);
    assert.match(
      html,
      /<figcaption>The <strong>first<\/strong> one<\/figcaption>/,
    );
  });

  it('keeps the title and the alternative text of a picture that has both', () => {
    const { html } = run('::: gallery\n![Alt text](img/a.webp "Title")\n:::\n');
    assert.match(html, /alt="Alt text"/);
    assert.match(html, /<figcaption>Title<\/figcaption>/);
  });

  it('uses the sizes of a gallery for the pictures that have smaller copies', () => {
    const { html } = renderOnce('::: gallery\n![A](img/a.webp "t")\n:::\n', {
      images: {
        'img/a.webp': {
          width: 960,
          height: 640,
          variants: [{ href: 'img/a-480w.webp', width: 480 }],
        },
      },
    });
    assert.match(html, /sizes="\(min-width: 800px\) 394px, /);
  });

  it('says what the file is when it is missing, and still shows the caption', () => {
    const { html, reporter } = run(
      '::: gallery\n![A](img/a.webp "t")\n\n![B](img/gone.webp "u")\n:::\n',
    );
    assert.deepEqual(view(reporter), [
      { level: 'error', code: 'E_IMG_MISSING', file: 'case.md', line: 4 },
    ]);
    assert.match(html, /data-count="2"/);
  });

  it('refuses an empty gallery, at the block', () => {
    const { html, reporter } = run('::: gallery\n:::\n');
    assert.deepEqual(view(reporter), [
      { level: 'error', code: 'E_GALLERY', file: 'case.md', line: 1 },
    ]);
    assert.match(html, /data-count="0"/);
  });

  it('refuses a gallery that holds only blank lines', () => {
    const { reporter } = run('::: gallery\n\n\n:::\n');
    assert.deepEqual(codes(reporter), ['E_GALLERY']);
  });

  it('refuses text, at the line of the text, and does not count it', () => {
    const { html, reporter } = run(
      '::: gallery\n![A](img/a.webp "t")\n\nSome words.\n:::\n',
    );
    assert.deepEqual(view(reporter), [
      { level: 'error', code: 'E_GALLERY', file: 'case.md', line: 4 },
    ]);
    assert.match(html, /data-count="1"/);
  });

  it('refuses a paragraph that mixes text and a picture', () => {
    const { html, reporter } = run(
      '::: gallery\n![A](img/a.webp "t") and words\n:::\n',
    );
    assert.deepEqual(codes(reporter), ['E_GALLERY']);
    assert.match(html, /data-count="0"/);
  });

  it('does not also say the gallery is empty when it said what else is in it', () => {
    const { reporter } = run('::: gallery\nOnly words.\n:::\n');
    assert.deepEqual(codes(reporter), ['E_GALLERY']);
  });

  it('refuses a list, a heading and a block', () => {
    for (const stray of [
      '- ![A](img/a.webp)',
      '## H {#h}',
      '::: tip\nx\n:::',
    ]) {
      const { reporter } = run(
        `::: gallery\n![A](img/a.webp "t")\n\n${stray}\n:::\n`,
      );
      assert.ok(codes(reporter).includes('E_GALLERY'), stray);
    }
  });

  it('takes a title as an error', () => {
    const { reporter } = run('::: gallery Peels\n![A](img/a.webp "t")\n:::\n');
    assert.deepEqual(codes(reporter), ['E_BLOCK_TITLE']);
  });
});
