import nodeFs from 'node:fs';
import path from 'node:path';

/** What a build reads from or keeps: the output may not be, or sit in, one. */
const KEPT = ['content', 'static', 'src', 'scripts', 'node_modules', '.git'];

/** Is `child` the same folder as `parent`, or somewhere below it? */
function within(parent, child) {
  const relative = path.relative(parent, child);
  return !(
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  );
}

/**
 * A build replaces `out`, so refuse a folder that could be something else: the
 * repository or a folder around it, one of the folders the build reads, or a
 * folder that is not empty and does not look like a previous build (it has
 * no `.nojekyll`, or it is a checkout: `.git`). `--out .` must never delete
 * the repository, nor `--out ../gh-pages` a clone.
 *
 * @param {object} options
 * @param {typeof nodeFs} options.fs
 * @param {string} options.root Repository root.
 * @param {string} options.out Absolute.
 * @param {import('./diagnostics.mjs').Reporter} options.reporter
 * @returns {boolean} False when it is refused (reported).
 */
export function checkOutDir({ fs, root, out, reporter }) {
  const refuse = (why) => {
    reporter.error('E_OUT_DIR', `${out}: ${why}`);
    return false;
  };
  const base = path.resolve(root);
  if (within(out, base))
    return refuse('that is the repository or a folder around it');
  const kept = KEPT.find((name) => within(path.join(base, name), out));
  if (kept) return refuse(`that is ${kept}/ or inside it`);
  let names;
  try {
    names = fs.readdirSync(out);
  } catch (error) {
    return error.code === 'ENOENT' || refuse(`cannot use it: ${error.code}`);
  }
  if (names.length > 0 && !names.includes('.nojekyll'))
    return refuse(
      'not empty and not a build output (no .nojekyll): refusing to replace it',
    );
  if (names.includes('.git'))
    return refuse('a Git checkout, not a build output: refusing to replace it');
  return true;
}

/**
 * Writes the site to `<out>.tmp`, then puts it in place: the old output is
 * moved aside, the new one renamed in, and the old one deleted. If anything
 * fails the old output is back where it was and nothing is left behind.
 *
 * @param {object} options
 * @param {typeof nodeFs} options.fs
 * @param {string} options.out Absolute.
 * @param {Map<string, string | Buffer>} options.files Contents by path in `out`.
 * @param {{ from: string, to: string }[]} options.copies Files copied as they are.
 * @param {import('./diagnostics.mjs').Reporter} options.reporter
 * @returns {boolean} False when it failed (reported).
 */
export function writeOutput({ fs, out, files, copies, reporter }) {
  const tmp = `${out}.tmp`;
  const old = `${out}.old`;
  const put = (to, action) => {
    const target = path.join(tmp, to);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    action(target);
  };
  const remove = (dir) => fs.rmSync(dir, { recursive: true, force: true });
  let aside = false;
  try {
    remove(tmp);
    remove(old);
    for (const [to, content] of files)
      put(to, (target) => fs.writeFileSync(target, content));
    for (const { from, to } of copies)
      put(to, (target) => fs.copyFileSync(from, target));
    if (fs.existsSync(out)) {
      fs.renameSync(out, old);
      aside = true;
    }
    fs.renameSync(tmp, out);
    aside = false;
    remove(old);
    return true;
  } catch (error) {
    reporter.error('E_WRITE', `cannot write the output: ${error.code}`, {
      file: out,
    });
    try {
      if (aside) fs.renameSync(old, out);
      remove(tmp);
    } catch (restore) {
      reporter.error(
        'E_WRITE',
        `cannot put the previous output back (it is in ${old}): ${restore.code}`,
        { file: out },
      );
    }
    return false;
  }
}
