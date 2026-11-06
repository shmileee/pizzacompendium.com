#!/usr/bin/env node
// Translation bookkeeping:
//   mise run i18n:status                       what is ok, stale, untranslated, missing, extra
//   mise run i18n:sync <code> [files...]       record that translated files match the current source
import { projectRoot } from './lib/cli.mjs';
import { createReporter, formatText } from './lib/diagnostics.mjs';
import { status, sync } from './lib/i18n-sync.mjs';

const root = projectRoot(process.env, import.meta.dirname);
const [command, code, ...files] = process.argv.slice(2);
const reporter = createReporter();
let lines = null;
if (command === 'status') lines = status({ root, reporter });
else if (command === 'sync' && code)
  lines = sync({ root, reporter, code, files });
else
  console.error(
    'Usage: mise run i18n:status | mise run i18n:sync <code> [files...]',
  );

if (lines) console.log(lines.join('\n'));
if (reporter.entries.length > 0)
  console.error(formatText(reporter.entries).join('\n'));
process.exitCode = lines && !reporter.hasErrors() ? 0 : 1;
