# Pizza Compendium – pizzacompendium.com

A static, multilingual guide to making pizza at home, available in
**Polski, English, Українська**. No framework, no runtime: Markdown → plain
HTML/CSS with small native ES modules for the language picker, theme, table of
contents, search, FAQ and product-card filter. Without JavaScript the guide is
still fully readable and navigable.

Tools are installed and pinned by [mise](https://mise.jdx.dev); git hooks run
through [prek](https://prek.j178.dev). Nothing else needs to be installed.

```sh
mise trust               # once per clone: allow this repository's mise config
mise install             # Node and the lint tools, at the pinned versions
mise run prek:install    # git hooks (once per clone)
mise run build           # → dist/
mise run serve           # build + preview on http://localhost:8080 (PORT=…, HOST=… to change)
mise run lint            # every check, exactly what CI will run
```

More tasks (`mise tasks` lists them all):

```sh
mise run build:strict    # the strict build for CI: every warning is an error
mise run test            # the unit tests (node:test; Node only)
mise run e2e:install     # once: the packages of e2e/ and the Playwright browser
mise run e2e             # the browser tests (Playwright, headless Chromium)
mise run coverage        # every test, one coverage report; fails below 100 %
mise run lighthouse      # Lighthouse (mobile) on the built site; needs Chrome (CHROME_PATH)
mise run smoke           # smoke test of a deployed site (-- <url> for a local preview)
mise run images          # regenerate the derived images (srcset copies, og.jpg, icons; sharp)
mise run content:lint    # the hard content rules only, in a fraction of a second
mise run i18n:status     # which translated files are ok, stale, unconfirmed, untranslated, …
mise run i18n:sync en    # confirm that `en` matches the current Polish text
mise run new-lang de "Deutsch"   # start a language as a draft
```

`mise run build -- --out /tmp/site --no-fingerprint --quiet` passes options to
the build. The commands that report problems (`build`, `content:lint`) take
`--format text|github|json`: the diagnostics are data on stdout in the last two
(`json` is always one complete document, `[]` when all is well), text on stderr
in the first, and the one-line summary is always on stderr.
`COMPENDIUM_ROOT=<folder>` points every script at another tree (the tests use
it); the preview binds `127.0.0.1` unless `HOST` says otherwise.

`dist/` is a self-contained folder you can upload to any static host. All asset
links are relative, so it also works under a sub-path. Canonical URLs,
`hreflang` alternates, `sitemap.xml` and `robots.txt` are generated from
`site.json`.

For search engines, language models and the agents that read the guide for
someone, every published page also carries:

*   **structured data** (JSON-LD, schema.org): the publisher, the site, the page
    as an `Article` (title, description, image, language, the dates of its text,
    the credit, the source page it translates), every FAQ question with its
    answer as a `FAQPage`, and every `::: recipe` block as a `Recipe`. It is
    made from the page's own text, so it cannot say what the page does not.
*   **a Markdown copy**, `<code>/index.md`, linked from the page head: the same
    text as plain Markdown (questions as headings, notes as quotations, full
    addresses on every link and picture), with no markup to wade through.
*   **the dates of its text**: when it first appeared and last changed, read
    from the commits that touched `content/<code>/` (not from the clock: two
    builds of one commit are identical). They go into the structured data,
    `lastmod` in the sitemap and a line in the footer. Without a git history
    there are none; a shallow clone gives none either and the build warns
    (`W_HISTORY_SHALLOW`), which is why CI's build job clones the whole history.

`llms.txt` at the root maps the guide for language models: per language, the
Markdown copy and the address of every section.

## Layout

```text
content/<code>/     one folder per language: lang.json (name, titles, UI strings) + numbered *.md sections
content/pl/         source language ("source": true) – every other language mirrors its files and anchor ids
content/rules.json  the hard content rules: what the text must never contain
static/img/         images (copied to dist/img); the -480w/-800w copies are derived (see tools/images)
static/fonts/       the self-hosted Vollkorn woff2 files and their licence (OFL.txt)
static/             also the app icons (favicon-32.png, favicon.ico, apple-touch-icon.png, icon-*.png)
site.json           siteUrl, ogImage and themeColor: SEO tags, the manifest and the sitemap
src/css/            the stylesheet in pieces, concatenated in file-name order (00 tokens, 05 fonts, 10 base, 20-26 layout, header, contents, wayfinding, 30-38 prose, hero, cards, FAQ, gallery, 40 search, 45 root and 404, 90 print, 95 motion)
src/js/             the browser code, one ES module per job (util, theme, lang, toc, progress, search, faq, cards), each with a pure part and `init()`
src/app.js          the entry: imports the modules and runs their `init()`; src/favicon.svg is the mark
scripts/            build.mjs, serve.mjs, new-language.mjs, i18n.mjs, lint-content.mjs (command lines)
scripts/lib/        the generator: one small module per job
mise.toml, mise/    Node pin, tool pins and tasks
.github/workflows/  checks (every check, deploy, smoke test), CodeQL, dependency review
.github/renovate.json     dependency updates (Renovate)
scripts/ci/         smoke.sh (the smoke test of the live site), check-workflows.sh (workflow invariants)
test/               the unit tests (node:test, one file per module); test/helpers/ builds throwaway trees
e2e/                the browser tests (Playwright) and the coverage gate (own package.json and lockfile)
tools/lighthouse/   the Lighthouse gate (own package.json and lockfile)
tools/images/       derived images: srcset copies, og.jpg, app icons (own package.json with sharp; `mise run images`)
.pre-commit-config.yaml   the hook suite run by prek and by `mise run lint`
AGENTS.md           rules for contributors and coding agents
```

`site.json` holds `siteUrl`, an absolute `https` address without a trailing
slash (and without a user name), and `ogImage`, the preview image as
`img/<file>` (required: link previews and the manifest need one); `themeColor`
is optional, `"#rrggbb"` or `{ "light": "#rrggbb", "dark": "#rrggbb" }`, and
adds `theme-color` tags. It should equal `--paper` of `src/css/00-tokens.css`
in both schemes, so that the browser bar matches the page.

## The page

*   **Hero** at the top of every language page: a `<picture>`
    (`static/img/hero.webp` 1600x840 and `hero-mobile.webp` 1200x900 with their
    `-480w`/`-800w` copies; `scripts/lib/html/hero.mjs` names them, so a rename
    must follow), the page's one `<h1>`, the description and two buttons (first
    pizza, questions).
*   **Header:** the brand, a search button, the theme toggle (auto, light, dark;
    stored under `pizzacompendium-theme`, applied by an inline script before the
    first paint) and the language picker. Below 800 px the contents live in a
    drawer; from there up they are a sticky sidebar that follows the reading
    position. A back-to-top button, the current chapter in the header and a
    reading-progress line help on a long page.
*   **Search** (`/` or Ctrl/Cmd+K): an offline dialog over the text of the page,
    built from the DOM on first use; it matches without accents and opens the
    FAQ answer it points at.
*   **Product cards** (`flours`) have a "for beginners" badge and a filter
    (`level=beginner` on a `flour` block); each FAQ answer has a copy-link
    button. Pictures with the same shape sit in galleries; cut-outs
    (`photo-cutout`) get a plate in dark mode. Print gives a clean, light
    document with every answer open.
*   **Typography at build time:** no-break spaces after one-letter words and
    before units, unbreakable numeric ranges (data in `typography` of
    `lang.json`). Headings are set in Vollkorn, the body in the system font.
*   **Each language has its own** `manifest.webmanifest`.

## How the build works

`mise run build` reads `site.json`, every `content/<code>/lang.json` and
`content/rules.json`, checks them, renders each language's sections with
[marked](https://marked.js.org) plus the `:::` blocks described in
[TRANSLATING.md](TRANSLATING.md), and writes the pages. Every problem is a
diagnostic with a stable code (`E_IMG_MISSING`, `W_STALE`, …), the file and the
line; errors fail the build, warnings do not (`--strict`: they do too, and
GitHub Actions shows them as annotations on the changed files).

*   **The output is replaced atomically.** The site is written to a working
    folder made fresh beside `dist/` (`.dist.build-XXXXXX/`) only when the
    build had no errors, then the old `dist/` is moved into that folder, the
    new one renamed into place and the working folder deleted. If a step fails
    the old `dist/` is put back and nothing is left behind, so a failed build
    never leaves a half-written site. A build deletes nothing but `dist/` and
    the folder it made itself, never a `dist.old/` or `dist.tmp/` that happens
    to be there. (A folder cannot be swapped in one step: a process killed in
    the instant between the two renames leaves no `dist/` and both sites in the
    working folder, to be removed by hand.) `--out` (relative to the
    repository) refuses the repository and the folders around it, `content/`,
    `static/`, `src/`, `scripts/` and anything inside them, a Git checkout,
    and any folder that is not empty and not a previous build (a build has a
    `.nojekyll`).
*   **Hard content rules are errors, always.** `content/rules.json` forbids
    exclamation chains, smileys, outside links, shop names, prices in anything
    but US dollars, country-specific remarks in shared text and more; the
    languages must have the same structure (blocks, ids, headings, lists,
    tables, images, links). `mise run content:lint` and the `content-lint`
    commit hook run the same check without building.
*   **Nothing unsafe reaches the page.** Raw HTML in Markdown is an error, links
    can only point at `#ids` on the same page, ids are letters, digits, `-` and
    `_` (the value of a block attribute may also hold `.` and `/`), images must
    be `img/<file>` and exist with exactly that spelling (GitHub Pages is
    case-sensitive). A symbolic link is an error wherever the generator looks
    (`content/`, `static/`, `src/`, the configuration files, the images), and so
    is any file that is not a regular file, larger than 1 MB (images: 20 MB),
    not valid UTF-8, or a section with a line of more than 10,000 characters.
    `static/` may hold pictures, fonts, text and a manifest only: a page, a
    script or an SVG there would run on the site's own origin, outside the page
    policy. Dotfiles and OS junk are not copied.
*   **A strict Content-Security-Policy ships with every page**, as a `<meta>`
    right after `<meta charset>`: everything from the site's own origin, the
    inline scripts (the `js` class, the stored theme and the root page's
    language redirect) allowed by their SHA-256 hash. The structured data is
    inline too, but a browser never runs it: it needs no hash, and the build
    holds it to plain JSON in the head with no `<` in it. The build checks each
    finished page against its own policy: it must be made of nothing but tags
    the generator writes, with no inline styles, no event-handler attributes, no
    `<iframe>`, `<object>`, `<base>` or `<meta>` in the body and no address in
    the body that leaves the site (the policy cannot stop a redirect or a link,
    this check can). It hashes the script text with `\n` line endings, as a
    browser does, so a Windows checkout builds the same page.
*   **Two builds of the same commit are identical** (the only dates are those of
    the commits that changed the text), and `?v=<hash>` on the stylesheet and
    script URLs changes only when they do (`--no-fingerprint` drops it and
    copies the assets byte for byte).
*   **Drafts.** A language with `"status": "draft"` is built to `dist/<code>/`
    with `noindex`, but is not in the picker, the `hreflang` tags, the sitemap
    or the root redirect. A draft is still **public** once deployed: anyone who
    knows the address can read it, it is only kept out of search engines and
    out of the site's own navigation. Put nothing private in it.
*   **`404.html`** is generated for GitHub Pages (root-absolute assets,
    `noindex`, a way into each language).

## Add a language

```sh
mise run new-lang de "Deutsch"
```

This creates `content/de/` as a **draft**: a copy of the Polish files and of
`lang.json` with `"status": "draft"`. Translate `lang.json` and the `.md` files
(see [TRANSLATING.md](TRANSLATING.md) for syntax, glossary and rules), check
progress with `mise run i18n:status`, read it with `mise run serve` at `/de/`,
and when everything is translated set `"status": "published"` (or delete the
line). Only then do the language picker, the root-page redirect (browser
language / remembered choice), `<html lang>`, `hreflang` tags and the sitemap
include it. A code whose tag has no obvious territory (`xx`) needs an `ogLocale`
such as `"de_DE"` in `lang.json` before it can be published. A published
language that lacks a file shows the Polish text (in a `lang="pl"` wrapper) with
a warning; a file that is still byte for byte the Polish one is a
`W_UNTRANSLATED_COPY` warning.

## Edit content

Edit the Markdown in `content/<code>/`. Change the Polish text → mirror it in
the other languages. The build tells you what to mirror: a changed structure is
an error, and `mise run i18n:sync <code> [files]` records that a translated file
matches the current Polish text, so the build warns (`W_STALE`) when the Polish
file changes afterwards. A translated file of a published language that has
never been confirmed is a warning as well (`W_UNCONFIRMED`), so `build:strict`
fails until every one is.

## Tests

Two suites, one gate. Everything the site ships is tested: the generator and
its command lines in `scripts/`, and the scripts of the browser in `src/`.

*   `mise run test` runs the unit and integration tests, `node:test` over
    `test/**/*.test.mjs`, in a few seconds. Each test builds the case it needs
    in a temp folder (`test/helpers/repo.mjs`: a minimal valid compendium that
    the real build accepts without a diagnostic), so no test depends on the
    text of the real content (only `content/rules.json` is read, and
    the key names of `content/pl/lang.json`), the clock, the network or a
    port, and they run in any order
    and in parallel. They assert the stable code of a diagnostic, never its
    message.
*   `mise run e2e` runs Playwright (headless Chromium) against the real site:
    `e2e/support/site.js` builds it once, without fingerprints, and serves it
    on a free port, and the specs in `e2e/tests/` reach it with
    `page.goto('/en/')`. Every spec also fails on a console error, an uncaught
    error or a Content-Security-Policy violation. Once per machine, `mise run
    e2e:install` installs the packages of `e2e/` and the browser.
*   `mise run coverage` runs both and merges what they executed, Node and the
    browser, into one c8 report of `scripts/` and `src/**/*.js`
    (`coverage/index.html`). It fails below 100 % of lines, branches, functions
    and statements and lists the files and lines no test executed. There are no
    `c8 ignore` comments and no excludes besides the tests themselves: code no
    test can reach is deleted. While writing a test, `mise exec -- node
    e2e/support/measure.mjs -i scripts/lib/files.mjs test/files.test.mjs`
    shows the gaps of the modules it is about, with their code, and nothing
    else.

## CI and deploy to pizzacompendium.com

The site is served by GitHub Pages from the public repository
`shmileee/pizzacompendium.com`. One workflow, `.github/workflows/checks.yaml`,
runs on every pull request, merge queue entry and push to `main`, and by hand.
Its last two stages deploy and test the live site, so **a change reaches
pizzacompendium.com only after every check is green**. Nothing else deploys.

Each job is one command you can run yourself, mostly a mise task (the deploy
exists only on GitHub, and the smoke job calls its script directly):

| job | what it does | reproduce it with |
| --- | --- | --- |
| `lint` | every prek hook on the whole tree: Biome, rumdl, taplo, yamllint, actionlint, zizmor, the workflow invariants (`scripts/ci/check-workflows.sh`), gitleaks, shfmt, shellcheck, the content rules, the Renovate config validator | `mise run lint` |
| `unit tests` | the `node:test` suites | `mise run test` |
| `end-to-end tests and coverage` | the unit tests and Playwright (headless Chromium) with one merged coverage report of `scripts/` and `src/`; fails below 100 %. The coverage report is kept for 14 days; when the job fails, Playwright's results (traces and screenshots, the HTML report if the configuration writes one) are kept for 7 days | `mise run coverage` |
| `build` | the strict build (a warning is an error). On `main` its output is the Pages artifact; on a pull request it is kept for 7 days as the `site` artifact (untrusted, see below). It restores no cache | `mise run build:strict` |
| `lighthouse` | Lighthouse (mobile) on every page of the sitemap, served by the repository's own server: accessibility 100, best practices 95, SEO 95, performance 90. A page that falls short is measured once more and annotated; a hung Chrome cannot hold the job (a run is killed after 90 seconds, no page starts after 8 minutes); the reports are kept for 14 days | `mise run lighthouse` (needs Chrome; `CHROME_PATH` points at one) |
| `deploy to github pages` | publishes the artifact. Needs all five checks and runs only on `main` (a push, or *Run workflow* on `main`); a re-run publishes only the tip of `main` | - |
| `smoke test the live site` | `scripts/ci/smoke.sh` against the real domain, retrying for up to 10 minutes while DNS and the CDN catch up: every language (`<html lang>`, canonical URL, security policy), `sitemap.xml`, `robots.txt`, the site's own 404 page, the `http://` and `www.` redirects, and every file of the deployed artifact (images and fonts too) identical to the live one. A request takes 15 seconds at most and no check starts later than 5 minutes after the retries end, so the report is always written | `mise run smoke` (`-- <url>` for a local preview, `-- --built dist` to compare files) |

Two more workflows watch the repository: `codeql.yaml` (CodeQL for the
JavaScript and for the workflows, on pull requests, on `main` and weekly) and
`dependency-review.yaml` (fails a pull request that brings in a vulnerable
runtime dependency: the packages the site is built with, not the test tooling
in `e2e/` and `tools/`). Neither has a `merge_group` trigger, so never make
them required checks of a merge queue. Renovate (`.github/renovate.json`)
proposes grouped updates on Monday mornings; it needs the Renovate GitHub App
installed on the repository.

A failed smoke test cannot undo a deployment: fix forward or revert the commit.
To publish again without a new commit use *Run workflow* on `main`, or *Re-run
failed jobs* on the newest run of `main` (the artifact is kept for 7 days). A
re-run keeps the commit of the run it repeats, so the deploy job fails, with
the reason, when that commit is no longer the tip of `main`: it never puts an
older site over a newer one. Avoid *Re-run all jobs*: it uploads the Pages
artifact again under the name it already has, and an upload refuses that.

The `site` artifact of a pull request is untrusted: the pull request's own
generator built it, and a pull request can change the generator, so the
Content-Security-Policy and the other guarantees of the build do not hold for
it. To look at it, unpack it as `dist/` in a throwaway folder, serve that with
`COMPENDIUM_ROOT=<folder> node scripts/serve.mjs`, and open it in a browser
profile you are not signed in with, never from disk. Artifacts of a public
repository can be downloaded by anyone, so nothing personal or private goes
into one.

*   **Repository settings** (not in git; a workflow never changes them):
    *Pages → Source: GitHub Actions*, *Custom domain: pizzacompendium.com*, then
    *Enforce HTTPS* once GitHub has issued the certificate. The custom domain is
    a repository setting: `static/CNAME` is copied to `dist/` but ignored by
    Actions deployments. The `github-pages` environment accepts deployments from
    `main` only.
*   **Worth setting** (a review of the CI found them open):
    *   a ruleset for `main`: block deletion and force pushes, a linear history,
        signed commits, and the checks `lint`, `unit tests`,
        `end-to-end tests and coverage`, `build` and `lighthouse` required;
    *   *Settings → Actions → General*: approval for all outside contributors
        (the checks run a pull request's own code, and the concurrency groups
        are repository-wide, so a run of an edited workflow can cancel a
        deployment), only GitHub-owned actions and `jdx/mise-action` allowed,
        and the full-length commit SHA required (every `uses:` already is one);
    *   *Dependabot alerts* on, security updates off: Renovate's
        `vulnerabilityAlerts` reads the alerts, and without them it has
        nothing to read.
*   **DNS (Cloudflare):** the apex `pizzacompendium.com` has four `A` records
    (`185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`)
    and four `AAAA` records (`2606:50c0:8000::153`, `2606:50c0:8001::153`,
    `2606:50c0:8002::153`, `2606:50c0:8003::153`). `www` is a `CNAME` to
    `shmileee.github.io`, which makes GitHub redirect it to the apex. Keep them
    *DNS only* (grey cloud) while GitHub verifies the domain and issues the
    certificate; switch on the Cloudflare proxy afterwards only if you set
    SSL/TLS to *Full (strict)*.
*   **Anywhere else** (Cloudflare Pages, S3 + CDN, nginx, …): run
    `mise run build` and publish `dist/`.

> Never put personal or customer data on a public site. The content is adapted
> from a Google document by Klub Miłośników Pizzy (credited in the footer); make
> sure you have the club's permission before publishing.
