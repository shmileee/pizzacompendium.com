// The block registry: one export line per block, named after the block. To
// add one (hero, steps, ...), add its file and a line here; nothing else
// changes. See `markdown/renderer.mjs` for what a block receives.
export { default as flour } from './flour.mjs';
export { default as flours } from './flours.mjs';
export { default as gallery } from './gallery.mjs';
export { default as local } from './local.mjs';
export { default as note } from './note.mjs';
export { default as q } from './q.mjs';
export { default as tip } from './tip.mjs';
export { default as warning } from './warning.mjs';
