// Dependency-free: pure functions on text.

/** The no-break space, written as an escape: an invisible character in a
 * source file is lost the first time a tool turns it into a plain space. */
export const NBSP = '\u00A0';

/** What can stand before a short word that opens a clause or a quotation. */
const WORD_START = '^|[\\s(«‘“„]';

/** The space before a dash that has a space on both sides (`word – word`). */
const SPACE_BEFORE_DASH = /(^|\S) (?=[–—](?:\s|$))/gu;

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Longest first, so that `min` is tried before `m`. */
const alternation = (words) =>
  [...words]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join('|');

/**
 * What a language says about its typography (`typography` in `lang.json`).
 *
 * @typedef {object} Typography
 * @property {string[]} [nbspAfter] Short words that must not end a line, such
 *   as the one-letter prepositions of Polish and the words that belong to the
 *   number after them (`about`, `ok.`): they are tied to the next word.
 * @property {string[]} [units] Units that must stay with their number
 *   (`250 g`, `24 h`); spell out every form the text uses.
 */

/**
 * The typography pass for one language: a function from the escaped text of
 * one run of inline text (no tags in it) to the same text with
 *
 * - a no-break space after each word in `nbspAfter`,
 * - a no-break space between a number and a unit of `units`,
 * - a no-break space before a dash that stands between spaces, so that no
 *   line starts with a dash (every language does this),
 * - every numeric range (`5–6`, `$3–5`, `W250–310`, `55–62%`, `400–500°C`)
 *   in a `<span class="nowrap">`, so that no line breaks at the dash.
 *
 * Only whitespace and the wrapper are added: the words, numbers and marks are
 * exactly those of the source. Code, links and attributes never get here.
 *
 * @param {Typography} [config] Nothing configured: ranges only.
 * @returns {(text: string) => string}
 */
export function createTypography({ nbspAfter = [], units = [] } = {}) {
  const tied =
    nbspAfter.length > 0
      ? new RegExp(
          `(?<=${WORD_START})(?:${alternation(nbspAfter)})\\s+(?=\\S|$)`,
          'giu',
        )
      : null;
  const unit =
    units.length > 0
      ? new RegExp(`(\\d) (?=(?:${alternation(units)})(?![\\p{L}\\d]))`, 'gu')
      : null;
  const range =
    /(?:[$€£]|\p{Lu}{1,2})?\d+(?:[.,]\d+)*–(?:\p{Lu}{1,2})?\d+(?:[.,]\d+)*(?:%|°[CF]?)?/gu;
  return (text) => {
    let out = text;
    if (tied) out = out.replace(tied, (match) => match.trimEnd() + NBSP);
    if (unit) out = out.replace(unit, `$1${NBSP}`);
    out = out.replace(SPACE_BEFORE_DASH, `$1${NBSP}`);
    return out.replace(range, '<span class="nowrap">$&</span>');
  };
}
