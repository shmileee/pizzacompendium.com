import assert from 'node:assert/strict';
import net from 'node:net';
import { describe, it } from 'node:test';
import { startCli, withCli } from '../helpers/cli.mjs';
import { rawRequest } from '../helpers/http.mjs';
import { withTree } from '../helpers/repo.mjs';

const site = (tree) => tree.write('dist/index.html', '<h1>hi</h1>');

describe('scripts/serve.mjs', () => {
  it('serves dist/ on a free port and says where', async () => {
    await withTree(async (tree) => {
      site(tree);
      await withCli(
        'serve.mjs',
        [],
        { root: tree.root, env: { PORT: 0 } },
        async (cli) => {
          const [line, port] = await cli.waitFor(/localhost:(\d+)\//);
          assert.match(line, /^http|localhost/);
          assert.notEqual(port, '0');
          const res = await rawRequest(`http://127.0.0.1:${port}`, '/');
          assert.equal(res.status, 200);
          assert.equal(res.body, '<h1>hi</h1>');
          assert.match(cli.output().stdout, /^Serving dist\/ on /);
        },
      );
    });
  });

  it('uses HOST', async () => {
    await withTree(async (tree) => {
      site(tree);
      await withCli(
        'serve.mjs',
        [],
        { root: tree.root, env: { PORT: 0, HOST: '0.0.0.0' } },
        async (cli) => {
          await cli.waitFor(/http:\/\/0\.0\.0\.0:\d+\//);
        },
      );
    });
  });

  for (const signal of ['SIGTERM', 'SIGINT'])
    it(`exits cleanly with 0 on ${signal} and lets the open connection go`, async () => {
      await withTree(async (tree) => {
        site(tree);
        const cli = startCli('serve.mjs', [], {
          root: tree.root,
          env: { PORT: 0 },
        });
        const [, port] = await cli.waitFor(/localhost:(\d+)\//);
        // A busy connection must not hold the process open.
        const socket = net.connect(Number(port), '127.0.0.1');
        await new Promise((resolve) => socket.once('connect', resolve));
        socket.on('error', () => {});
        // Half a request: the connection is busy, so only closing it by
        // force lets the server end (close() alone leaves it open).
        await new Promise((resolve) =>
          socket.write('GET / HTTP/1.1\r\nHost: localhost\r\n', resolve),
        );
        await new Promise((resolve) => setTimeout(resolve, 100));
        // A process that does not end is killed, and the test fails.
        const timer = setTimeout(() => cli.child.kill('SIGKILL'), 5000);
        const { code, signal: killedBy } = await cli.stop(signal);
        clearTimeout(timer);
        socket.destroy();
        assert.equal(killedBy, null);
        assert.equal(code, 0);
      });
    });

  it('rejects a PORT that is not a port, without starting', async () => {
    await withTree(async (tree) => {
      site(tree);
      for (const PORT of ['abc', '70000', '-1']) {
        const cli = startCli('serve.mjs', [], {
          root: tree.root,
          env: { PORT },
        });
        const { code } = await cli.exited;
        assert.equal(code, 1, PORT);
        assert.match(
          cli.output().stderr,
          /PORT must be a number from 0 to 65535/,
        );
        assert.equal(cli.output().stdout, '');
      }
    });
  });

  it('explains a missing dist/', async () => {
    await withTree(async (tree) => {
      const cli = startCli('serve.mjs', [], {
        root: tree.root,
        env: { PORT: 0 },
      });
      assert.equal((await cli.exited).code, 1);
      assert.match(cli.output().stderr, /mise run build/);
    });
  });

  it('explains a dist that is a file', async () => {
    await withTree(async (tree) => {
      tree.write('dist', 'x');
      const cli = startCli('serve.mjs', [], {
        root: tree.root,
        env: { PORT: 0 },
      });
      assert.equal((await cli.exited).code, 1);
      assert.match(cli.output().stderr, /not a folder/);
    });
  });

  it('explains a port that is in use', async () => {
    await withTree(async (tree) => {
      site(tree);
      await withCli(
        'serve.mjs',
        [],
        { root: tree.root, env: { PORT: 0 } },
        async (first) => {
          const [, port] = await first.waitFor(/localhost:(\d+)\//);
          const second = startCli('serve.mjs', [], {
            root: tree.root,
            env: { PORT: port },
          });
          assert.equal((await second.exited).code, 1);
          const { stderr } = second.output();
          assert.match(stderr, /already in use/);
          assert.ok(stderr.includes(`PORT=${Number(port) + 1}`));
        },
      );
    });
  });

  it('flushes its coverage when it is stopped', async () => {
    await withTree(async (tree) => {
      site(tree);
      const dir = tree.path('cov');
      const cli = startCli('serve.mjs', [], {
        root: tree.root,
        env: { PORT: 0, NODE_V8_COVERAGE: dir },
      });
      await cli.waitFor(/localhost:/);
      await cli.stop();
      assert.ok(tree.list('cov').some((f) => f.endsWith('.json')));
    });
  });
});
