import { createHash } from 'node:crypto';

/**
 * The source expression that allows exactly this inline script. A browser
 * reads a page with `\n` line endings whatever bytes it was sent, so that is
 * the text that is hashed.
 *
 * @param {string} text The text between `<script>` and `</script>`.
 * @returns {string}
 */
export const scriptHash = (text) =>
  `'sha256-${createHash('sha256')
    .update(text.replace(/\r\n?/g, '\n'), 'utf8')
    .digest('base64')}'`;

/**
 * The `<meta>` that carries the Content-Security-Policy (GitHub Pages cannot
 * send headers). Everything comes from the page's own origin; the only
 * inline scripts allowed are the given ones, by hash. `frame-ancestors` and
 * `report-uri` are ignored in a meta policy, so they are left out.
 *
 * @param {string[]} scripts The exact text of every inline script.
 * @returns {string}
 */
export function cspMeta(scripts) {
  const policy = [
    "default-src 'none'",
    `script-src 'self'${scripts.map((text) => ` ${scriptHash(text)}`).join('')}`,
    "style-src 'self'",
    "img-src 'self'",
    "font-src 'self'",
    "manifest-src 'self'",
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
  return `<meta http-equiv="Content-Security-Policy" content="${policy}">`;
}

const POLICY = /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/;

// The generator writes every tag in one shape: `<name attr="value" flag>`,
// attributes one space apart, values in double quotes with `<`, `>` and `"`
// escaped. A `<` that does not start such a tag is not the generator's (a
// comment, a tag with the attributes jammed together, a slash where a space
// belongs): the page is not read any further, because a browser and this
// check could read it differently.
const TAG =
  /<(\/?)([a-z][a-z0-9]*)((?: [a-zA-Z_:][\w:.-]*(?:="[^"<>]*")?)*)(\/?)>/y;
const ATTRIBUTE = / ([a-zA-Z_:][\w:.-]*)(?:="([^"]*)")?/g;

/** Elements nothing here uses, wherever they stand. */
const DENIED = new Set(
  'style iframe frame frameset object embed applet base'.split(' '),
);
/** Elements that belong in the `<head>`: in the body they came from the text. */
const HEAD_ONLY = new Set(['meta', 'link']);
const URL_ATTRIBUTES = new Set([
  'href',
  'src',
  'srcset',
  'action',
  'formaction',
  'data',
  'poster',
  'xlink:href',
  'ping',
]);
/**
 * An address on this site: a path or a fragment, written with plain
 * characters. No `:` (so no scheme, `javascript:` included, and no entity
 * that could decode to one), no `&`, and no `//` or `\` at the start.
 */
const LOCAL = /^(?!\/\/)[\w#?=%./-]*$/;
const DESCRIPTOR = /^\d+(?:\.\d+)?[wx]$/;

/** The addresses of an `srcset`: `a.webp 480w, b.webp 800w`. */
const isLocalSet = (value) =>
  value.split(',').every((candidate) => {
    const [address = '', descriptor, ...more] = candidate.trim().split(/\s+/);
    return (
      LOCAL.test(address) &&
      (descriptor === undefined || DESCRIPTOR.test(descriptor)) &&
      more.length === 0
    );
  });

/**
 * Checks a finished page against its own policy. Every inline script has its
 * hash in the policy and the page is made of nothing but tags the generator
 * writes (see `TAG`), with no event-handler attribute, no inline style, no
 * element that embeds or navigates away (`<iframe>`, `<object>`, `<base>`, a
 * `<meta>` or `<link>` in the body) and no address in the body that leaves
 * the site. The policy refuses most of this anyway; the point is to fail the
 * build, and to catch what a policy cannot (a `<meta http-equiv="refresh">`,
 * a link to somewhere else).
 *
 * @param {string} html
 * @returns {string[]} The problems found.
 */
export function checkPolicy(html) {
  const problems = [];
  const policy = POLICY.exec(html)?.[1];
  if (policy === undefined) problems.push('no Content-Security-Policy');
  if (!html.startsWith('<!doctype html>\n<html'))
    problems.push('the page does not start with <!doctype html> and <html>');
  const bodyAt = html.indexOf('<body');
  for (let at = html.indexOf('<html'); at >= 0; at = html.indexOf('<', at)) {
    TAG.lastIndex = at;
    const tag = TAG.exec(html);
    if (!tag) {
      problems.push(
        `markup the generator does not write: ${html.slice(at, at + 40)}`,
      );
      break;
    }
    const [whole, closing, name, attributes] = tag;
    at += whole.length;
    if (closing) continue;
    const inBody = bodyAt >= 0 && tag.index >= bodyAt;
    if (name === 'script') {
      const end = html.indexOf('</script>', at);
      if (end < 0) {
        problems.push('a <script> that is never closed');
        break;
      }
      const text = html.slice(at, end);
      const src = / src="([^"]*)"/.exec(attributes)?.[1];
      if (src === undefined && !policy?.includes(scriptHash(text)))
        problems.push(
          `inline script without a hash in the policy: ${text.slice(0, 40)}`,
        );
      if (src !== undefined && !LOCAL.test(src))
        problems.push(`a script from outside the site: ${src.slice(0, 40)}`);
      at = end;
      continue;
    }
    if (DENIED.has(name) || (inBody && HEAD_ONLY.has(name)))
      problems.push(`<${name}> where the page has none`);
    for (const [, key, value = ''] of attributes.matchAll(ATTRIBUTE)) {
      const attribute = key.toLowerCase();
      if (/^on/.test(attribute) || ['style', 'srcdoc'].includes(attribute))
        problems.push(`a ${attribute} attribute on <${name}>`);
      if (
        inBody &&
        URL_ATTRIBUTES.has(attribute) &&
        !(attribute === 'srcset' ? isLocalSet(value) : LOCAL.test(value))
      )
        problems.push(
          `an address that leaves the site: ${attribute}="${value.slice(0, 40)}"`,
        );
    }
  }
  return problems;
}

/**
 * Checks every finished page; each problem is an `E_CSP` error on the page.
 *
 * @param {Map<string, string>} pages Page text by path in `dist/`.
 * @param {import('./diagnostics.mjs').Reporter} reporter
 * @returns {void}
 */
export function checkPages(pages, reporter) {
  for (const [file, html] of pages)
    for (const problem of checkPolicy(html))
      reporter.error('E_CSP', problem, { file });
}
