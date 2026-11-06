import { parseFenceLine, parseInfo } from './container-syntax.mjs';
import { createLineClassifier } from './fences.mjs';

/**
 * The line that starts at `from` and where the next one starts.
 *
 * @param {string} src
 * @param {number} from
 * @returns {{ text: string, next: number }}
 */
function lineAt(src, from) {
  const end = src.indexOf('\n', from);
  return end < 0
    ? { text: src.slice(from), next: src.length }
    : { text: src.slice(from, end), next: end + 1 };
}

/**
 * A `marked` block extension for `:::` containers. Because `marked` itself
 * decides what is a code block, a list, a quote or an HTML comment, a
 * container is found wherever Markdown puts one: inside list items and
 * quotes, never inside code. Containers nest; each one lexes its own body.
 * The closing fence is looked for line by line from the opening one, so the
 * work is proportional to the block, not to the rest of the document.
 *
 * Tokens: `{ type: 'container', raw, name, attrs, title, fence, closeFence,
 * tokens }`. `closeFence` is the length of the closing fence, or null when
 * the block is never closed (it then runs to the end). A bare `:::` with no
 * block to close becomes `{ stray: true }` so that it can be reported.
 *
 * @param {(token: any, parser: any) => string} render
 * @returns {object} The extension, for `marked.use({ extensions })`.
 */
export function containerExtension(render) {
  return {
    name: 'container',
    level: 'block',
    childTokens: ['tokens'],
    // `marked` hands over the paragraph text without its first character.
    start(src) {
      const at = src.search(/\n:{3,}/);
      return at < 0 ? undefined : at + 1;
    },
    tokenizer(src) {
      const first = lineAt(src, 0);
      const fence = parseFenceLine(first.text);
      if (!fence) return undefined;
      if (fence.kind === 'close')
        return {
          type: 'container',
          raw: src.slice(0, first.next),
          stray: true,
        };

      const next = createLineClassifier();
      let depth = 1;
      let bodyEnd = src.length;
      let rawEnd = src.length;
      let closeFence = null;
      for (let at = first.next; at < src.length && closeFence === null; ) {
        const line = lineAt(src, at);
        const found = next(line.text) === 'text' && parseFenceLine(line.text);
        if (found?.kind === 'open') depth++;
        if (found?.kind === 'close' && --depth === 0) {
          closeFence = found.colons;
          bodyEnd = Math.max(first.next, at - 1);
          rawEnd = line.next;
        }
        at = line.next;
      }
      return {
        type: 'container',
        raw: src.slice(0, rawEnd),
        name: fence.name,
        ...parseInfo(fence.info),
        fence: fence.colons,
        closeFence,
        tokens: this.lexer.blockTokens(src.slice(first.next, bodyEnd), []),
      };
    },
    renderer(token) {
      return render(token, this.parser);
    },
  };
}
