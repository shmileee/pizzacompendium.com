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
 * Writes the site to a working folder beside `out`, then puts it in place:
 * the old output is moved aside into the same working folder, the new one
 * renamed in, and the working folder deleted. If anything fails the old output
 * is back where it was and nothing is left behind.
 *
 * The working folder is made fresh for every build (`.<name>.build-XXXXXX`,
 * by `mkdtempSync`), so the only things a build ever deletes are `out`, which
 * `checkOutDir` has vetted, and what it made itself: never a folder that merely
 * happens to be called `<out>.tmp` or `<out>.old`, which could be a clone, or
 * the repository itself. A build that crashed half-way leaves its working
 * folder behind, to be removed by hand.
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
  let work = null;
  let aside = false;
  const remove = (dir) => fs.rmSync(dir, { recursive: true, force: true });
  try {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    work = fs.mkdtempSync(
      path.join(path.dirname(out), `.${path.basename(out)}.build-`),
    );
    // Folders inside the working folder get the usual permissions (the
    // working folder itself is private to its owner, as mkdtemp makes it).
    const next = path.join(work, 'new');
    const old = path.join(work, 'old');
    const put = (to, action) => {
      const target = path.join(next, to);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      action(target);
    };
    fs.mkdirSync(next);
    for (const [to, content] of files)
      put(to, (target) => fs.writeFileSync(target, content));
    for (const { from, to } of copies)
      put(to, (target) => fs.copyFileSync(from, target));
    if (fs.existsSync(out)) {
      fs.renameSync(out, old);
      aside = true;
    }
    fs.renameSync(next, out);
    aside = false;
    remove(work);
    return true;
  } catch (error) {
    reporter.error('E_WRITE', `cannot write the output: ${error.code}`, {
      file: out,
    });
    if (work === null) return false;
    try {
      if (aside) fs.renameSync(path.join(work, 'old'), out);
      remove(work);
    } catch (restore) {
      reporter.error(
        'E_WRITE',
        `cannot clean up after it (${aside ? 'the previous output is' : 'what is left is'} in ${work}): ${restore.code}`,
        { file: out },
      );
    }
    return false;
  }
}
