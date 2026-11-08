import { escapeHtml, uiText } from '../html/escape.mjs';
import { icon } from '../html/icons.mjs';
import { plainText } from '../markdown/text.mjs';

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
 * with markup in it must not become several). The question and its answer,
 * as text, are recorded for the `FAQPage` of the page's structured data.
 */
export default {
  name: 'q',
  attrs: { id: 'required' },
  title: 'required',
  render({ attrs, title, line, ui, inline, body, registerId, once, record }) {
    registerId(attrs.id, line);
    const tools = once('faq-toggle') ? faqTools(ui) : '';
    const question = inline(title, line);
    const answer = body();
    record({
      type: 'faq',
      id: attrs.id,
      question: plainText(question),
      answer: plainText(answer),
    });
    return `${tools}<details class="faq" id="${escapeHtml(attrs.id)}"><summary><span class="faq-q">${question}</span>${icon('chevron-down', 'faq-chevron')}</summary><div class="faq-body">${answer}</div></details>\n`;
  },
  // In the Markdown copy a question is a heading one level below the section
  // it is in, so that a reader (or a program) that splits the text at
  // headings finds every question with its answer.
  markdown: ({ title, body, depth }) =>
    `${'#'.repeat(Math.min(depth + 1, 6))} ${title}\n\n${body}`,
};
