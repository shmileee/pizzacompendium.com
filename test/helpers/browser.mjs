// A window, a document and a Storage for code that is written for the browser
// and has to run in Node: the inline scripts of the generator and the pure
// parts of `src/js/`. They are plain objects with just enough of the real
// thing, and they record what the code did to them.
//
//   const win = fakeWindow({ languages: ['de', 'uk-UA'], saved: 'pl' });
//   redirect(['pl', 'uk'], 'pl', LANG_KEY, win);
//   assert.deepEqual(win.replaced, ['pl/']);
//
// To MEASURE the coverage of an inline script, call its function directly, as
// above. `runInline` evaluates the TEXT the page gets (`inlineScript(...)`) in
// a fresh context, to show that this text does the same: V8 does not count
// code that runs that way towards the file it came from.

import vm from 'node:vm';
import { LANG_KEY } from '../../scripts/lib/inline-scripts.mjs';

const denied = () => {
  throw Object.assign(new Error('access to storage is denied'), {
    name: 'SecurityError',
  });
};

/**
 * A `Storage` that remembers its items in a map. With `throws` every call
 * fails with a `SecurityError`, as `localStorage` does where site data is
 * blocked.
 *
 * @param {{ items?: Record<string, string>, throws?: boolean }} [options]
 */
export function fakeStorage({ items = {}, throws = false } = {}) {
  const map = new Map(Object.entries(items));
  if (throws)
    return {
      getItem: denied,
      setItem: denied,
      removeItem: denied,
      clear: denied,
      key: denied,
      get length() {
        return denied();
      },
    };
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => void map.set(key, String(value)),
    removeItem: (key) => void map.delete(key),
    clear: () => map.clear(),
    key: (index) => [...map.keys()][index] ?? null,
    get length() {
      return map.size;
    },
    /** What is stored, as a plain object (not part of the real interface). */
    dump: () => Object.fromEntries(map),
  };
}

/**
 * A window with what the redirect script of the root page reads.
 *
 * @param {object} [options]
 * @param {string[] | null} [options.languages] `navigator.languages`; `null`
 *   leaves it out, as an old browser does.
 * @param {string} [options.language] `navigator.language`.
 * @param {string | null} [options.saved] What is stored under `key`.
 * @param {string} [options.key] The storage key (the real `LANG_KEY`).
 * @param {boolean} [options.throwStorage] Storage that refuses every call.
 * @param {string} [options.search] `location.search`, e.g. `?utm=1`.
 * @param {string} [options.hash] `location.hash`, e.g. `#faq-stone`.
 * @returns {object} The window; `win.replaced` lists the addresses given to
 *   `location.replace`, `win.window` is the window itself.
 */
export function fakeWindow({
  languages = [],
  language,
  saved = null,
  key = LANG_KEY,
  throwStorage = false,
  search = '',
  hash = '',
} = {}) {
  const replaced = [];
  const win = {
    navigator: {
      ...(languages !== null && { languages }),
      ...(language !== undefined && { language }),
    },
    localStorage: fakeStorage({
      items: saved === null ? {} : { [key]: saved },
      throws: throwStorage,
    }),
    location: { search, hash, replace: (url) => replaced.push(url) },
    replaced,
  };
  win.window = win;
  return win;
}

/** A document whose `<html>` records the classes added to it. */
export function fakeDocument() {
  const classes = new Set();
  return {
    documentElement: {
      classList: {
        add: (name) => void classes.add(name),
        contains: (name) => classes.has(name),
        names: () => [...classes],
      },
    },
  };
}

/**
 * Evaluates the text of an inline script (`inlineScript(fn, args, globals)`)
 * with `globals` as its global object, e.g. `{ window: fakeWindow() }` or
 * `{ document: fakeDocument() }`.
 *
 * @param {string} script
 * @param {Record<string, any>} globals
 * @returns {unknown}
 */
export const runInline = (script, globals) =>
  vm.runInNewContext(script, globals);
