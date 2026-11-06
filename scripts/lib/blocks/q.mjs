import { escapeHtml, uiText } from '../html/escape.mjs';
import { icon } from '../html/icons.mjs';

/**
 * What the first question of a page brings along, for the script to use:
 *
 * - the "expand all" button (the page stylesheet shows it only when scripts
 *   run; it carries both labels, the script swaps them), and
 * - a `<template>` with the footer of an answer, the copy-link button, which
 *   the script copies into every answer when the browser can write to the
 *   clipboard (so a page without that gets no dead button, and a page without
 *   scripts gets none either). The two messages it shows are attributes.
 *
 * @param {Record<string, string>} ui
 * @returns {string}
 */
const faqTools = (ui) => {
  const text = uiText(ui);
  return `<div class="faq-tools"><button type="button" class="btn faq-toggle" data-faq-toggle data-expand="${text('expandAll')}" data-collapse="${text('collapseAll')}">${icon('chevron-down')}<span>${text('expandAll')}</span></button></div>
<template id="pc-faq-foot" data-copied="${text('linkCopied')}" data-failed="${text('copyFailed')}"><div class="faq-foot"><button type="button" class="btn btn-quiet faq-copy" data-faq-copy>${icon('link')}<span>${text('copyLink')}</span></button><span class="faq-status" role="status"></span></div></template>
`;
};

/**
 * A collapsible FAQ item; its id is the anchor other text links to. The
 * question is one flex item of the summary next to the chevron (a question
 * with markup in it must not become several).
 */
export default {
  name: 'q',
  attrs: { id: 'required' },
  title: 'required',
  render({ attrs, title, line, ui, inline, body, registerId, once }) {
    registerId(attrs.id, line);
    const tools = once('faq-toggle') ? faqTools(ui) : '';
    return `${tools}<details class="faq" id="${escapeHtml(attrs.id)}"><summary><span class="faq-q">${inline(title, line)}</span>${icon('chevron-down', 'faq-chevron')}</summary><div class="faq-body">${body()}</div></details>\n`;
  },
};
