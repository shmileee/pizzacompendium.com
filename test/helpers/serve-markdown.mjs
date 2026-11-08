// The Markdown renderer as a harness for the hostile-input tests: a temp
// `static/img/` with a few valid WebPs, one renderer per call, the diagnostics
// captured. Not a test file; the renderer's own tests are another module's.

import { imageSize } from 'image-size';
import { createImageResolver } from '../../scripts/lib/images.mjs';
import { createMarkdown } from '../../scripts/lib/markdown/renderer.mjs';
import { capture } from './capture.mjs';
import { createTree, uiKeys, webp } from './repo.mjs';

/** Every UI string the blocks may ask for, the key name as its text. */
export const UI = Object.fromEntries(uiKeys().map((key) => [key, key]));

export const RESERVED = new Set(['top', 'content', 'toc', 'lang-picker']);

/** A temp static folder; `cleanup()` removes it. */
export function createStatic() {
  const tree = createTree();
  for (const name of ['a', 'b'])
    tree.write(`static/img/${name}.webp`, webp(960, 640));
  tree.write('static/img/empty.webp', '');
  return { staticDir: tree.path('static'), cleanup: () => tree.cleanup() };
}

/**
 * @param {{ staticDir: string }} site
 * @param {{ code?: string }} [options]
 * @returns {{ render: (text: string) => string, reporter: any, toc: any[] }}
 */
export function createRenderer(
  { staticDir },
  { code = 'pl', textLang = code } = {},
) {
  const reporter = capture();
  const md = createMarkdown({
    lang: { code },
    ui: UI,
    images: createImageResolver({ staticDir, imageSize }),
    reporter,
    isReserved: (id) => RESERVED.has(id),
  });
  return {
    reporter,
    toc: md.toc,
    render: (text) => md.render(text, 'case.md', textLang),
  };
}

const VOID = new Set(['img', 'br', 'hr', 'meta', 'link', 'input', 'col']);

/** Null when the tags balance, else what is wrong. Comments are ignored. */
export function unbalanced(html) {
  const stack = [];
  const tags = /<(\/?)([a-zA-Z][\w-]*)\b[^>]*?(\/?)>/g;
  for (const [, close, tag, self] of html
    .replace(/<!--[\s\S]*?-->/g, '')
    .matchAll(tags)) {
    const name = tag.toLowerCase();
    if (VOID.has(name) || self) continue;
    if (!close) stack.push(name);
    else {
      const at = stack.lastIndexOf(name);
      if (at < 0) return `stray </${name}>`;
      stack.length = at;
    }
  }
  return stack.length > 0 ? `unclosed <${stack.at(-1)}>` : null;
}
