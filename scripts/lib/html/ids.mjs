/**
 * Ids the page template defines itself. Content may link to them (`#top`)
 * but may not use them as ids of its own. Keep in step with the templates.
 */
export const PAGE_IDS = ['top', 'content', 'toc', 'toc-toggle', 'lang-picker'];

/** Every id that starts like this belongs to the page template as well. */
const PAGE_ID_PREFIX = 'pc-';

/**
 * @param {string} id
 * @returns {boolean} Is it an id the page template uses (or may use) itself,
 *   so that content must not define it?
 */
export const isPageId = (id) =>
  PAGE_IDS.includes(id) || id.startsWith(PAGE_ID_PREFIX);
