/**
 * Escapes text for an element body or a double-quoted attribute.
 *
 * @param {string} text
 * @returns {string}
 */
export const escapeHtml = (text) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * A reader of the UI strings: `text('search')` is `ui.search`, escaped.
 *
 * @param {Record<string, string>} ui
 * @returns {(key: string) => string}
 */
export const uiText = (ui) => (key) => escapeHtml(ui[key]);
