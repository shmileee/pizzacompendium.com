// The entry script. Every module wires itself to the page here, in this
// order; a module does nothing until its init() runs. The modules are loaded
// one by one so that one that fails to load (a lost request, a blocked file)
// cannot take the others with it: the ones that arrived start, and the page
// goes back to what it is without scripts (the inline contents, no dead
// buttons), because a control that does nothing is worse than none.
//
// Ctrl or Cmd with K, the keys of the search (`wantsSearch` in search.js),
// may be pressed before the modules are there: the press is kept from the
// browser and handed to the search once it listens (it does nothing when the
// search did not load).
let asked = null;
const keep = (event) => {
  const command = event.ctrlKey || event.metaKey;
  if (event.code === 'KeyK' && command && !event.altKey && !event.shiftKey) {
    event.preventDefault();
    asked = event;
  }
};
document.addEventListener('keydown', keep);

const loaded = await Promise.allSettled([
  import('./js/theme.js'),
  import('./js/lang.js'),
  import('./js/toc.js'),
  import('./js/progress.js'),
  import('./js/search.js'),
  import('./js/faq.js'),
  import('./js/cards.js'),
]);

for (const result of loaded)
  if (result.status === 'fulfilled') result.value.init();

document.removeEventListener('keydown', keep);
if (asked) {
  const { key, code, ctrlKey, metaKey } = asked;
  document.dispatchEvent(
    new KeyboardEvent('keydown', {
      key,
      code,
      ctrlKey,
      metaKey,
      bubbles: true,
      cancelable: true,
    }),
  );
}

if (loaded.some((result) => result.status === 'rejected'))
  document.documentElement.classList.remove('js');
