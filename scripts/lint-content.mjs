#!/usr/bin/env node
// The hard content rules, without building anything. Used by the content-lint
// hook (`mise run lint`), by CI and by hand. It needs no npm packages.
//   mise run content:lint [-- --file <NN-name.md>] [--format text|github|json]
import { formatReport, parseOptions, projectRoot } from './lib/cli.mjs';
import { createReporter, summarize } from './lib/diagnostics.mjs';
import { lintProject } from './lib/project.mjs';

const root = projectRoot(process.env, import.meta.dirname);
const { values, error } = parseOptions({
  argv: process.argv.slice(2),
  env: process.env,
  options: { file: { type: 'string' }, quiet: { type: 'boolean' } },
  command: 'mise run content:lint --',
});

if (error) {
  console.error(error);
  process.exitCode = 1;
} else {
  const reporter = createReporter();
  lintProject({ root, reporter, only: values.file ?? null });
  const report = formatReport(reporter.entries, values);
  if (report) console[report.method](report.text);
  const { errors, warnings } = summarize(reporter.entries);
  if (!values.quiet)
    console.error(`content rules: ${errors} error(s), ${warnings} warning(s)`);
  process.exitCode = errors > 0 ? 1 : 0;
}
