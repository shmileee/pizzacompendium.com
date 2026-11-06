// The command lines of the generator (`scripts/*.mjs`) run as the processes
// they are, on a temp tree: exit code, stdout and stderr are what a test
// asserts. Reach for it only where the process is the point (the exit code,
// what is printed, a signal): everything else is tested through the functions.
//
//   const repo = createRepo();
//   const args = ['--format', 'json'];
//   const run = runCli('lint-content.mjs', args, { root: repo.root });
//   assert.equal(run.status, 0);
//   assert.deepEqual(run.json(), []);
//
// `root` is required, and is the folder the script works on (it becomes
// `COMPENDIUM_ROOT`). It must be a temp tree: `build.mjs` writes `dist/`,
// `new-language.mjs` and `i18n.mjs sync` write into `content/`. `root: null`
// runs the script on the repository it lives in, which is only for reading
// (`lint-content.mjs`) and for the tests of that default.
//
// The child gets a clean environment: `PATH` from this process, `TZ=UTC` and
// `LC_ALL=C`, and what `env` adds. In particular `GITHUB_ACTIONS`, `HOST`,
// `PORT` and `COMPENDIUM_ROOT` of the machine that runs the tests are not
// passed on: on CI the first one would switch the default `--format` to
// `github`. `env: { NAME: undefined }` removes a name. `NODE_V8_COVERAGE` is
// the one exception, and not by this file: Node hands it to every process it
// spawns, whatever `env` says, so the coverage of the child is merged into the
// report of `mise run coverage`.

import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';

const SCRIPTS = path.resolve(import.meta.dirname, '../../scripts');

/** What a child inherits from the process that runs the tests. */
const INHERITED = ['PATH'];

/**
 * @param {Record<string, string | number | undefined>} [extra]
 * @returns {Record<string, string>}
 */
export function cliEnv(extra = {}) {
  const env = { TZ: 'UTC', LC_ALL: 'C' };
  for (const name of INHERITED)
    if (process.env[name] !== undefined) env[name] = process.env[name];
  for (const [name, value] of Object.entries(extra)) {
    if (value === undefined) delete env[name];
    else env[name] = String(value);
  }
  return env;
}

/** `build.mjs` is `scripts/build.mjs`; an absolute path is used as it is. */
function scriptPath(script) {
  return path.isAbsolute(script) ? script : path.join(SCRIPTS, script);
}

function spawnOptions({ root, cwd, env }) {
  if (root === undefined)
    throw new TypeError(
      'give { root }: a temp tree (repo.root), or null to run on the real repository',
    );
  return {
    cwd: cwd ?? root ?? process.cwd(),
    env: cliEnv({ ...(root && { COMPENDIUM_ROOT: root }), ...env }),
  };
}

/**
 * Runs a script to the end.
 *
 * @param {string} script Name under `scripts/`, e.g. `build.mjs`.
 * @param {string[]} [args]
 * @param {object} options
 * @param {string | null} options.root The tree the script works on.
 * @param {string} [options.cwd] The working directory (default: `root`).
 * @param {Record<string, string | number | undefined>} [options.env]
 * @param {number} [options.timeout] Milliseconds before it is killed and the
 *   call throws (30 seconds by default; SIGKILL, so a hang cannot outlive it).
 * @returns {{
 *   status: number | null,
 *   signal: string | null,
 *   stdout: string,
 *   stderr: string,
 *   json: () => any,
 * }} `json()` parses stdout (`--format json`) and throws when it is no JSON.
 */
export function runCli(script, args = [], options = {}) {
  const { timeout = 30_000 } = options;
  const result = spawnSync(process.execPath, [scriptPath(script), ...args], {
    ...spawnOptions(options),
    timeout,
    killSignal: 'SIGKILL',
    encoding: 'utf8',
  });
  if (result.error) throw result.error;
  return {
    status: result.status,
    signal: result.signal,
    stdout: result.stdout,
    stderr: result.stderr,
    json: () => JSON.parse(result.stdout),
  };
}

/**
 * Starts a script that keeps running (the preview server) and lets the test
 * talk to it. Stop it with `stop()`, or use `withCli`.
 *
 *   const cli = startCli('serve.mjs', [], { root: repo.root, env: { PORT: 0 } });
 *   const [, port] = await cli.waitFor(/localhost:(\d+)/);
 *   ...
 *   const { code } = await cli.stop();      // SIGTERM, waits for the exit
 *
 * @param {string} script
 * @param {string[]} [args]
 * @param {Parameters<typeof runCli>[2]} [options] `root`, `cwd`, `env`.
 */
export function startCli(script, args = [], options = {}) {
  const child = spawn(process.execPath, [scriptPath(script), ...args], {
    ...spawnOptions(options),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const output = { stdout: '', stderr: '' };
  const watchers = new Set();
  for (const stream of ['stdout', 'stderr']) {
    child[stream].setEncoding('utf8');
    child[stream].on('data', (chunk) => {
      output[stream] += chunk;
      for (const check of watchers) check();
    });
  }
  const exited = new Promise((resolve) => {
    child.once('close', (code, signal) => {
      for (const check of watchers) check();
      resolve({ code, signal });
    });
  });
  let done = false;
  exited.then(() => {
    done = true;
  });
  return {
    child,
    /** Everything printed so far. */
    output: () => ({ ...output }),
    exited,
    /**
     * Resolves with the match once `pattern` appears in the output of
     * `stream`; rejects (with the output) when the script ends first or
     * nothing matches within `timeout` milliseconds.
     *
     * @param {RegExp} pattern
     * @param {{ stream?: 'stdout' | 'stderr', timeout?: number }} [wait]
     * @returns {Promise<RegExpExecArray>}
     */
    waitFor(pattern, { stream = 'stdout', timeout = 10_000 } = {}) {
      return new Promise((resolve, reject) => {
        const fail = (why) => {
          clean();
          reject(
            new Error(
              `${why} while waiting for ${pattern}\nstdout: ${output.stdout}\nstderr: ${output.stderr}`,
            ),
          );
        };
        const check = () => {
          const match = pattern.exec(output[stream]);
          if (match) {
            clean();
            resolve(match);
          } else if (done || child.exitCode !== null) fail('the script ended');
        };
        const timer = setTimeout(() => fail('timed out'), timeout);
        const clean = () => {
          clearTimeout(timer);
          watchers.delete(check);
        };
        watchers.add(check);
        check();
      });
    },
    /**
     * Sends a signal (SIGTERM by default) and waits for the exit; a script
     * that ignores it is killed after `killAfter` (5 seconds), so a hang fails the test
     * instead of the run.
     */
    stop(signal = 'SIGTERM', killAfter = 5_000) {
      if (!done && child.exitCode === null) {
        child.kill(signal);
        const timer = setTimeout(() => child.kill('SIGKILL'), killAfter);
        exited.then(() => clearTimeout(timer));
      }
      return exited;
    },
  };
}

/**
 * Runs `fn` with a started script and always stops it afterwards.
 *
 * @template T
 * @param {string} script
 * @param {string[]} args
 * @param {Parameters<typeof runCli>[2]} options
 * @param {(cli: ReturnType<typeof startCli>) => T | Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withCli(script, args, options, fn) {
  const cli = startCli(script, args, options);
  try {
    return await fn(cli);
  } finally {
    await cli.stop();
  }
}
