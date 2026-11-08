/** A commit date as `git log --format=%cI` writes it. */
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/;

/**
 * @typedef {object} TextDates
 * @property {string} published When the language's text first appeared: the
 *   date of the oldest commit that touched it (ISO 8601).
 * @property {string} modified When it last changed: the newest such commit.
 */

/**
 * When the text of each language first appeared and last changed, from the
 * history of the repository: the commits that touched `content/<code>/`,
 * apart from `.sync.json` (confirming a translation changes no text). A date
 * of the text, not of the build: two builds of one commit are the same, and a
 * change to the generator does not make the guide look newer than it is.
 *
 * Without a usable history (no git, not a repository) there are no dates,
 * and the pages simply carry none. A shallow clone has a history, but a
 * wrong one (its oldest commit seems to have added every file), so it gives
 * no dates either and says so: the build warns, and CI's strict build fails
 * instead of publishing wrong dates.
 *
 * @param {object} options
 * @param {(args: string[]) => string} options.git Runs git in the repository
 *   and returns what it printed; throws when git cannot run or fails.
 * @param {string[]} options.codes The language folders.
 * @returns {{ dates: Map<string, TextDates>, shallow: boolean }}
 */
export function readHistory({ git, codes }) {
  const dates = new Map();
  try {
    if (git(['rev-parse', '--is-shallow-repository']).trim() === 'true')
      return { dates, shallow: true };
    for (const code of codes) {
      const commits = git([
        'log',
        '--format=%cI',
        '--',
        `content/${code}`,
        `:(exclude)content/${code}/.sync.json`,
      ])
        .split('\n')
        .filter((line) => ISO.test(line));
      if (commits.length > 0)
        dates.set(code, { modified: commits[0], published: commits.at(-1) });
    }
  } catch {
    dates.clear();
  }
  return { dates, shallow: false };
}
