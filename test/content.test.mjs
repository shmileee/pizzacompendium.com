// The REAL guide: content/, static/, src/ and site.json, copied into a temp
// folder (the originals are only read through that copy, or, for the source
// code of the generator, straight from scripts/). What must hold of the text
// as it is written today: the hard rules, the build, the structure of the
// translations, the strings and the pictures the pages use, the settings.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { imageSize } from 'image-size';
import { missingIcons } from '../scripts/lib/html/head.mjs';
import {
  HERO_SQUARE,
  HERO_TARGETS,
  HERO_WIDE,
  heroBreakpointMismatches,
} from '../scripts/lib/html/hero.mjs';
import { loadLanguages, REQUIRED_UI } from '../scripts/lib/languages.mjs';
import { lintProject } from '../scripts/lib/project.mjs';
import { loadSite } from '../scripts/lib/site-config.mjs';
import { capture, codes, view } from './helpers/capture.mjs';
import { createRealRepo, REAL_ROOT } from './helpers/repo.mjs';

const LANGUAGES = ['pl', 'en', 'uk'];

let repo;
let built;
/** code -> file name -> text of the section. */
const text = {};
/** code -> parsed lang.json. */
const lang = {};

before(() => {
  repo = createRealRepo();
  built = repo.build({ strict: true });
  for (const code of LANGUAGES) {
    lang[code] = repo.readJson(`content/${code}/lang.json`);
    text[code] = {};
    for (const file of repo.list(`content/${code}`))
      if (file.endsWith('.md'))
        text[code][file] = repo.read(`content/${code}/${file}`).toString();
  }
});
after(() => repo?.cleanup());

const files = (code) => Object.keys(text[code]).sort();

/**
 * The lines of a section without its `local` notes (which belong to one
 * language and are exempt from parity), as `{ line, n }`.
 */
function sharedLines(source) {
  const out = [];
  let depth = 0;
  let inLocal = false;
  source.split('\n').forEach((line, at) => {
    const open = /^(:{3,})\s*(\S+)/.exec(line);
    const close = /^:{3,}\s*$/.test(line);
    if (inLocal) {
      if (open) depth++;
      else if (close && --depth === 0) inLocal = false;
      return;
    }
    if (open?.[2] === 'local') {
      inLocal = true;
      depth = 1;
      return;
    }
    out.push({ line, n: at + 1 });
  });
  return out;
}

/** The structure of a section: what must be the same in every language. */
function structure(source) {
  const parts = [];
  for (const { line } of sharedLines(source)) {
    const heading = /^(#{1,6}) .*\{#([\w-]+)\}\s*$/.exec(line);
    if (heading) parts.push(`h${heading[1].length} #${heading[2]}`);
    const block = /^:{3,}\s*(\S+)((?: (?:#[\w-]+|[\w-]+=\S+))*)/.exec(line);
    if (block) parts.push(`block ${block[1]}${block[2]}`);
    else if (/^:{3,}\s*$/.test(line)) parts.push('end');
    // A picture with words in it has one file for each language.
    for (const image of line.matchAll(/!\[[^\]]*\]\((img\/[^)\s]+)/g))
      parts.push(`image ${image[1].replace(/-(?:pl|en|uk)(\.\w+)$/, '$1')}`);
    for (const link of line.matchAll(/\]\((#[\w-]+)/g))
      parts.push(`link ${link[1]}`);
    if (/^\s*([-*+]|\d+[.)])\s/.test(line)) parts.push('item');
    if (/^\s*\|.*\|\s*$/.test(line)) parts.push('row');
  }
  return parts;
}

describe('the real content: rules and build', () => {
  it('breaks no hard rule, and has no warning either', () => {
    const reporter = capture();
    lintProject({ root: repo.root, reporter });
    assert.deepEqual(view(reporter), []);
  });

  it('builds in strict mode without a single diagnostic', () => {
    assert.deepEqual(view(built.reporter), []);
    assert.equal(built.ok, true);
  });

  it('writes a page for every language, the root page and the 404 page', () => {
    const output = repo.list('dist');
    for (const code of LANGUAGES)
      assert.ok(output.includes(`${code}/index.html`), code);
    for (const file of ['index.html', '404.html', 'sitemap.xml', 'robots.txt'])
      assert.ok(output.includes(file), file);
  });

  it('publishes the three languages, pl being the source', () => {
    const loaded = loadLanguages({ root: repo.root, reporter: capture() });
    assert.deepEqual(
      loaded.languages.map((l) => l.code).sort(),
      [...LANGUAGES].sort(),
    );
    assert.equal(loaded.source.code, 'pl');
    for (const language of loaded.languages)
      assert.equal(language.status, 'published', language.code);
  });

  it('gives each language page one h1 and the contents of every h2', () => {
    for (const code of LANGUAGES) {
      const html = repo.read(`dist/${code}/index.html`).toString();
      assert.equal((html.match(/<h1[ >]/g) ?? []).length, 1, code);
      const h2 = (html.match(/<h2 id=/g) ?? []).length;
      const toc = (html.match(/<li class="toc-chapter">/g) ?? []).length;
      assert.ok(h2 > 5, code);
      assert.equal(toc, h2, code);
    }
  });

  it('still catches an injected violation of each kind of rule', () => {
    for (const [code, line, expected] of [
      ['en', 'Great!! pizza.', 'E_EXCLAMATION_CHAIN'],
      ['en', 'See https://example.com now.', 'E_EXTERNAL_LINK'],
      [
        'en',
        'It is sold in Poland.',
        'E_COUNTRY_SPECIFIC_REMARK_OUTSIDE_LOCAL_BLOCK',
      ],
      ['en', 'It costs 25 zł.', 'E_NON_DOLLAR_CURRENCY'],
      ['en', 'Buy it at the shop where to buy.', 'E_RETAILER_OR_WHERE_TO_BUY'],
      ['en', 'Nice :) pizza.', 'E_SMILEY'],
      ['en', 'Wait 5-6 minutes.', 'E_HYPHEN_RANGE_USE_EN_DASH'],
      ['en', 'The color of dough.', 'W_EN_AMERICAN_SPELLING'],
      ['uk', "П'ять хвилин.", 'E_UK_ASCII_APOSTROPHE'],
    ]) {
      const bent = createRealRepo(['content']);
      try {
        const file = `content/${code}/00-intro.md`;
        bent.edit(file, (original) => `${original}\n${line}\n`);
        const reporter = capture();
        lintProject({ root: bent.root, reporter });
        assert.ok(
          codes(reporter).includes(expected),
          `${line}: ${codes(reporter)}`,
        );
      } finally {
        bent.cleanup();
      }
    }
  });

  it('refuses a local note that sits in the wrong language, in the real text', () => {
    const bent = createRealRepo(['content']);
    try {
      bent.edit(
        'content/en/00-intro.md',
        (original) => `${original}\n::: local lang=pl Tytuł\nTekst.\n:::\n`,
      );
      const reporter = capture();
      lintProject({ root: bent.root, reporter });
      assert.ok(
        codes(reporter).some((c) => c.startsWith('E_')),
        codes(reporter).join(),
      );
    } finally {
      bent.cleanup();
    }
  });
});

/** The `local` notes of a section that are for another language. */
const misplacedLocal = (code, source) =>
  [...source.matchAll(/^:{3,}\s*local\b(.*)$/gm)]
    .filter((m) => !new RegExp(`^\\s+lang=${code}(\\s|$)`).test(m[1]))
    .map((m) => m[0]);

describe('the scan of the structure (so that the checks below can fail)', () => {
  it('sees headings, blocks, images, links, items and rows', () => {
    assert.deepEqual(
      structure(
        '## A {#a}\n\n::: q #x Why?\n![i](img/p-en.webp) [l](#a)\n- one\n| a |\n:::\n',
      ),
      [
        'h2 #a',
        'block q #x',
        'image img/p.webp',
        'link #a',
        'item',
        'row',
        'end',
      ],
    );
  });

  it('leaves the local notes out, however long', () => {
    const source = 'a\n::: local lang=en T\n- x\n::: tip\nhi\n:::\n:::\n- y\n';
    assert.deepEqual(structure(source), ['item']);
  });

  it('finds a local note for another language, or without one', () => {
    assert.deepEqual(misplacedLocal('en', '::: local lang=en T\n:::\n'), []);
    assert.deepEqual(misplacedLocal('en', '::: local lang=pl T\n:::\n'), [
      '::: local lang=pl T',
    ]);
    assert.deepEqual(misplacedLocal('en', '::: local T\n:::\n'), [
      '::: local T',
    ]);
    assert.deepEqual(misplacedLocal('en', '::: local lang=eng T\n:::\n'), [
      '::: local lang=eng T',
    ]);
  });

  it('notices a missing id or block', () => {
    assert.notDeepEqual(structure('## A {#a}\n'), structure('## A {#b}\n'));
    assert.notDeepEqual(
      structure('::: tip\nx\n:::\n'),
      structure('::: note\nx\n:::\n'),
    );
  });
});

describe('the real content: the translations mirror the source', () => {
  it('has the same section files in every language', () => {
    for (const code of ['en', 'uk'])
      assert.deepEqual(files(code), files('pl'), code);
    assert.ok(files('pl').length >= 10);
  });

  it('has the same structure in every section: headings and ids, blocks, images, links, items, rows', () => {
    for (const file of files('pl')) {
      const source = structure(text.pl[file]);
      assert.ok(source.length > 0, file);
      for (const code of ['en', 'uk'])
        assert.deepEqual(
          structure(text[code][file]),
          source,
          `${code}/${file}`,
        );
    }
  });

  it('has local notes only in the language they are for (there are none today)', () => {
    for (const code of LANGUAGES)
      for (const file of files(code))
        assert.deepEqual(
          misplacedLocal(code, text[code][file]),
          [],
          `${code}/${file}`,
        );
  });

  it('marks the same flour cards for beginners in every language', () => {
    const marks = (source) =>
      [...source.matchAll(/^:{3,}\s*flour\s(.*)$/gm)].map((m) =>
        /\blevel=beginner\b/.test(m[1]),
      );
    let cards = 0;
    for (const file of files('pl')) {
      const source = marks(text.pl[file]);
      cards += source.length;
      for (const code of ['en', 'uk'])
        assert.deepEqual(marks(text[code][file]), source, `${code}/${file}`);
    }
    assert.ok(cards > 10);
    assert.ok(Object.values(text.pl).some((s) => /level=beginner/.test(s)));
  });

  it('has the headings the two hero buttons lead to, in every language', () => {
    for (const code of LANGUAGES) {
      const ids = new Set(
        Object.values(text[code]).flatMap((source) =>
          [...source.matchAll(/^#{2,3} .*\{#([\w-]+)\}\s*$/gm)].map(
            (m) => m[1],
          ),
        ),
      );
      for (const target of Object.values(HERO_TARGETS))
        assert.ok(ids.has(target), `${code}: #${target}`);
    }
  });

  it('links only to ids that exist in the same language', () => {
    for (const code of LANGUAGES) {
      const all = Object.values(text[code]).join('\n');
      const ids = new Set([
        ...[...all.matchAll(/\{#([\w-]+)\}\s*$/gm)].map((m) => m[1]),
        ...[...all.matchAll(/^:{3,}\s*q\s+#([\w-]+)/gm)].map((m) => m[1]),
        'top',
      ]);
      const targets = [
        ...[...all.matchAll(/\]\(#([\w-]+)/g)].map((m) => m[1]),
        ...[...all.matchAll(/^\[[^\]]+\]:\s*#([\w-]+)/gm)].map((m) => m[1]),
      ];
      assert.ok(targets.length > 10, code);
      assert.deepEqual(
        [...new Set(targets.filter((id) => !ids.has(id)))],
        [],
        code,
      );
    }
  });
});

/** The keys the generator reads from `ui`, found in its source. */
function usedUiKeys() {
  const used = new Set();
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.name.endsWith('.mjs'))
        scan(fs.readFileSync(file, 'utf8'), file);
    }
  };
  const scan = (source, file) => {
    for (const m of source.matchAll(/\bui\.(\w+)/g)) used.add(m[1]);
    for (const m of source.matchAll(/\bui\[['"](\w+)['"]\]/g)) used.add(m[1]);
    for (const m of source.matchAll(/\btext\(['"](\w+)['"]\)/g)) used.add(m[1]);
    // The strings of the search dialog: [data attribute, key] pairs.
    if (file.endsWith(path.join('html', 'search.mjs')))
      for (const m of source.matchAll(/\['\w+', '(\w+)'\]/g)) used.add(m[1]);
  };
  walk(path.join(REAL_ROOT, 'scripts', 'lib'));
  return used;
}

describe('the real content: the strings of the interface', () => {
  const OPTIONAL = new Set(['translationNote']);
  const used = usedUiKeys();

  it('finds the keys the templates read (the scan itself works)', () => {
    for (const key of [
      'toc',
      'search',
      'tip',
      'warning',
      'beginner',
      'heroStart',
      'searchCount',
      'expandAll',
      'shortName',
    ])
      assert.ok(used.has(key), key);
    assert.ok(used.size > 30);
  });

  it('defines every key the templates use in every language', () => {
    for (const code of LANGUAGES)
      for (const key of used)
        if (!OPTIONAL.has(key))
          assert.equal(typeof lang[code].ui[key], 'string', `${code}.${key}`);
  });

  it('defines no key that nothing uses, in any language', () => {
    for (const code of LANGUAGES)
      assert.deepEqual(
        Object.keys(lang[code].ui).filter((key) => !used.has(key)),
        [],
        code,
      );
  });

  it('defines every key the source language must define', () => {
    for (const key of REQUIRED_UI)
      assert.equal(typeof lang.pl.ui[key], 'string', key);
  });

  it('has the same keys in every language, bar the optional ones', () => {
    const keys = (code) =>
      Object.keys(lang[code].ui)
        .filter((k) => !OPTIONAL.has(k))
        .sort();
    for (const code of ['en', 'uk'])
      assert.deepEqual(keys(code), keys('pl'), code);
  });

  it('has no empty string', () => {
    for (const code of LANGUAGES)
      for (const [key, value] of Object.entries(lang[code].ui))
        assert.ok(value.trim().length > 0, `${code}.${key}`);
  });

  it('keeps the placeholders of the filter status in every language', () => {
    for (const code of LANGUAGES) {
      assert.ok(lang[code].ui.filterStatus.includes('{shown}'), code);
      assert.ok(lang[code].ui.filterStatus.includes('{total}'), code);
    }
  });
});

describe('the real pictures', () => {
  /** The pictures the text asks for, as `img/<file>`. */
  const referenced = () => {
    const refs = new Set();
    for (const code of LANGUAGES)
      for (const source of Object.values(text[code])) {
        for (const m of source.matchAll(/!\[[^\]]*\]\((img\/[^)\s]+)/g))
          refs.add(m[1]);
        for (const m of source.matchAll(
          /^:{3,}\s*flour\s+(?:\S+=\S+\s+)*?img=(\S+)/gm,
        ))
          refs.add(`img/${m[1]}`);
      }
    return refs;
  };
  const site = () => repo.readJson('site.json');
  const documented = () => new Set([HERO_WIDE, HERO_SQUARE, site().ogImage]);
  const onDisk = () => repo.list('static/img').map((file) => `img/${file}`);
  /** `img/x-480w.webp` is a smaller copy of `img/x.webp`. */
  const original = (file) => file.replace(/-\d+w(\.\w+)$/, '$1');

  it('finds the pictures the text uses (the scan itself works)', () => {
    assert.ok(referenced().size > 20);
    assert.ok([...referenced()].some((href) => href.includes('flour-')));
  });

  it('has every picture the text uses, in every language', () => {
    for (const href of referenced())
      assert.ok(fs.existsSync(path.join(repo.root, 'static', href)), href);
  });

  it('has every picture of the hero and of the preview', () => {
    for (const href of documented())
      assert.ok(fs.existsSync(path.join(repo.root, 'static', href)), href);
  });

  it('uses every picture of static/img, or says why it is there', () => {
    const wanted = new Set([...referenced(), ...documented()]);
    const unused = onDisk().filter((file) => !wanted.has(original(file)));
    assert.deepEqual(unused, []);
  });

  it('has a smaller copy only for a picture that is wider than it', () => {
    for (const file of onDisk()) {
      const width = Number(/-(\d+)w\.\w+$/.exec(file)?.[1]);
      if (!width) continue;
      const big = imageSize(
        fs.readFileSync(path.join(repo.root, 'static', original(file))),
      );
      const small = imageSize(
        fs.readFileSync(path.join(repo.root, 'static', file)),
      );
      assert.equal(small.width, width, file);
      assert.ok(width < big.width, file);
    }
  });

  it('has a preview image of the usual 1.91 to 1', () => {
    const { width, height } = imageSize(
      fs.readFileSync(path.join(repo.root, 'static', site().ogImage)),
    );
    assert.ok(Math.abs(width / height - 1.91) < 0.02, `${width}x${height}`);
    assert.ok(width >= 1200);
  });
});

describe('the real settings and styles', () => {
  it('has a site.json the generator accepts, on https', () => {
    const reporter = capture();
    const site = loadSite({ root: repo.root, reporter });
    assert.deepEqual(codes(reporter), []);
    assert.match(site.siteUrl, /^https:\/\/[^/]+$/);
    assert.ok(site.themeColors.length >= 1);
  });

  it('has the icons the head and the manifest name', () => {
    assert.deepEqual(missingIcons(repo.list('static')), []);
  });

  it('spells the two breakpoints of the hero in the stylesheet as the template does', () => {
    const css = repo.read('src/css/32-hero.css').toString();
    assert.deepEqual(heroBreakpointMismatches(css), []);
  });

  it('has a stylesheet for the page: every file of src/css ends up in the build', () => {
    const built = repo.read('dist/assets/style.css').toString();
    for (const file of repo.list('src/css'))
      assert.ok(
        built.length > fs.statSync(path.join(repo.root, 'src/css', file)).size,
        file,
      );
  });
});
