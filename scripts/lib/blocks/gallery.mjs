/**
 * A figure for a picture of a gallery. A picture in a row has to say what it
 * is (three peels side by side: which is which?), so one without a title of
 * its own is captioned with its alternative text, and then carries no
 * alternative text of its own: a screen reader would otherwise read the same
 * words twice.
 *
 * @param {{ text: string, title?: string | null }} image A Markdown image.
 * @returns {object} The same image, with its caption in `title`.
 */
const captioned = (image) =>
  image.title ? image : { ...image, title: image.text, text: '' };

/**
 * A row of figures: the block holds images and nothing else. It says how many
 * there are (`data-count`), which the stylesheet needs to lay out a row of
 * three differently from a pair.
 */
export default {
  name: 'gallery',
  title: 'none',
  render({ tokens, line, error, figure }) {
    const images = [];
    let stray = false;
    for (const token of tokens) {
      if (token.type === 'space') continue;
      const parts =
        token.type === 'paragraph'
          ? token.tokens.filter(
              (part) => part.type !== 'text' || part.raw.trim(),
            )
          : [];
      if (parts.length > 0 && parts.every((part) => part.type === 'image')) {
        images.push(...parts);
      } else {
        stray = true;
        error(
          'E_GALLERY',
          'a gallery holds images and nothing else',
          token.line,
        );
      }
    }
    if (images.length === 0 && !stray)
      error('E_GALLERY', 'the gallery has no images', line);
    return `<div class="gallery" data-count="${images.length}">${images.map((image) => figure(captioned(image), 'gallery')).join('')}</div>\n`;
  },
  markdown: ({ body }) => body,
};
