import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';
import {
  checkPages,
  checkPolicy,
  cspMeta,
  scriptHash,
} from '../scripts/lib/csp.mjs';
import { capture, view } from './helpers/capture.mjs';

const sha = (text) =>
  `'sha256-${createHash('sha256').update(text).digest('base64')}'`;

/** A page the generator could have written, around `body`. */
const page = (body = '<p>hi</p>', { head = '', scripts = [] } = {}) =>
  `<!doctype html>\n<html lang="en"><head>${cspMeta(scripts)}${head}</head><body>${body}</body></html>\n`;

describe('scriptHash', () => {
  it('is the sha256 of the text as a CSP source', () => {
    assert.equal(scriptHash('a()'), sha('a()'));
  });

  it('hashes CRLF and CR text as LF, as a browser reads it', () => {
    assert.equal(scriptHash('a\r\nb\rc'), sha('a\nb\nc'));
    assert.equal(scriptHash('a\r\nb'), scriptHash('a\nb'));
  });
});

describe('cspMeta', () => {
  it('is one meta tag with the strict policy', () => {
    const meta = cspMeta([]);
    assert.match(
      meta,
      /^<meta http-equiv="Content-Security-Policy" content="[^"]+">$/,
    );
    const policy = /content="([^"]*)"/.exec(meta)[1].split('; ');
    assert.deepEqual(policy, [
      "default-src 'none'",
      "script-src 'self'",
      "style-src 'self'",
      "img-src 'self'",
      "font-src 'self'",
      "manifest-src 'self'",
      "connect-src 'self'",
      "base-uri 'none'",
      "form-action 'none'",
    ]);
  });

  it('allows each inline script by its hash, and nothing else inline', () => {
    const meta = cspMeta(['one()', 'two()']);
    assert.ok(
      meta.includes(`script-src 'self' ${sha('one()')} ${sha('two()')};`),
    );
    assert.doesNotMatch(meta, /unsafe/);
  });
});

describe('checkPolicy: a good page', () => {
  it('has no problems', () => {
    assert.deepEqual(checkPolicy(page()), []);
  });

  it('accepts an inline script that has its hash in the policy', () => {
    const body = '<p>x</p><script>go()</script>';
    assert.deepEqual(checkPolicy(page(body, { scripts: ['go()'] })), []);
  });

  it('accepts an inline script written with CRLF when the hash is of LF', () => {
    const html = page('<script>a\r\nb</script>', { scripts: ['a\nb'] });
    assert.deepEqual(checkPolicy(html), []);
  });

  it('accepts a local script, local links, fragments and srcset', () => {
    const body =
      '<a href="#a">x</a><a href="../en/?x=1#b">y</a>' +
      '<img src="img/a.webp" srcset="img/a-480w.webp 480w, img/a.webp 2x">' +
      '<script type="module" src="../assets/app.js?v=abc"></script>';
    assert.deepEqual(checkPolicy(page(body)), []);
  });

  it('accepts a flag attribute and closing tags', () => {
    assert.deepEqual(
      checkPolicy(page('<details open><summary>a</summary></details>')),
      [],
    );
  });

  it('does not flag attribute VALUES that merely contain x= or on', () => {
    const body =
      '<p title="a onclick=b x=1">t</p><a href="#a" aria-label="onload=1">x</a>' +
      '<img alt="style=&quot;x&quot;" src="img/a.webp">';
    // `&` in a value is fine for alt; the address attributes stay local.
    assert.deepEqual(checkPolicy(page(body)), []);
  });

  it('allows meta and link in the head', () => {
    const head = '<meta name="x" content="y"><link rel="icon" href="x.png">';
    assert.deepEqual(checkPolicy(page('<p>x</p>', { head })), []);
  });

  it('does not read text between tags, only a bare less-than in it', () => {
    assert.deepEqual(checkPolicy(page('<p>2 > 1, onclick=x</p>')), []);
    assert.equal(checkPolicy(page('<p>1 < 2</p>')).length, 1);
  });
});

describe('checkPolicy: what it refuses', () => {
  const problems = (body, options) => checkPolicy(page(body, options));

  it('checks the address attributes of the body tag itself', () => {
    const html = page('').replace('<body>', '<body href="https://x.test/">');
    assert.equal(checkPolicy(html).length, 1);
  });

  it('wants a policy', () => {
    const html =
      '<!doctype html>\n<html lang="en"><head></head><body></body></html>';
    assert.deepEqual(checkPolicy(html), ['no Content-Security-Policy']);
  });

  it('wants the page to start with the doctype and <html>', () => {
    const html = page().replace('<!doctype html>\n', '');
    assert.equal(checkPolicy(html).length, 1);
    assert.equal(checkPolicy(`\n${page()}`).length, 1);
  });

  it('refuses an inline script without a hash in the policy', () => {
    assert.equal(problems('<script>evil()</script>').length, 1);
    assert.equal(
      problems('<script>evil()</script>', { scripts: ['other()'] }).length,
      1,
    );
  });

  it('refuses an inline script that was changed after it was hashed', () => {
    const html = page('<script>go()</script>', { scripts: ['go()'] }).replace(
      'go()</script>',
      'go();</script>',
    );
    assert.equal(checkPolicy(html).length, 1);
  });

  it('refuses a script with no policy to hash against', () => {
    const html =
      '<!doctype html>\n<html><head></head><body><script>x()</script></body></html>';
    assert.equal(checkPolicy(html).length, 2);
  });

  it('refuses a script that is never closed', () => {
    assert.equal(problems('<script>go()').length, 1);
    assert.match(problems('<script>go()')[0], /never closed/);
  });

  it('refuses a script from outside the site', () => {
    for (const src of [
      'https://evil.example/x.js',
      '//evil.example/x.js',
      'data:text/javascript,1',
    ]) {
      assert.equal(problems(`<script src="${src}"></script>`).length, 1, src);
    }
  });

  for (const attribute of [
    'onclick="x()"',
    'onerror="x()"',
    'ONCLICK="x()"',
    'onfocus',
    'style="color:red"',
    'srcdoc="b"',
  ]) {
    it(`refuses ${attribute}`, () => {
      const found = problems(`<p ${attribute}>x</p>`);
      assert.equal(found.length, 1);
      assert.match(found[0], /attribute/);
    });
  }

  for (const [name, body] of [
    [
      'quotes jammed against the next attribute',
      '<p id="x"onclick="a()">x</p>',
    ],
    ['a slash where a space belongs', '<img/onerror="a()" src="img/a.webp">'],
    ['a slash before an attribute', '<p/onclick="a()">x</p>'],
    ['single quotes', "<p onclick='a()'>x</p>"],
    ['an unquoted value', '<p onclick=a()>x</p>'],
    ['a comment', '<!-- hi --><p>x</p>'],
    ['a stray less-than', '<p>x</p><3 >'],
    ['a newline between attributes', '<p\nonclick="a()">x</p>'],
    ['a tab between attributes', '<p\tonclick="a()">x</p>'],
    ['a quote inside a value', '<p title="a"b">x</p>'],
  ]) {
    it(`stops at markup the generator does not write: ${name}`, () => {
      const found = problems(body);
      assert.ok(
        found.some((problem) => /does not write/.test(problem)),
        found.join('|'),
      );
    });
  }

  it('reads no further after the first strange tag', () => {
    const found = problems('<!-- x --><p onclick="a()">x</p>');
    assert.equal(found.length, 1);
  });

  for (const name of [
    'style',
    'iframe',
    'frame',
    'frameset',
    'object',
    'embed',
    'applet',
    'base',
  ]) {
    it(`refuses <${name}> anywhere`, () => {
      assert.equal(problems(`<${name}>`).length, 1);
      assert.equal(
        checkPolicy(page('<p>x</p>', { head: `<${name}>` })).length,
        1,
      );
    });
  }

  it('refuses a meta refresh and a link in the body', () => {
    const refresh = problems(
      '<meta http-equiv="refresh" content="0;url=//evil">',
    );
    assert.equal(refresh.length, 1);
    assert.match(refresh[0], /<meta>/);
    assert.match(problems('<link rel="x" href="y">')[0], /<link>/);
  });

  for (const [attribute, value] of [
    ['href', 'https://evil.example/'],
    ['href', 'HTTP://evil.example/'],
    ['href', '//evil.example/'],
    ['href', 'javascript:alert(1)'],
    ['href', 'jav&#x61;script:alert(1)'],
    ['href', '\\\\evil.example'],
    ['src', 'https://evil.example/a.png'],
    ['action', 'https://evil.example/'],
    ['formaction', 'x?a&b'],
    ['data', 'data:text/html,x'],
    ['poster', 'https://evil.example/a.png'],
    ['xlink:href', 'https://evil.example/'],
    ['ping', 'https://evil.example/'],
    ['HREF', 'https://evil.example/'],
    ['srcset', 'https://evil.example/a.png 1x'],
    ['srcset', 'a.png 1x, https://evil.example/b.png 2x'],
    ['srcset', 'a.png 1y'],
    ['srcset', 'a.png 1x 2x'],
  ]) {
    it(`refuses ${attribute}="${value}" in the body`, () => {
      const found = problems(`<a ${attribute}="${value}">x</a>`);
      assert.equal(found.length, 1);
      assert.match(found[0], /leaves the site/);
    });
  }

  it('lets the head name outside addresses it must (not checked in the head)', () => {
    const head = '<link rel="canonical" href="https://example.com/en/">';
    assert.deepEqual(checkPolicy(page('<p>x</p>', { head })), []);
  });

  it('collects several problems of one page', () => {
    assert.equal(
      problems('<p onclick="a()" style="x">x</p><a href="https://e.x/">y</a>')
        .length,
      3,
    );
  });

  it('reads a srcset with an empty descriptor list as local', () => {
    assert.deepEqual(problems('<img srcset="a.webp">'), []);
  });
});

describe('checkPages', () => {
  it('reports E_CSP on the page, per problem', () => {
    const reporter = capture();
    checkPages(
      new Map([
        ['a/index.html', page()],
        ['b/index.html', page('<p onclick="x()">x</p>')],
      ]),
      reporter,
    );
    assert.deepEqual(view(reporter), [
      { level: 'error', code: 'E_CSP', file: 'b/index.html' },
    ]);
  });

  it('reports nothing for good pages', () => {
    const reporter = capture();
    checkPages(new Map([['a/index.html', page()]]), reporter);
    assert.deepEqual(reporter.entries, []);
  });
});
