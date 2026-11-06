// Helpers every module shares. Nothing here touches the page
// when it is imported.

// The names things are remembered under. `scripts/lib/inline-scripts.mjs`
// uses the same text for the keys its inline scripts read (the build checks).
export const LANG_KEY = 'pizzacompendium-lang';
export const THEME_KEY = 'pizzacompendium-theme';

/** The first element of `root` that matches, or null. */
export const query = (selector, root = document) =>
  root.querySelector(selector);

/** Every element of `root` that matches, as an array. */
export const queryAll = (selector, root = document) => [
  ...root.querySelectorAll(selector),
];

/**
 * `localStorage` that never throws. Where storage is blocked (a private
 * window, site data switched off) it is empty and keeps nothing: the page
 * simply does not remember.
 */
export const storage = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Blocked or full: the choice is not remembered, nothing else changes.
    }
  },
};

/**
 * @param {(...args: any[]) => void} fn
 * @param {number} ms
 * @returns {(...args: any[]) => void} `fn`, run once `ms` after the last call.
 */
export function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/**
 * The id a URL fragment names (`#faq-stone` gives `faq-stone`), or an empty
 * string when there is none or it is not valid percent-encoding.
 *
 * @param {string} hash `location.hash`
 * @returns {string}
 */
export function fragmentId(hash) {
  try {
    return decodeURIComponent(hash.slice(1));
  } catch {
    return '';
  }
}

/**
 * The element a URL fragment names, or null.
 *
 * @param {Document} root
 * @param {string} hash `location.hash` or a link's `hash`
 * @returns {HTMLElement | null}
 */
export const byFragment = (root, hash) => root.getElementById(fragmentId(hash));

const LATIN_MARKS = /(\p{Script=Latin})\p{M}+/gu;
const APOSTROPHES = /[’‘ʼ`´]/g;
const LETTERS = { ł: 'l', ø: 'o', đ: 'd', ß: 'ss', æ: 'ae', œ: 'oe' };

/**
 * Text as a search compares it: lower case, the accents of Latin letters
 * gone (`mąka` and `maka` are the same word, `ł` is `l`, `ß` is `ss`), a
 * typewriter apostrophe for every curly one, and every run of white space
 * (no-break spaces included) one space. Cyrillic letters keep their marks, so
 * `й` stays `й`.
 *
 * @param {string} text
 * @returns {string}
 */
export function foldText(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(LATIN_MARKS, '$1')
    .normalize('NFC')
    .replace(/[łøđßæœ]/g, (letter) => LETTERS[letter])
    .replace(APOSTROPHES, "'")
    .replace(/\s+/g, ' ')
    .trim();
}
