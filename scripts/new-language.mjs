#!/usr/bin/env node
// Start a language as a draft: mise run new-lang <code> "<Native name>"
//   e.g. mise run new-lang de "Deutsch"
import { projectRoot } from './lib/cli.mjs';
import { createReporter, formatText } from './lib/diagnostics.mjs';
import { nextSteps, scaffoldLanguage } from './lib/new-language.mjs';

const USAGE =
  'Usage: mise run new-lang <code> "<Native name>"   e.g. mise run new-lang de "Deutsch"';
const root = projectRoot(process.env, import.meta.dirname);
const [code = '', ...name] = process.argv.slice(2);
const reporter = createReporter();
const done = scaffoldLanguage({ root, code, name: name.join(' '), reporter });

if (done) {
  console.log(nextSteps(code, done.source));
} else {
  console.error(formatText(reporter.entries).join('\n'));
  // Only a mistake in the arguments is answered with the usage line.
  if (
    reporter.entries.some((entry) =>
      ['E_LANG_CODE', 'E_LANG_NAME'].includes(entry.code),
    )
  )
    console.error(USAGE);
  process.exitCode = 1;
}
