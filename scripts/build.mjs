#!/usr/bin/env node
// mise run build [-- --strict --out <dir> --no-fingerprint --quiet --format text|github|json]
// Diagnostics: stderr (text) or stdout (github, json). The summary is for people: stderr.
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
  const outDir = path.resolve(out ?? path.join(root, 'dist'));
  const fingerprint = !values['no-fingerprint'];
  const result = build({ root, outDir, imageSize, fingerprint, strict });
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
