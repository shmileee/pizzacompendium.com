import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, it } from 'node:test';
import zlib from 'node:zlib';
import {
  createHandler,
  describeError,
  describeUrl,
  listen,
  parsePort,
} from '../scripts/lib/serve.mjs';
import { failing } from './helpers/fake-fs.mjs';
import { call, fakeResponse, rawRequest, withServer } from './helpers/http.mjs';
import { createTree } from './helpers/repo.mjs';

/** A small site: pages, assets of every kind, a secret next to it. */
function site(extra = {}) {
  const tree = createTree();
  tree.write('site/index.html', '<h1>home</h1>');
  tree.write('site/en/index.html', '<h1>en</h1>');
  tree.write('site/404.html', '<h1>gone</h1>');
  tree.write('site/a b/index.html', 'spaced');
  tree.write('site/h#sh/index.html', 'hash');
  tree.write('site/file.unknown', 'bytes');
  tree.write('site/UPPER.CSS', 'a{}');
  tree.write('site/.hidden', 'dot');
  tree.write('secret.txt', 'secret');
  tree.write('site-evil/x.txt', 'evil');
  for (const [name, content] of Object.entries(extra))
    tree.write(name, content);
  return { tree, dist: tree.path('site') };
}

const withSite = async (fn, extra) => {
  const { tree, dist } = site(extra);
  try {
    await fn({ tree, dist, handler: createHandler({ distDir: dist }) });
  } finally {
    tree.cleanup();
  }
};

describe('createHandler: content types', () => {
  const types = {
    'a.html': 'text/html; charset=utf-8',
    'a.css': 'text/css; charset=utf-8',
    'a.js': 'text/javascript; charset=utf-8',
    'a.mjs': 'text/javascript; charset=utf-8',
    'a.json': 'application/json; charset=utf-8',
    'a.xml': 'application/xml',
    'a.txt': 'text/plain; charset=utf-8',
    'a.md': 'text/markdown; charset=utf-8',
    'a.webmanifest': 'application/manifest+json',
    'a.svg': 'image/svg+xml',
    'a.webp': 'image/webp',
    'a.avif': 'image/avif',
    'a.png': 'image/png',
    'a.jpg': 'image/jpeg',
    'a.jpeg': 'image/jpeg',
    'a.gif': 'image/gif',
    'a.ico': 'image/x-icon',
    'a.woff2': 'font/woff2',
    'a.bin': 'application/octet-stream',
    noext: 'application/octet-stream',
    'b.PNG': 'image/png',
  };
  it('sends the type GitHub Pages sends for every extension', async () => {
    const files = Object.fromEntries(
      Object.keys(types).map((name) => [`site/${name}`, 'x']),
    );
    await withSite(({ handler }) => {
      for (const [name, type] of Object.entries(types)) {
        const res = call(handler, `/${name}`);
        assert.equal(res.status, 200, name);
        assert.equal(res.headers['content-type'], type, name);
      }
    }, files);
  });

  it('sends body, length, no-cache and nosniff', async () => {
    await withSite(({ handler }) => {
      const res = call(handler, '/en/index.html');
      assert.equal(res.text, '<h1>en</h1>');
      assert.equal(res.headers['content-length'], 11);
      assert.equal(res.headers['cache-control'], 'no-cache');
      assert.equal(res.headers['x-content-type-options'], 'nosniff');
    });
  });

  it('counts the length in bytes, not characters', async () => {
    await withSite(
      ({ handler }) => {
        assert.equal(call(handler, '/u.txt').headers['content-length'], 4);
      },
      { 'site/u.txt': 'żż' },
    );
  });
});

describe('createHandler: paths', () => {
  it('serves index.html for the root and for a folder with a slash', async () => {
    await withSite(({ handler }) => {
      assert.equal(call(handler, '/').text, '<h1>home</h1>');
      assert.equal(call(handler, '/en/').text, '<h1>en</h1>');
      assert.equal(call(handler, '//en//').text, '<h1>en</h1>');
      assert.equal(call(handler, '/./en/').text, '<h1>en</h1>');
    });
  });

  it('serves the root for a target with no path at all', async () => {
    await withSite(({ handler }) => {
      assert.equal(call(handler, '').text, '<h1>home</h1>');
      assert.equal(call(handler, '?x=1').status, 200);
    });
  });

  it('does not serve a folder that is named index.html', async () => {
    await withSite(
      ({ handler }) => {
        const res = call(handler, '/odd/');
        assert.equal(res.status, 404);
        assert.equal(res.text, '<h1>gone</h1>');
      },
      { 'site/odd/index.html/x.txt': 'x' },
    );
  });

  it('redirects a folder to its slash form and keeps the query', async () => {
    await withSite(({ handler }) => {
      const res = call(handler, '/en?x=1&y=2');
      assert.equal(res.status, 302);
      assert.equal(res.headers.location, '/en/?x=1&y=2');
      assert.equal(res.text, '');
      assert.equal(call(handler, '/en').headers.location, '/en/');
      assert.equal(call(handler, '/en?').headers.location, '/en/?');
      assert.equal(call(handler, '/en?a?b').headers.location, '/en/?a?b');
    });
  });

  it('encodes the redirect target', async () => {
    await withSite(({ handler }) => {
      assert.equal(call(handler, '/a%20b').headers.location, '/a%20b/');
      assert.equal(call(handler, '/h%23sh').headers.location, '/h%23sh/');
      assert.equal(call(handler, '/./en').headers.location, '/en/');
      assert.equal(call(handler, '/a b/').text, 'spaced');
    });
  });

  it('treats a backslash like a slash', async () => {
    await withSite(({ handler }) => {
      assert.equal(call(handler, '/en\\index.html').status, 200);
      assert.equal(call(handler, '/en\\').text, '<h1>en</h1>');
    });
  });

  it('serves the site 404.html with status 404 for an unknown address', async () => {
    await withSite(({ handler }) => {
      const res = call(handler, '/nope');
      assert.equal(res.status, 404);
      assert.equal(res.text, '<h1>gone</h1>');
      assert.equal(res.headers['content-type'], 'text/html; charset=utf-8');
    });
  });

  it('answers 404 for a folder without index.html', async () => {
    await withSite(
      ({ handler }) => {
        assert.equal(call(handler, '/empty/').status, 404);
      },
      { 'site/empty/x.txt': 'x' },
    );
  });

  it('answers a plain 404 when the site has no 404.html', async () => {
    const tree = createTree();
    try {
      tree.write('dist/index.html', 'x');
      const res = call(createHandler({ distDir: tree.path('dist') }), '/no');
      assert.equal(res.status, 404);
      assert.equal(res.text, 'Not found');
      assert.equal(res.headers['content-type'], 'text/plain; charset=utf-8');
      assert.equal(res.headers['content-length'], 9);
    } finally {
      tree.cleanup();
    }
  });

  it('serves dotfiles that exist, as a static file server does', async () => {
    await withSite(({ handler }) => {
      const res = call(handler, '/.hidden');
      assert.equal(res.status, 200);
      assert.equal(res.text, 'dot');
    });
  });

  it('is case sensitive like Pages, whatever the disk does', async () => {
    await withSite(({ handler }) => {
      assert.equal(call(handler, '/UPPER.CSS').status, 200);
      assert.equal(call(handler, '/upper.css').status, 404);
      assert.equal(call(handler, '/EN/').status, 404);
      assert.equal(call(handler, '/EN').status, 404);
    });
  });

  it('refuses an address whose real path differs only in case', async () => {
    // A case-insensitive disk (macOS) reports the stored spelling; a
    // case-sensitive one (Linux) never does, so the disk is faked here.
    await withSite(({ dist }) => {
      const real = fs.realpathSync.native;
      const folded = Object.create(fs);
      folded.realpathSync = Object.assign((file) => fs.realpathSync(file), {
        native: (file) =>
          file.endsWith('upper-link.css')
            ? file.replace('upper-link', 'UPPER-LINK')
            : real(file),
      });
      const handler = createHandler({ distDir: dist, fs: folded });
      assert.equal(call(handler, '/upper-link.css').status, 404);
      assert.equal(call(handler, '/UPPER.CSS').status, 200);
    });
  });

  it('answers 400 for malformed percent-encoding and for NUL', async () => {
    await withSite(({ handler }) => {
      for (const url of ['/%', '/%E0%A4%A', '/%zz', '/a%00b', '/%00']) {
        const res = call(handler, url);
        assert.equal(res.status, 400, url);
        assert.equal(res.text, 'Bad request');
      }
    });
  });
});

/** Like `call`, with request headers. */
function callWith(handler, url, headers, method = 'GET') {
  const res = fakeResponse();
  handler({ method, url, headers }, res);
  return res.result();
}

describe('createHandler: compression', () => {
  const GZIP = { 'accept-encoding': 'gzip' };
  const compressible = {
    'a.html': 'text/html; charset=utf-8',
    'a.css': 'text/css; charset=utf-8',
    'a.js': 'text/javascript; charset=utf-8',
    'a.json': 'application/json; charset=utf-8',
    'a.xml': 'application/xml',
    'a.webmanifest': 'application/manifest+json',
    'a.svg': 'image/svg+xml',
    'a.txt': 'text/plain; charset=utf-8',
    'a.md': 'text/markdown; charset=utf-8',
  };
  const binary = ['a.webp', 'a.png', 'a.woff2', 'a.bin', 'a.ico'];
  const files = Object.fromEntries(
    [...Object.keys(compressible), ...binary].map((name) => [
      `site/${name}`,
      'x'.repeat(500),
    ]),
  );

  it('gzips text for a client that accepts it, and says so', async () => {
    await withSite(({ handler }) => {
      for (const [name, type] of Object.entries(compressible)) {
        const res = callWith(handler, `/${name}`, GZIP);
        assert.equal(res.status, 200, name);
        assert.equal(res.headers['content-encoding'], 'gzip', name);
        assert.equal(res.headers.vary, 'Accept-Encoding', name);
        assert.equal(res.headers['content-type'], type, name);
        assert.equal(res.headers['content-length'], res.body.length, name);
        assert.equal(zlib.gunzipSync(res.body).toString(), 'x'.repeat(500));
        assert.ok(res.body.length < 500, name);
      }
    }, files);
  });

  it('sends text as it is to a client that does not accept gzip', async () => {
    await withSite(({ handler }) => {
      for (const headers of [
        {},
        { 'accept-encoding': 'identity' },
        { 'accept-encoding': 'br, deflate' },
        { 'accept-encoding': 'xgzip' },
        { 'accept-encoding': 'gzipx' },
      ]) {
        const res = callWith(handler, '/a.html', headers);
        assert.equal(res.headers['content-encoding'], undefined);
        assert.equal(res.headers.vary, 'Accept-Encoding');
        assert.equal(res.text, 'x'.repeat(500));
      }
      const plain = call(handler, '/a.css');
      assert.equal(plain.headers['content-length'], 500);
    }, files);
  });

  it('accepts gzip among other encodings', async () => {
    await withSite(({ handler }) => {
      const res = callWith(handler, '/a.html', {
        'accept-encoding': 'br, gzip;q=0.8, deflate',
      });
      assert.equal(res.headers['content-encoding'], 'gzip');
    }, files);
  });

  it('never compresses images, fonts or unknown types', async () => {
    await withSite(({ handler }) => {
      for (const name of binary) {
        const res = callWith(handler, `/${name}`, GZIP);
        assert.equal(res.headers['content-encoding'], undefined, name);
        assert.equal(res.headers.vary, undefined, name);
        assert.equal(res.headers['content-length'], 500, name);
      }
    }, files);
  });

  it('compresses a 404 page and the plain not-found text too', async () => {
    await withSite(({ handler }) => {
      const gone = callWith(handler, '/nope', GZIP);
      assert.equal(gone.status, 404);
      assert.equal(zlib.gunzipSync(gone.body).toString(), '<h1>gone</h1>');
    });
    const tree = createTree();
    try {
      tree.write('dist/index.html', 'x');
      const handler = createHandler({ distDir: tree.path('dist') });
      const res = callWith(handler, '/no', GZIP);
      assert.equal(res.status, 404);
      assert.equal(zlib.gunzipSync(res.body).toString(), 'Not found');
    } finally {
      tree.cleanup();
    }
  });

  it('tells HEAD the length of the compressed body, and sends none', async () => {
    await withSite(({ handler }) => {
      const get = callWith(handler, '/a.html', GZIP);
      const head = callWith(handler, '/a.html', GZIP, 'HEAD');
      assert.equal(head.body, undefined);
      assert.equal(head.headers['content-length'], get.body.length);
      assert.equal(head.headers['content-encoding'], 'gzip');
    }, files);
  });

  it('does it over a real socket too', async () => {
    const { tree, dist } = site(files);
    try {
      await withServer(dist, async ({ url }) => {
        const res = await rawRequest(url, '/a.html', { headers: GZIP });
        assert.equal(res.headers['content-encoding'], 'gzip');
        assert.equal(zlib.gunzipSync(res.buffer).toString(), 'x'.repeat(500));
      });
    } finally {
      tree.cleanup();
    }
  });
});

describe('createHandler: nothing outside the site is reachable', () => {
  it('refuses traversal in every spelling', async () => {
    await withSite(({ handler }) => {
      for (const url of [
        '/../secret.txt',
        '/%2e%2e/secret.txt',
        '/..%2fsecret.txt',
        '/..%5csecret.txt',
        '/..\\secret.txt',
        '/en/../../secret.txt',
        '/../site-evil/x.txt',
        '/../site/../secret.txt',
        '/..',
        '/../',
      ]) {
        const res = call(handler, url);
        assert.equal(res.status, 404, url);
        assert.notEqual(res.text, 'secret', url);
        assert.notEqual(res.text, 'evil', url);
      }
    });
  });

  it('does not follow a link out of the folder', async () => {
    await withSite(({ tree, handler }) => {
      tree.symlink('site/leak.txt', tree.path('secret.txt'));
      tree.symlink('site/leakdir', tree.path('site-evil'));
      tree.symlink('site/dangling', tree.path('missing'));
      for (const url of [
        '/leak.txt',
        '/leakdir/x.txt',
        '/leakdir/',
        '/dangling',
      ]) {
        const res = call(handler, url);
        assert.equal(res.status, 404, url);
        assert.equal(res.text, '<h1>gone</h1>');
      }
    });
  });

  it('follows a link that stays inside the folder', async () => {
    await withSite(({ tree, handler }) => {
      tree.symlink('site/inside', tree.path('site/en'));
      assert.equal(call(handler, '/inside/').text, '<h1>en</h1>');
    });
  });

  it('does not serve a 404.html that is a link out of the folder', async () => {
    const tree = createTree();
    try {
      tree.write('dist/index.html', 'x');
      tree.write('outside.html', 'OUT');
      tree.symlink('dist/404.html', tree.path('outside.html'));
      const res = call(createHandler({ distDir: tree.path('dist') }), '/no');
      assert.equal(res.status, 404);
      assert.equal(res.text, 'Not found');
    } finally {
      tree.cleanup();
    }
  });

  it('works when distDir is itself a link', async () => {
    const { tree } = site();
    try {
      tree.symlink('linked', tree.path('site'));
      const handler = createHandler({ distDir: tree.path('linked') });
      assert.equal(call(handler, '/en/').text, '<h1>en</h1>');
      assert.equal(call(handler, '/../secret.txt').status, 404);
    } finally {
      tree.cleanup();
    }
  });
});

describe('createHandler: methods', () => {
  it('answers HEAD with the headers and no body', async () => {
    await withSite(({ handler }) => {
      const res = call(handler, '/en/', { method: 'HEAD' });
      assert.equal(res.status, 200);
      assert.equal(res.body, undefined);
      assert.equal(res.headers['content-length'], 11);
      assert.equal(res.headers['content-type'], 'text/html; charset=utf-8');
      assert.equal(call(handler, '/nope', { method: 'HEAD' }).status, 404);
    });
  });

  it('refuses every other method with 405 and Allow', async () => {
    await withSite(({ handler }) => {
      for (const method of [
        'POST',
        'PUT',
        'DELETE',
        'OPTIONS',
        'PATCH',
        'get',
      ]) {
        const res = call(handler, '/', { method });
        assert.equal(res.status, 405, method);
        assert.equal(res.headers.allow, 'GET, HEAD');
        assert.equal(res.headers['cache-control'], 'no-cache');
      }
    });
  });
});

describe('createHandler: failures', () => {
  it('answers 500 when the file cannot be read', async () => {
    const { tree, dist } = site();
    try {
      const handler = createHandler({
        distDir: dist,
        fs: failing(fs, { op: 'readFileSync', match: /en.index\.html$/ }),
      });
      const res = call(handler, '/en/');
      assert.equal(res.status, 500);
      assert.equal(res.text, 'Internal error');
      assert.equal(call(handler, '/').status, 200);
    } finally {
      tree.cleanup();
    }
  });

  it('throws ENOENT for a missing folder and ENOTDIR for a file', () => {
    const tree = createTree();
    try {
      tree.write('file', 'x');
      assert.throws(() => createHandler({ distDir: tree.path('nope') }), {
        code: 'ENOENT',
      });
      assert.throws(() => createHandler({ distDir: tree.path('file') }), {
        code: 'ENOTDIR',
      });
    } finally {
      tree.cleanup();
    }
  });

  it('treats a file that vanishes between lookup and stat as not found', async () => {
    const { tree, dist } = site();
    try {
      const handler = createHandler({
        distDir: dist,
        fs: failing(fs, {
          op: 'statSync',
          match: /en.index\.html$/,
          code: 'ENOENT',
        }),
      });
      assert.equal(call(handler, '/en/').status, 404);
    } finally {
      tree.cleanup();
    }
  });
});

describe('a real server', () => {
  it('serves over a socket, with traversal sent as written', async () => {
    const { tree, dist } = site();
    try {
      await withServer(dist, async ({ url }) => {
        const ok = await rawRequest(url, '/en/');
        assert.equal(ok.status, 200);
        assert.equal(ok.body, '<h1>en</h1>');
        const redirect = await rawRequest(url, '/en?x=1');
        assert.equal(redirect.status, 302);
        assert.equal(redirect.headers.location, '/en/?x=1');
        const head = await rawRequest(url, '/', { method: 'HEAD' });
        assert.equal(head.status, 200);
        assert.equal(head.body, '');
        for (const target of ['/../secret.txt', '/%2e%2e/secret.txt']) {
          const res = await rawRequest(url, target);
          assert.equal(res.status, 404, target);
          assert.doesNotMatch(res.body, /secret/);
        }
        assert.equal((await rawRequest(url, '/%')).status, 400);
        assert.equal(
          (await rawRequest(url, '/', { method: 'POST' })).status,
          405,
        );
      });
    } finally {
      tree.cleanup();
    }
  });
});

describe('listen', () => {
  it('resolves with a server on the requested port 0 and stops', async () => {
    const { tree, dist } = site();
    try {
      const server = await listen({
        distDir: dist,
        host: '127.0.0.1',
        port: 0,
      });
      assert.ok(server.address().port > 0);
      await new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      });
    } finally {
      tree.cleanup();
    }
  });

  it('rejects with the reason: no folder, a file, port in use', async () => {
    const { tree, dist } = site();
    try {
      await assert.rejects(
        listen({ distDir: tree.path('x'), host: '127.0.0.1', port: 0 }),
        { code: 'ENOENT' },
      );
      await assert.rejects(
        listen({
          distDir: tree.path('secret.txt'),
          host: '127.0.0.1',
          port: 0,
        }),
        { code: 'ENOTDIR' },
      );
      const first = await listen({ distDir: dist, host: '127.0.0.1', port: 0 });
      try {
        await assert.rejects(
          listen({
            distDir: dist,
            host: '127.0.0.1',
            port: first.address().port,
          }),
          { code: 'EADDRINUSE' },
        );
      } finally {
        first.close();
        first.closeAllConnections();
      }
    } finally {
      tree.cleanup();
    }
  });
});

describe('parsePort', () => {
  it('uses the fallback when nothing is given', () => {
    assert.equal(parsePort(undefined, 8080), 8080);
    assert.equal(parsePort('', 8080), 8080);
  });
  it('accepts 0 to 65535', () => {
    assert.equal(parsePort('0', 1), 0);
    assert.equal(parsePort('65535', 1), 65535);
    assert.equal(parsePort('00080', 1), 80);
  });
  it('rejects the rest with null', () => {
    for (const bad of [
      '65536',
      '99999',
      '-1',
      'abc',
      '1.5',
      ' 80',
      '123456',
      '8e3',
      '0x10',
    ])
      assert.equal(parsePort(bad, 1), null, bad);
  });
});

describe('describeUrl', () => {
  it('prints localhost for the loopback address', () => {
    assert.equal(describeUrl('127.0.0.1', 80), 'http://localhost:80/');
  });
  it('prints other hosts as they are and brackets IPv6', () => {
    assert.equal(describeUrl('0.0.0.0', 8080), 'http://0.0.0.0:8080/');
    assert.equal(describeUrl('::1', 8080), 'http://[::1]:8080/');
  });
});

describe('describeError', () => {
  const where = { host: 'h', port: 9 };
  it('gives one line per cause', () => {
    const lines = ['ENOENT', 'ENOTDIR', 'EADDRINUSE', 'EACCES'].map((code) =>
      describeError({ code }, where),
    );
    assert.equal(new Set(lines).size, 4);
    assert.match(lines[0], /build/);
    assert.match(lines[1], /not a folder/);
    assert.match(lines[2], /PORT=10\b/);
    assert.match(lines[3], /h:9.*EACCES/);
  });
});
