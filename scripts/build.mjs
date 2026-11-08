#!/usr/bin/env node
// mise run build [-- --strict --out <dir> --no-fingerprint --quiet --format text|github|json]
// Diagnostics: stderr (text) or stdout (github, json). The summary is for people: stderr.
// --out is relative to the repository (or COMPENDIUM_ROOT), not to the working directory.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { imageSize } from 'image-size';
import { build } from './lib/build.mjs';
import { formatReport, parseOptions, projectRoot } from './lib/cli.mjs';
import { summarize } from './lib/diagnostics.mjs';

const root = projectRoot(process.env, import.meta.dirname);
const { values, error } = parseOptions({
  argv: process.argv.slice(2),
  env: process.env,
  options: {
    strict: { type: 'boolean' },
    out: { type: 'string' },
    'no-fingerprint': { type: 'boolean' },
    quiet: { type: 'boolean' },
  },
  command: 'mise run build --',
});
if (error) {
  console.error(error);
  process.exitCode = 1;
} else {
  const { strict, quiet, out } = values;
  // Relative to the repository, as every other path of a command line is.
  const outDir = path.resolve(root, out ?? 'dist');
  const fingerprint = !values['no-fingerprint'];
  // The dates of the text come from the history of the repository.
  const git = (args) =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  const result = build({ root, outDir, imageSize, fingerprint, strict, git });
  const { entries } = result.reporter;
  const report = formatReport(entries, values);
  if (report) console[report.method](report.text);
  const { errors, warnings } = summarize(entries);
  if (!result.ok) console.error(`\nBuild failed with ${errors} error(s).`);
  else if (!quiet)
    console.error(
      `Built ${result.languages.join(', ')} → ${path.relative(process.cwd(), outDir) || '.'}/${warnings ? ` (${warnings} warning(s))` : ''}`,
    );
  process.exitCode = result.ok ? 0 : 1;
}
