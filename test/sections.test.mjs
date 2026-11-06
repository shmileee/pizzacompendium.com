import assert from 'node:assert/strict';
import nodeFs from 'node:fs';
import { describe, it } from 'node:test';
import {
  listSections,
  loadSections,
  MAX_LINE_LENGTH,
} from '../scripts/lib/sections.mjs';
import { capture, codes, find, findAll, view } from './helpers/capture.mjs';
import { failing } from './helpers/fake-fs.mjs';
import { withTree } from './helpers/repo.mjs';

const lang = (code, extra = {}) => ({
  code,
  folder: `content/${code}`,
  source: code === 'pl',
  status: 'published',
  ...extra,
});

describe('listSections', () => {
  const list = (tree, folder = 'content/pl') => {
    const reporter = capture();
    const files = listSections({ root: tree.root, folder, reporter });
    return { files, reporter };
  };

  it('lists NN-name.md files in name order, ignoring other files', async () => {
    await withTree((tree) => {
      for (const name of [
        '02-b.md',
        '01-a.md',
        '10-c-3.md',
        'lang.json',
        '.sync.json',
        'notes.txt',
      ])
        tree.write(`content/pl/${name}`, '');
      const { files, reporter } = list(tree);
      assert.deepEqual(files, ['01-a.md', '02-b.md', '10-c-3.md']);
      assert.deepEqual(reporter.entries, []);
    });
  });

  for (const name of [
    'README.md',
    'readme.MD',
    'notes.markdown',
    '1-a.md',
    '01-A.md',
    '01-a b.md',
    '01-a_b.md',
    '01-a.md.bak',
    '01-a.md~',
    '._01-a.md',
    '01-.txt',
    '01-a.MD',
    '001-a.md',
  ]) {
    it(`reports E_SECTION_NAME for ${name}`, async () => {
      await withTree((tree) => {
        tree.write(`content/pl/${name}`, '');
        const { files, reporter } = list(tree);
        assert.deepEqual(files, []);
        assert.deepEqual(view(reporter), [
          {
            level: 'error',
            code: 'E_SECTION_NAME',
            file: `content/pl/${name}`,
          },
        ]);
      });
    });
  }

  it('reports a folder or a link named like a section', async () => {
    await withTree((tree) => {
      tree.write('content/pl/01-a.md/x', '');
      tree.write('real.md', '');
      tree.symlink('content/pl/02-b.md', '../../real.md');
      const { files, reporter } = list(tree);
      assert.deepEqual(files, []);
      assert.deepEqual(codes(reporter), ['E_SECTION_NAME', 'E_SECTION_NAME']);
    });
  });

  it('returns nothing, with the read error, for a missing folder', async () => {
    await withTree((tree) => {
      const { files, reporter } = list(tree, 'content/xx');
      assert.deepEqual(files, []);
      assert.deepEqual(codes(reporter), ['E_READ']);
    });
  });
});

describe('loadSections', () => {
  const load = (tree, languages, fs) => {
    const reporter = capture();
    const content = loadSections({ fs, root: tree.root, languages, reporter });
    return { content, reporter };
  };
  const both = [lang('pl'), lang('en')];

  it('reads one section per source file, in order, for each language', async () => {
    await withTree((tree) => {
      tree.write('content/pl/01-a.md', 'A pl\r\n');
      tree.write('content/pl/02-b.md', 'B pl\n');
      tree.write('content/en/01-a.md', 'A en\n');
      tree.write('content/en/02-b.md', 'B en\n');
      const { content, reporter } = load(tree, both);
      assert.deepEqual(reporter.entries, []);
      assert.deepEqual(content.get('pl'), {
        sections: [
          {
            file: '01-a.md',
            path: 'content/pl/01-a.md',
            text: 'A pl\n',
            fallback: false,
          },
          {
            file: '02-b.md',
            path: 'content/pl/02-b.md',
            text: 'B pl\n',
            fallback: false,
          },
        ],
        extra: [],
      });
      assert.deepEqual(
        content.get('en').sections.map((s) => [s.path, s.text, s.fallback]),
        [
          ['content/en/01-a.md', 'A en\n', false],
          ['content/en/02-b.md', 'B en\n', false],
        ],
      );
    });
  });

  it('falls back to the source text with a warning for a published language', async () => {
    await withTree((tree) => {
      tree.write('content/pl/01-a.md', 'A pl\n');
      tree.write('content/pl/02-b.md', 'B pl\n');
      tree.write('content/en/01-a.md', 'A en\n');
      const { content, reporter } = load(tree, both);
      const [, second] = content.get('en').sections;
      assert.deepEqual(second, {
        file: '02-b.md',
        path: 'content/pl/02-b.md',
        text: 'B pl\n',
        fallback: true,
      });
      assert.deepEqual(view(reporter), [
        { level: 'warning', code: 'W_FALLBACK', file: 'content/en/02-b.md' },
      ]);
    });
  });

  it('falls back quietly for a draft', async () => {
    await withTree((tree) => {
      tree.write('content/pl/01-a.md', 'A\n');
      tree.write('content/en/lang.json', '{}');
      const { content, reporter } = load(tree, [
        lang('pl'),
        lang('en', { status: 'draft' }),
      ]);
      assert.equal(content.get('en').sections[0].fallback, true);
      assert.deepEqual(reporter.entries, []);
    });
  });

  it('turns a fallback warning into an error in strict mode', async () => {
    await withTree((tree) => {
      tree.write('content/pl/01-a.md', 'A\n');
      tree.write('content/en/x', '');
      const reporter = capture({ strict: true });
      loadSections({ root: tree.root, languages: both, reporter });
      assert.equal(find(reporter, 'W_FALLBACK').level, 'error');
    });
  });

  it('lists files the source lacks as extra, and warns for a published language', async () => {
    await withTree((tree) => {
      tree.write('content/pl/01-a.md', 'A\n');
      tree.write('content/en/01-a.md', 'A en\n');
      tree.write('content/en/09-z.md', 'Z\n');
      const { content, reporter } = load(tree, both);
      assert.deepEqual(content.get('en').extra, ['09-z.md']);
      assert.equal(content.get('en').sections.length, 1);
      assert.deepEqual(view(reporter), [
        { level: 'warning', code: 'W_EXTRA_FILE', file: 'content/en/09-z.md' },
      ]);
    });
  });

  it('does not warn about extra files of a draft', async () => {
    await withTree((tree) => {
      tree.write('content/pl/01-a.md', 'A\n');
      tree.write('content/en/09-z.md', 'Z\n');
      const { content, reporter } = load(tree, [
        lang('pl'),
        lang('en', { status: 'draft' }),
      ]);
      assert.deepEqual(content.get('en').extra, ['09-z.md']);
      assert.equal(find(reporter, 'W_EXTRA_FILE'), undefined);
    });
  });

  it('reads a file shared by fallback once', async () => {
    await withTree((tree) => {
      tree.write('content/pl/01-a.md', 'A\n');
      tree.write('content/en/x', '');
      tree.write('content/de/x', '');
      const languages = [lang('pl'), lang('en'), lang('de')];
      const calls = [];
      const fs = {
        ...nodeFs,
        readFileSync: (...args) => {
          calls.push(args[0]);
          return nodeFs.readFileSync(...args);
        },
      };
      const { content } = load(tree, languages, fs);
      assert.equal(content.get('en').sections[0].text, 'A\n');
      assert.equal(calls.filter((file) => file.endsWith('01-a.md')).length, 1);
    });
  });

  it('accepts a line of exactly the limit and refuses one char more', async () => {
    await withTree((tree) => {
      tree.write('content/pl/01-a.md', `${'a'.repeat(MAX_LINE_LENGTH)}\n`);
      assert.ok(load(tree, [lang('pl')]).content);
      tree.write(
        'content/pl/01-a.md',
        `ok\nok\n${'a'.repeat(MAX_LINE_LENGTH + 1)}\n`,
      );
      const { content, reporter } = load(tree, [lang('pl')]);
      assert.equal(content, null);
      assert.deepEqual(view(reporter), [
        {
          level: 'error',
          code: 'E_LINE_TOO_LONG',
          file: 'content/pl/01-a.md',
          line: 3,
        },
      ]);
    });
  });

  it('refuses a too long first line, reported as line 1', async () => {
    await withTree((tree) => {
      tree.write('content/pl/01-a.md', `${'a'.repeat(MAX_LINE_LENGTH + 1)}\n`);
      const { content, reporter } = load(tree, [lang('pl')]);
      assert.equal(content, null);
      assert.equal(find(reporter, 'E_LINE_TOO_LONG').line, 1);
    });
  });

  it('counts CRLF lines as lines, not as characters of the line', async () => {
    await withTree((tree) => {
      tree.write('content/pl/01-a.md', `${'a'.repeat(MAX_LINE_LENGTH)}\r\n`);
      assert.ok(load(tree, [lang('pl')]).content);
    });
  });

  it('returns null and reports an unreadable file once, whoever shows it', async () => {
    await withTree((tree) => {
      tree.write('content/pl/01-a.md', 'A\n');
      tree.write('content/en/x', '');
      const fs = failing(nodeFs, {
        op: 'readFileSync',
        match: 'content/pl/01-a.md',
        code: 'EACCES',
      });
      const { content, reporter } = load(tree, both, fs);
      assert.equal(content, null);
      assert.deepEqual(
        codes(reporter).filter((c) => c === 'E_READ'),
        ['E_READ'],
      );
    });
  });

  it('returns null for invalid UTF-8', async () => {
    await withTree((tree) => {
      tree.write('content/pl/01-a.md', Buffer.from([0xff]));
      const { content, reporter } = load(tree, [lang('pl')]);
      assert.equal(content, null);
      assert.deepEqual(codes(reporter), ['E_ENCODING']);
    });
  });

  it('reads every file before giving up, so every problem is shown', async () => {
    await withTree((tree) => {
      tree.write('content/pl/01-a.md', Buffer.from([0xff]));
      tree.write('content/pl/02-b.md', Buffer.from([0xff]));
      const { reporter } = load(tree, [lang('pl')]);
      assert.equal(findAll(reporter, 'E_ENCODING').length, 2);
    });
  });

  it('treats a missing language folder as one without files, after reporting it', async () => {
    await withTree((tree) => {
      tree.write('content/pl/01-a.md', 'A\n');
      const { content, reporter } = load(tree, both);
      assert.ok(content);
      assert.deepEqual(codes(reporter), ['E_READ', 'W_FALLBACK']);
    });
  });
});
