import { reportProblems } from './diagnostics.mjs';
import { isObject, readJson } from './files.mjs';

// What content/rules.json says, read and checked. Dependency-free: the
// content linter runs from a commit hook without `marked`.

const RULES_FILE = 'content/rules.json';

const RULE_KEYS = new Set([
  'id',
  'level',
  'message',
  'patterns',
  'flags',
  'view',
  'languages',
  'localExempt',
  'skip',
  'allow',
]);

const RULE_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const isStrings = (value) =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

/**
 * @typedef {object} Rule
 * @property {string} id
 * @property {'error' | 'warning'} level
 * @property {string} message
 * @property {RegExp[]} regexps Global, one per pattern: a match of any is a
 *   hit. (They are not joined into one expression: a numbered back-reference
 *   in one would point at the wrong group.)
 * @property {string | null} view
 * @property {Set<string> | null} languages
 * @property {boolean} localExempt
 * @property {RegExp | null} skip
 * @property {Set<string>} allow
 *
 * @typedef {{ views: Map<string, [RegExp, string][]>, rules: Rule[] }} RuleSet
 */

/**
 * Reads and checks `content/rules.json`:
 *
 *   views  named ways to cut a line down before a rule looks at it: a list
 *          of { "replace": regex, "with": text } steps, or of names of
 *          views defined earlier. A rule without a view sees the whole line.
 *   rules  [{ id, level ("error" | "warning"), message, patterns (regex
 *          sources, any may match), flags ("i", "u", ...), view, languages
 *          (codes the rule applies to), localExempt (not applied inside
 *          `::: local` blocks), skip (regex: lines to leave alone), allow
 *          (matches that are fine) }]
 *
 * A typo in this file would silently switch a rule off, so every key,
 * regex and view name is checked.
 *
 * @param {Omit<Parameters<typeof readJson>[0], 'rel'>} options
 * @returns {RuleSet | null} Null after reporting.
 */
export function loadRules(options) {
  const data = readJson({ ...options, rel: RULES_FILE });
  if (data === undefined) return null;
  const { set, problems } = compileRules(data);
  return reportProblems(options.reporter, 'E_RULES', problems, RULES_FILE)
    ? set
    : null;
}

/**
 * The pure core of `loadRules`: no files, no reporter.
 *
 * @param {any} data The parsed `rules.json`.
 * @returns {{ set: RuleSet, problems: import('./diagnostics.mjs').Problem[] }}
 */
export function compileRules(data) {
  const set = { views: new Map(), rules: [] };
  const problems = [];
  if (!isObject(data) || !Array.isArray(data.rules)) {
    problems.push({
      field: 'rules',
      message: 'rules.json must be an object with a "rules" list',
    });
    return { set, problems };
  }
  for (const [name, steps] of Object.entries(data.views ?? {}))
    set.views.set(name, compileSteps(name, steps, set.views, problems));
  const seen = new Set();
  data.rules.forEach((raw, index) => {
    const rule = compileRule(raw, index, set.views, problems);
    if (!rule) return;
    if (seen.has(rule.id))
      problems.push({
        field: `rules.${rule.id}`,
        message: `rule "${rule.id}" is defined twice`,
      });
    seen.add(rule.id);
    set.rules.push(rule);
  });
  return { set, problems };
}

function regex(source, flags, field, problems) {
  try {
    return new RegExp(source, flags);
  } catch (error) {
    problems.push({
      field,
      message: `${field}: invalid regex (${error.message})`,
    });
    return null;
  }
}

function compileSteps(name, steps, views, problems) {
  const field = `views.${name}`;
  const bad = (message) =>
    problems.push({ field, message: `${field}: ${message}` });
  if (!Array.isArray(steps)) {
    bad('must be a list');
    return [];
  }
  const out = [];
  for (const step of steps) {
    if (typeof step === 'string' && views.has(step)) {
      out.push(...views.get(step));
    } else if (typeof step === 'string') {
      bad(`unknown view "${step}" (use views defined earlier)`);
    } else if (
      isObject(step) &&
      typeof step.replace === 'string' &&
      typeof step.with === 'string'
    ) {
      const re = regex(step.replace, 'g', field, problems);
      if (re) out.push([re, step.with]);
    } else {
      bad('a step is a view name or { "replace": ..., "with": ... }');
    }
  }
  return out;
}

/** @returns {Rule | null} Null when the rule is unusable. */
function compileRule(raw, index, views, problems) {
  const before = problems.length;
  if (!isObject(raw)) {
    problems.push({
      field: `rules[${index}]`,
      message: `rule ${index + 1}: must be an object`,
    });
    return null;
  }
  const id = typeof raw.id === 'string' ? raw.id : `rules[${index}]`;
  const bad = (key, message) =>
    problems.push({
      field: `rules.${id}.${key}`,
      message: `rule "${id}": ${message}`,
    });
  if (typeof raw.id !== 'string' || !RULE_ID.test(raw.id))
    bad('id', '"id" must be lower-case words joined by "-"');
  for (const key of Object.keys(raw))
    if (!RULE_KEYS.has(key)) bad(key, `unknown key "${key}"`);
  if (!['error', 'warning'].includes(raw.level))
    bad('level', '"level" must be "error" or "warning"');
  if (typeof raw.message !== 'string' || !raw.message)
    bad('message', '"message" is required');
  if (!isStrings(raw.patterns) || raw.patterns.length === 0)
    bad('patterns', '"patterns" must be a list of regex sources');
  if (raw.flags !== undefined && !/^[imsu]*$/.test(raw.flags))
    bad('flags', '"flags" may use i, m, s and u');
  if (raw.view !== undefined && !views.has(raw.view))
    bad('view', `unknown view "${raw.view}"`);
  if (raw.languages !== undefined && !isStrings(raw.languages))
    bad('languages', '"languages" must be a list of codes');
  if (raw.localExempt !== undefined && typeof raw.localExempt !== 'boolean')
    bad('localExempt', '"localExempt" must be true or false');
  if (raw.skip !== undefined && typeof raw.skip !== 'string')
    bad('skip', '"skip" must be a regex source');
  if (raw.allow !== undefined && !isStrings(raw.allow))
    bad('allow', '"allow" must be a list of strings');
  if (problems.length > before) return null;

  const flags = raw.flags ?? '';
  const field = `rules.${id}`;
  const regexps = raw.patterns.map((pattern) =>
    regex(pattern, `${flags}g`, `${field}.patterns`, problems),
  );
  const skip =
    raw.skip === undefined
      ? null
      : regex(raw.skip, flags, `${field}.skip`, problems);
  if (regexps.includes(null) || (raw.skip !== undefined && !skip)) return null;
  return {
    id,
    level: raw.level,
    message: raw.message,
    regexps,
    view: raw.view ?? null,
    languages: raw.languages ? new Set(raw.languages) : null,
    localExempt: raw.localExempt === true,
    skip,
    allow: new Set(raw.allow ?? []),
  };
}
