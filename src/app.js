// The entry script. Every module wires itself to the page here, in this
// order; a module does nothing until its init() runs. The modules are loaded
// one by one so that one that fails to load (a lost request, a blocked file)
// cannot take the others with it: the ones that arrived start, and the page
// goes back to what it is without scripts (the inline contents, no dead
// buttons), because a control that does nothing is worse than none.
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

if (loaded.some((result) => result.status === 'rejected'))
  document.documentElement.classList.remove('js');
