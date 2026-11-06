// The real `node:fs` with chosen operations made to fail, to exercise the
// error paths at the IO boundaries of the generator (every module that reads or
// writes takes an `fs` option for this). Nothing is faked besides the failure:
// the other calls, and the calls that do not match, reach the real disk, so a
// test uses a real temp tree (`createRepo`) and breaks one operation on it.
//
//   const fs = failing(nodeFs, {
//     op: 'readFileSync',              // a synchronous operation of node:fs
//     match: /site\.json$/,            // which paths (any argument that is a path)
//     code: 'EACCES',                  // `error.code` of what is thrown
//   });
//   const site = loadSite({ fs, root: repo.root, reporter });
//   assert.equal(site, null);
//   assert.deepEqual(codes(reporter), ['E_READ']);
//   assert.equal(fs.count('readFileSync', 'site.json'), 1);   // and it ran once
//
// Only the synchronous operations (`...Sync`, and `realpathSync.native`) are
// wrapped; that is all the generator uses.

import realFs from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Operations whose second argument is a path as well. */
const TWO_PATHS = new Set(['rename', 'copyFile', 'cp', 'link', 'symlink']);

const asPath = (value) => {
  if (typeof value === 'string') return value;
  if (value instanceof URL) return fileURLToPath(value);
  if (value instanceof Uint8Array) return Buffer.from(value).toString();
  return null;
};

/** The path arguments of a call (never the data that is being written). */
function pathsOf(op, args) {
  const count = TWO_PATHS.has(op.replace(/Sync$/, '')) ? 2 : 1;
  return args
    .slice(0, count)
    .map(asPath)
    .filter((arg) => arg !== null);
}

/** A string is part of a path, a regexp a test of it, a function a judge. */
function matcher(match) {
  if (match === undefined) return () => true;
  if (typeof match === 'function') return (paths) => match(...paths);
  if (typeof match === 'string')
    return (paths) => paths.some((file) => file.includes(match));
  // A global regexp remembers where it stopped: use a fresh one.
  const test = new RegExp(match.source, match.flags.replace(/[gy]/g, ''));
  return (paths) => paths.some((file) => test.test(file));
}

/**
 * @typedef {object} Rule
 * @property {string} op The operation, as it is called on `fs`:
 *   `'readFileSync'`, `'lstatSync'`, `'realpathSync.native'`, ...
 * @property {string | RegExp | ((...paths: string[]) => boolean)} [match]
 *   Which calls fail: a string that is part of one of the paths, a regular
 *   expression one of them matches, or a function given the paths. All calls
 *   of the operation when left out. Only the path arguments are looked at
 *   (the first, and for `renameSync`, `copyFileSync`, `cpSync`, `linkSync`
 *   and `symlinkSync` the second).
 * @property {string} [code] `error.code` of the error thrown; `'EIO'` by
 *   default. Typical ones: `ENOENT`, `EACCES`, `EISDIR`, `ENOTDIR`, `EMFILE`.
 * @property {number} [after] Let this many matching calls through first.
 * @property {number} [times] Fail this many matching calls, then stop failing
 *   (default: all of them).
 */

/**
 * @typedef {object} FakeFsExtras
 * @property {{ op: string, path: string | undefined, paths: string[] }[]} calls
 *   Every call made, in order, failed or not.
 * @property {{ op: string, path: string | undefined, code: string }[]} failures
 *   The calls that were made to fail.
 * @property {(op: string, match?: Rule['match']) => number} count How many
 *   times an operation was called (on the paths that match, if given).
 */

/**
 * The given `fs` with the operations of `rules` failing. With no rules it
 * only counts the calls.
 *
 * @param {typeof realFs} fs What to wrap: `import fs from 'node:fs'`.
 * @param {Rule | Rule[]} [rules]
 * @returns {typeof realFs & FakeFsExtras}
 */
export function failing(fs = realFs, rules = []) {
  const list = [rules].flat().map((rule) => {
    const target = rule.op.split('.').reduce((from, key) => from?.[key], fs);
    if (typeof target !== 'function' || !rule.op.includes('Sync'))
      throw new TypeError(
        `${rule.op} is not a synchronous operation of fs: this rule would never fire`,
      );
    return {
      ...rule,
      code: rule.code ?? 'EIO',
      after: rule.after ?? 0,
      times: rule.times ?? Number.POSITIVE_INFINITY,
      matches: matcher(rule.match),
      seen: 0,
      fired: 0,
    };
  });
  const calls = [];
  const failures = [];

  /** `fn` as `name`, failing when a rule says so. */
  const wrap = (fn, name) => {
    const wrapper = (...args) => {
      const paths = pathsOf(name, args);
      calls.push({ op: name, path: paths[0], paths });
      for (const rule of list) {
        if (rule.op !== name || !rule.matches(paths)) continue;
        rule.seen += 1;
        if (rule.seen <= rule.after || rule.fired >= rule.times) continue;
        rule.fired += 1;
        failures.push({ op: name, path: paths[0], code: rule.code });
        throw Object.assign(
          new Error(
            `${rule.code}: simulated failure of ${name} ${paths[0] ?? ''}`,
          ),
          {
            code: rule.code,
            syscall: name.replace(/Sync$/, ''),
            path: paths[0],
          },
        );
      }
      return fn.apply(fs, args);
    };
    // `realpathSync.native` is a property of a function.
    for (const [key, value] of Object.entries(fn))
      if (typeof value === 'function')
        wrapper[key] = wrap(value, `${name}.${key}`);
    return wrapper;
  };

  const extras = {
    calls,
    failures,
    count(op, match) {
      const matches = matcher(match);
      return calls.filter((call) => call.op === op && matches(call.paths))
        .length;
    },
  };
  const wrapped = new Map();
  return new Proxy(fs, {
    get(target, key) {
      if (Object.hasOwn(extras, key)) return extras[key];
      const value = Reflect.get(target, key, target);
      if (
        typeof key !== 'string' ||
        typeof value !== 'function' ||
        !key.endsWith('Sync')
      )
        return value;
      if (!wrapped.has(key)) wrapped.set(key, wrap(value, key));
      return wrapped.get(key);
    },
  });
}

/** The given `fs` that fails nothing and counts every call. */
export const counting = (fs = realFs) => failing(fs, []);
