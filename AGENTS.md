# Pizza Compendium

A static, multilingual (pl, en, uk) guide to making pizza at home, published at
<https://pizzacompendium.com> on GitHub Pages. Markdown in, plain HTML and CSS
out, with a small script (`src/js/`: theme, language picker, table of contents,
reading progress, search, FAQ, product cards). Two npm dependencies (`marked`,
`image-size`), and adding one needs a good reason. It follows the owner's other
repositories: mise for tools and tasks, prek for hooks, Biome, rumdl, Renovate.
When in doubt, do what they do.

## Layout

*   `content/<lang>/NN-*.md`, `content/<lang>/lang.json` — the text, one folder
    per language: numbered section files plus the language name, page title and
    UI strings. `content/pl/` is the source (`"source": true`).
*   `content/rules.json` — the hard content rules as data: what the text must
    never contain. `content/<lang>/.sync.json` records which translated files
    match the current source (written by `mise run i18n:sync`)
*   `scripts/` — the command lines (`build.mjs`, `serve.mjs`,
    `new-language.mjs`, `i18n.mjs`, `lint-content.mjs`); `scripts/lib/` — the
    generator, one small module per job: `build.mjs` (the pipeline),
    `language-page.mjs` (one language's sections, rendered into its page),
    `output.mjs` (the output folder: what may be replaced, the atomic swap),
    `files.mjs` (the one place a file is read), `project.mjs` (the languages and
    sections every command starts from), `markdown/` (the `:::` container
    extension and its syntax in `container-syntax.mjs`, `fences.mjs` for code
    and comments, heading, image and link rules), `blocks/` (one module per
    block; registering a new block is one export line in `blocks/index.mjs`),
    `html/` (page, root, 404, head, header, language list, icon sprite, hero,
    search, table of contents, footer), `rules.mjs` (reads
    `content/rules.json`), `content-rules.mjs` and `parity.mjs` (the hard
    rules), `i18n-sync.mjs`, `images.mjs`, `assets.mjs`, `seo.mjs`, `csp.mjs`
    and `inline-scripts.mjs`
*   `src/` — `css/` (the stylesheet in pieces, joined in file-name order:
    `00-tokens` `05-fonts` `10-base` `20-layout` `22-header` `24-toc`
    `26-wayfinding` `30-prose` `32-hero` `34-cards` `36-faq` `38-gallery`
    `40-search` `45-root` `90-print` `95-motion`; a colour is a token written
    once as `light-dark()`), `js/` (one ES module per job: `util`, `theme`,
    `lang`, `toc`, `progress`, `search`, `faq`, `cards`; a few pure functions
    plus `init(root)`, nothing runs on import), `app.js` (the entry and the one
    top-level side effect) and `favicon.svg`, copied into `dist/`
*   `static/` — images in `img/` (`hero*.webp` are named by
    `scripts/lib/html/hero.mjs`: a rename must follow; `-480w`/`-800w` copies
    become `srcset`), `fonts/` (Vollkorn woff2, `OFL.txt`) and the app icons
    (`favicon-32.png`, `favicon.ico`, `apple-touch-icon.png`, `icon-*.png`; a
    missing one is `E_STATIC_ICON`), copied as is. `CNAME` is ignored by the
    Pages Actions deployment; the custom domain is set in the repository
    settings.
*   `tools/images/` — derived images (own `package.json` with `sharp`):
    `mise run images` makes the `-480w`/`-800w` copies, `og.jpg` and the icons
    and never rewrites a master
*   `site.json` — `siteUrl` (canonical URLs, `hreflang`, the sitemap, the
    manifests), `ogImage` (required) and `themeColor` (equals `--paper`)
*   `mise.toml`, `mise/conf.d/` — Node pin, tool pins and tasks
*   `.github/` — the workflows (`checks.yaml`, `codeql.yaml`,
    `dependency-review.yaml`), `renovate.json` and the tool configs;
    `scripts/ci/` — `smoke.sh` (the smoke test of the live site) and
    `check-workflows.sh` (the workflow invariants, a hook);
    `tools/lighthouse/` — the Lighthouse gate (own `package.json` and lockfile,
    like `e2e/`). See "CI and deploy".
*   `test/` — the unit and integration tests (`node:test`, `*.test.mjs`, one
    file per module, mirroring `scripts/` and `src/js/`) and `test/helpers/`:
    `repo.mjs` (a throwaway compendium on disk), `capture.mjs`, `fake-fs.mjs`,
    `http.mjs`, `cli.mjs` and `browser.mjs`. `e2e/` — the Playwright tests (own
    `package.json` and lockfile, like `tools/lighthouse`): `tests/*.spec.js`,
    and `support/` with the site under test (`site.js`), the fixtures, axe-core
    and the coverage gate (`coverage.mjs`). See "Tests".
*   `dist/` — build output, ignored

## Hard rules

*   **Content is Polish-source.** `content/pl/` is the truth; `en` and `uk`
    mirror it with identical structure: file names, `{#ids}`, `:::` blocks, list
    items, table rows, images and links. Change the Polish, then mirror it. The
    build and `mise run content:lint` fail on any structural difference. A new
    language starts as a draft (`"status": "draft"`) and is published when it is
    complete.
*   **Shared text is country-neutral.** Never refer to the reader's own
    country, nationality or local market: no "in Poland", "Polish pizzerias",
    "our country", no local shops, laws, institutions, units or currency.
    Pizza-specific geography is fine (Italian flours, Neapolitan pizza). A note
    that is genuinely specific to one country or language goes only into that
    language's own file, in a `::: local lang=<code> Title` block. It renders
    only on that language's page and is exempt from the parity rule. The
    rule is enforced by `content/rules.json`; details are in `TRANSLATING.md`.
*   **Style of the text.** No outside links. No shop, retailer or marketplace
    names and no where-to-buy advice. Prices only in US dollars, symbol first:
    `$250` (English adds the thousands comma, `$1,000`). En dashes in numeric
    ranges (`$3–5`). Calm tone: no exclamation chains, smileys or ALL-CAPS.
    British spelling in English. In Ukrainian the apostrophe is U+2019 and the
    quotes are guillemets. These are errors (or, for tone and spelling,
    warnings) in `content/rules.json`: to forbid one more word, add it there.
*   **The site is static and must work under a strict Content-Security-Policy**
    (`default-src 'none'`; images, styles, scripts, fonts and the manifest only
    from `'self'`). No inline styles, no `style=""`, no event-handler
    attributes. The only inline scripts are the three the generator emits (the
    `js` class, the stored theme and the root page's language redirect, all
    functions in `scripts/lib/inline-scripts.mjs`), and each is allowed by its
    SHA-256 hash in the page's policy. The build checks every page against its
    own policy (`checkPolicy`: only tags the generator writes, no handlers or
    styles, no address in the body that leaves the site). Raw HTML in Markdown
    and links other than `#ids` are errors. `static/` holds pictures, fonts,
    text and a manifest only: nothing a browser would run from the site's own
    origin.
*   **The generator is plain functions with seams.** Nothing in `scripts/lib/`
    runs on import, calls `process.exit`, prints or reads the clock: the
    command lines print and set the exit code. A problem is a diagnostic
    (`{ level, code, message, file, line }`) with a stable code, and tests
    assert codes, never messages (a code that covers a family of mistakes, such
    as `E_LANG_META`, also names the `field`). Files are read through
    `files.mjs` only, which refuses symbolic links, non-files, files over 1 MB
    and invalid UTF-8. `lint-content.mjs`, `i18n.mjs`, `new-language.mjs` and
    `serve.mjs` use Node only, so the commit hook works without `npm ci`: keep
    `marked` and `image-size` out of their imports. Every command line works on
    the repository its script is in, or on the folder `COMPENDIUM_ROOT` names:
    that is how the tests run the real scripts on a throwaway tree.
*   **Never commit secrets or personal data.** The repository and the site are
    public.
*   **Tests: 100% coverage of the shipped code** (`scripts/` and the browser
    code in `src/`: lines, branches, functions and statements, in one merged
    report) is enforced by `mise run coverage` and by CI. Dead code is deleted,
    not tested through contortions: no `c8 ignore`, no coverage excludes beyond
    `test/`, `e2e/`, `tools/` and `node_modules/`; a branch no honest test can
    reach goes. Tests are hermetic (a temp tree each, no network, no clock, no
    fixed port, no setting of the machine) and assert the code of a diagnostic,
    never its message. See "Tests".

## Checks

*   Run `mise run lint` before committing. Hooks run with **prek**
    (mise-managed), not `pre-commit`; `mise run prek:install` sets up the Git
    shims after a fresh clone.
*   `mise run build` must pass without warnings you did not expect: it fails on
    broken links, missing images, raw HTML, structure drift between languages
    and every hard content rule, and warns about untranslated or stale files.
    `mise run build:strict` (the build for CI) turns every warning into an
    error; `mise run content:lint` checks the hard rules alone,
    `mise run i18n:status` shows what the translations still owe.
*   Tools are pinned in `mise/conf.d/10-validation.toml` and the Node version in
    `mise.toml`; Renovate bumps them. Never install tools with npm, pip or brew.
*   The text in `content/*.md` is never reformatted by tools: rumdl skips it,
    because the `:::` block syntax and the typographic quotes must stay as
    written. Biome only formats the `lang.json` files and the whitespace fixers
    only trim trailing spaces and end-of-file newlines there. Biome does
    format and lint `src/` (CSS too): run `mise exec -- biome check --write
    src` after editing it.
*   Commit from a shell where mise is activated, or use `mise exec -- git
    commit`: the hooks need the pinned tools on `PATH` (a GUI git client has a
    bare one).
*   Never kill processes by pattern (`pkill -f ...`): other sessions share the
    machine. Start preview servers on a throwaway `PORT` and stop them by PID.

## Tests

*   `mise run test` — the unit and integration tests: `node:test` over
    `test/**/*.test.mjs`. It needs Node and the two packages of the site, so
    CI's `unit tests` job installs nothing else. `npm test` is the same
    command.
*   `mise run e2e` — Playwright in headless Chromium, against the real site,
    built once with `--no-fingerprint` and served on a free port by
    `e2e/support/site.js`. Run `mise run e2e:install` once first (the packages
    of `e2e/` and the browser of the pinned Playwright; CI does the same).
*   `mise run coverage` — both, with one c8 report of `scripts/` and
    `src/**/*.js`: the generator is measured while the unit tests run (the
    command lines and the server they start too), the browser code in the
    browser. It fails below 100% and lists what no test executed; the report is
    `coverage/index.html`, `COVERAGE_OUT=<folder>` keeps runs apart.
*   While writing a test, measure the modules it is about, in a folder of its
    own that is removed afterwards: `mise exec -- node e2e/support/measure.mjs
    -i scripts/lib/files.mjs test/files.test.mjs` prints every line, branch and
    function no test executed, with its code, and exits 1 when there is one.
    The plain c8 form: `mise exec -- e2e/node_modules/.bin/c8 --all --src
    scripts --include scripts/lib/files.mjs --reports-dir <folder>
    --temp-directory <folder>/tmp node --test test/files.test.mjs`.
*   Unit tests: one file per module, `test/<path below scripts/lib>.test.mjs`
    (`test/files.test.mjs`, `test/markdown/fences.test.mjs`), `node:test` with
    `node:assert/strict`, names that read as sentences about behaviour. Build
    the case with `test/helpers/repo.mjs` (`createRepo()` is a minimal valid
    compendium in a temp folder, `withRepo` removes it, `repo.build()` runs the
    real build on it), read diagnostics with `capture.mjs` (`codes`, `find`,
    `view`: by code, level and place), make an operation of `node:fs` fail with
    `fake-fs.mjs` (`failing(fs, { op, match, code })`), call the server with
    `http.mjs`, run a command line with `cli.mjs`
    (`runCli(script, args, { root })`: the child gets a clean environment,
    `PATH`, `COMPENDIUM_ROOT`, `TZ=UTC`, not `GITHUB_ACTIONS`, `PORT` or the
    rest of the machine's) and use `browser.mjs` for code written for the
    browser. A test never reads the real `content/`, `src/` or `static/` except
    to test them: `content-rules.test.mjs` reads the real `content/rules.json`
    (read only), `uiKeys()` the key names of the real `content/pl/lang.json`,
    and `createRealRepo()` copies the real tree. Servers and child processes are
    started with `withServer` and `withCli`, which always stop them: a leaked
    one hangs the whole run.
*   Browser tests: `import { expect, test } from '../support/fixtures.js'`;
    `page.goto('/en/')` goes to the running site. Every test also fails on a
    console error, an uncaught error or a Content-Security-Policy violation
    (`problems.allow(/regex/)` first when it provokes one), and its JavaScript
    coverage is collected when `COVERAGE_DIR` is set. `support/axe.js` audits a
    page against WCAG 2.2 AA. The playwright config pins English, UTC, a light
    page and reduced motion; a spec that needs another says so with
    `test.use(...)`.
*   A test must be able to fail: write the failing case first, or break the
    code in a scratch copy and see it fail. Where `test/helpers.test.mjs` says
    what a helper does, change the helper and that file together.

## CI and deploy

*   **One workflow is the pipeline.** `.github/workflows/checks.yaml` runs on
    pull requests, merge queues, pushes to `main` and by hand: the five checks
    (`lint`, `unit tests`, `end-to-end tests and coverage`, `build`,
    `lighthouse`) in parallel, then `deploy to github pages` and `smoke test the
    live site`. `deploy` needs every check and runs only for `main`, so nothing
    reaches the site without green checks. Nothing else deploys: do not add a
    second workflow that publishes Pages (`check-workflows.sh` fails on it).
*   **A job is one command you can run:** `mise run lint`, `test`, `coverage`,
    `build:strict` and `lighthouse` are the tasks the jobs call, the smoke job
    runs `scripts/ci/smoke.sh` directly (`mise run smoke` wraps the same
    script), and `deploy` exists only on GitHub. Change what a job does by
    changing the task. The workflow only prepares the runner (mise, the
    Playwright browser, caches) and uploads artifacts.
*   **Workflow rules.** actionlint and zizmor, in `mise run lint`, enforce:
    every `uses:` pinned to a full commit SHA with its release in a trailing
    comment (Renovate bumps them), `persist-credentials: false` on every
    checkout, no `pull_request_target` and no `${{ }}` of untrusted input
    inside `run:` (pass it through `env:`). They do not enforce the rest, so
    `scripts/ci/check-workflows.sh` (the `workflow-invariants` hook, also in
    `mise run lint`) does: a job writes only if its `ALLOWED_WRITES` entry says
    so (`deploy` gets `pages` and `id-token`, CodeQL `security-events`; the top
    of a workflow gets none), the job that builds the Pages artifact restores
    no cache (mise's included), `deploy` needs every other job, and only
    `checks.yaml` deploys. A new permission, or a job that stops
    gating the deploy (`NOT_BLOCKING`), is a change to that script, reviewed
    there. No secrets. Kept by convention: mise itself is pinned (`version` of
    every mise step) and so is a remote hook repository (its commit SHA,
    `# frozen:`), `npm ci` runs with `--ignore-scripts`, and `npx --no` never
    fetches a tool.
*   **A re-run publishes only the tip of `main`.** It keeps the commit of the
    run it repeats, so `deploy` fails when that commit is no longer the tip of
    `main` instead of putting an older site over a newer one. To publish again
    use *Run workflow* on `main`, or *Re-run failed jobs* on the newest run;
    not *Re-run all jobs*, which uploads the Pages artifact under a name that
    already exists.
*   **Lighthouse is a gate, not a report.** `tools/lighthouse/run.mjs` serves
    `dist/` with the repository's own server and audits every page of the
    sitemap on mobile: accessibility 100, best practices 95, SEO 95,
    performance 90. A page that falls short is measured once more (annotated,
    never silent); a real regression fails both times. A hung Chrome cannot
    hold the job: a run is killed after 90 seconds and no page starts after 8
    minutes. Lighthouse is a lockfile-pinned npm package of its own, like
    Playwright in `e2e/`, and needs Chrome (`CHROME_PATH`). Fix the page
    instead of lowering a minimum.
*   **The smoke test uses the real domain.** `scripts/ci/smoke.sh` retries while
    the CDN catches up, then checks every published language (`<html lang>`,
    canonical URL, Content-Security-Policy meta tag), `sitemap.xml`,
    `robots.txt`, the site's own 404 page, that `http://` and `www.` redirect,
    and that every file of the deployed artifact, images and fonts included
    (`CNAME` and dotfiles aside), is byte for byte what the site serves. A
    request takes 15 seconds at most and no check starts more than
    `SMOKE_GRACE` seconds after the retries (`SMOKE_TIMEOUT`) end, so the
    report is always written inside the job's timeout. A new language needs no
    change: the languages come from `content/*/lang.json`. A failure fails the
    run but cannot undo the deploy: fix forward or revert.
*   **The `site` artifact of a pull request is untrusted.** The pull request's
    own generator built it, so the Content-Security-Policy and the other
    guarantees of the build do not hold for it. Look at it only through
    `COMPENDIUM_ROOT=<throwaway folder holding it as dist/> node
    scripts/serve.mjs`, in a browser profile you are not signed in with, never
    from disk. Artifacts of a public repository are public: nothing personal.
*   **Settings that are not in git** matter: *Pages → Source: GitHub Actions*,
    the custom domain, *Enforce HTTPS*, and the `github-pages` environment
    limited to `main`. A workflow never changes them. Also worth setting: a
    ruleset for `main` (no deletion or force push, linear history, signed
    commits, the five checks required, but not CodeQL or dependency review,
    which have no `merge_group` trigger), approval of workflow runs for all
    outside contributors (concurrency groups are repository-wide, so a run of
    an edited workflow can cancel a deployment), only GitHub-owned actions and
    `jdx/mise-action` allowed with SHA pinning required, and Dependabot alerts
    on (Renovate's `vulnerabilityAlerts` reads them). Renovate
    (`.github/renovate.json`: grouped actions, grouped tooling, no automerge)
    needs its GitHub App installed on the repository.

## Commits

Conventional commits, lower-case subject, no trailing full stop:
`feat(content): ...`, `fix(build): ...`, `docs: ...`, `test: ...`, `ci: ...`,
`build(deps): ...`, `chore(tooling): ...`. Explain why in the body.

Commits are signed with an SSH key held in 1Password through `op-ssh-sign`.
Never disable signing to get past a failure: approve the 1Password prompt and
rerun the identical `git commit`, or report that 1Password is locked and stop.

**Never add AI attribution** to commits or pull requests: no `Co-Authored-By`
line, no "generated with" footer.
