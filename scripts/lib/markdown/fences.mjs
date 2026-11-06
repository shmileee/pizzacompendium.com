// Dependency-free on purpose: the content linter shares this with the
// renderer and must not need `marked`.

const FENCE = /^ {0,3}(`{3,}|~{3,})([^\n]*)$/;
const COMMENT_START = /^ {0,3}<!--/;

/**
 * Tells, line by line, which lines are literal: fenced code or an HTML
 * comment. Nothing inside them is structure (a `:::` there opens and closes
 * nothing) and a comment is never published. The CommonMark rules: a closing
 * code fence uses the same character, is at least as long as the opening
 * one and has no text after it; the info string of a backtick fence cannot
 * contain a backtick; a comment block starts on a line that begins with
 * `<!--` and ends on the first line that holds `-->`; either one that is never
 * closed runs to the end. A fence inside a comment and a comment inside a
 * fence are text, which is why the two are decided together.
 *
 * Call the returned function with the lines in order.
 *
 * @returns {(line: string) => 'code' | 'comment' | 'text'}
 */
export function createLineClassifier() {
  /** @type {{ char: string, length: number } | null} */
  let fence = null;
  let comment = false;
  return (line) => {
    const found = FENCE.exec(line);
    if (fence) {
      if (
        found &&
        found[1][0] === fence.char &&
        found[1].length >= fence.length &&
        !found[2].trim()
      )
        fence = null;
      return 'code';
    }
    if (comment) {
      comment = !line.includes('-->');
      return 'comment';
    }
    if (found && !(found[1][0] === '`' && found[2].includes('`'))) {
      fence = { char: found[1][0], length: found[1].length };
      return 'code';
    }
    if (COMMENT_START.test(line)) {
      comment = !line.includes('-->');
      return 'comment';
    }
    return 'text';
  };
}

/**
 * @param {string[]} lines
 * @returns {('code' | 'comment' | 'text')[]}
 */
export function classifyLines(lines) {
  return lines.map(createLineClassifier());
}
