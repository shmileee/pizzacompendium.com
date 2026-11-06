import path from 'node:path';
import { parseArgs } from 'node:util';
import { FORMATS } from './diagnostics.mjs';

/**
 * The folder every command line works on: the repository the script lives in,
 * or the one `COMPENDIUM_ROOT` names. The override is how the tests point the
 * real scripts at a throwaway tree.
 *
 * @param {Record<string, string | undefined>} env
 * @param {string} here The folder of the script (`import.meta.dirname`).
 * @returns {string} An absolute path.
 */
export const projectRoot = (env, here) =>
  path.resolve(env.COMPENDIUM_ROOT || path.join(here, '..'));

/**
 * The command line of a script that prints diagnostics: its own `options`
 * (see `util.parseArgs`) plus `--format text|github|json`, which defaults to
 * GitHub annotations inside GitHub Actions. A mistake comes back as a
 * message, never as an exception.
 *
 * @param {object} input
 * @param {string[]} input.argv The arguments after the script name.
 * @param {Record<string, string | undefined>} input.env
 * @param {Record<string, { type: 'string' | 'boolean' }>} input.options
 * @param {string} input.command What to type, e.g. `mise run build --`.
 * @returns {{ values: Record<string, any>, error?: undefined } | { error: string }}
 */
export function parseOptions({ argv, env, options, command }) {
  const format = {
    type: 'string',
    default: env.GITHUB_ACTIONS === 'true' ? 'github' : 'text',
  };
  try {
    const { values } = parseArgs({
      args: argv,
      options: { ...options, format },
    });
    if (!Object.hasOwn(FORMATS, values.format))
      throw new Error(
        `--format must be one of ${Object.keys(FORMATS).join(', ')}`,
      );
    return { values };
  } catch (error) {
    const flags = Object.entries({
      ...options,
      format: { type: 'format' },
    }).map(
      ([name, { type }]) =>
        `[--${name}${type === 'boolean' ? '' : ` <${type === 'format' ? 'text|github|json' : name}>`}]`,
    );
    return { error: `${error.message}\nUsage: ${command} ${flags.join(' ')}` };
  }
}

/**
 * The diagnostics as the chosen format, and the `console` method to print
 * them with: people read the text format on stderr, tools read the others on
 * stdout. With `quiet` only the errors are shown. The JSON format is always
 * a complete document, `[]` when there is nothing to report.
 *
 * @param {import('./diagnostics.mjs').Diagnostic[]} entries
 * @param {{ format: 'text' | 'github' | 'json', quiet?: boolean }} options
 * @returns {{ method: 'error' | 'log', text: string } | null} Null when
 *   there is nothing to print.
 */
export function formatReport(entries, { format, quiet }) {
  const shown = entries.filter((entry) => entry.level === 'error' || !quiet);
  if (shown.length === 0 && format !== 'json') return null;
  return {
    method: format === 'text' ? 'error' : 'log',
    text: FORMATS[format](shown).join('\n'),
  };
}
