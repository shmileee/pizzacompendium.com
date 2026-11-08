# Pizza Compendium – pizzacompendium.com

A static, multilingual guide to making pizza at home, in **Polski, English,
Українська**. Markdown → plain HTML/CSS with a few small ES modules (language
picker, theme, table of contents, search, FAQ, product cards). Without
JavaScript the guide is still fully readable.

Contributor and agent rules, layout, tests and CI: [AGENTS.md](AGENTS.md).
Content syntax, glossary and translation rules:
[TRANSLATING.md](TRANSLATING.md).

## Quick start

Tools are pinned by [mise](https://mise.jdx.dev); git hooks run through
[prek](https://prek.j178.dev). Nothing else needs to be installed.

```sh
mise trust && mise install   # once per clone
mise run prek:install        # git hooks, once per clone
mise run serve               # build + preview on http://localhost:8080
mise run lint                # every check CI runs
```

Other tasks (`mise tasks` lists them all):

```sh
mise run build           # → dist/ (build:strict: warnings are errors, as in CI)
mise run test            # unit tests
mise run e2e:install     # once: Playwright and its browser
mise run e2e             # browser tests
mise run coverage        # every test, one report; fails below 100 %
mise run lighthouse      # Lighthouse on the built site; needs Chrome (CHROME_PATH)
mise run smoke           # smoke test of the live site (-- <url> for a local one)
mise run images          # regenerate derived images (srcset copies, og.jpg, icons)
mise run content:lint    # the hard content rules only
mise run i18n:status     # what the translations still owe
```

`dist/` is self-contained with relative links, so it works on any static host
and under a sub-path. Every page also ships JSON-LD structured data, a Markdown
copy at `<code>/index.md`, and `llms.txt` maps the guide for language models.

## Edit content

Edit the Polish in `content/pl/`, then mirror it in the other languages. A
changed structure fails the build; once a translation matches the new Polish,
confirm it with `mise run i18n:sync <code> [files]` (until then the build warns
`W_UNCONFIRMED` or `W_STALE`, and `build:strict` fails).

## Add a language

```sh
mise run new-lang de "Deutsch"
```

This creates `content/de/` as a draft copy of the Polish. Translate `lang.json`
and the `.md` files, track progress with `mise run i18n:status`, preview at
`/de/`, then set `"status": "published"`. A draft is built with `noindex` and
kept out of navigation, but is still public once deployed.

## Deploy

GitHub Pages, from `.github/workflows/checks.yaml`: a push to `main` deploys
only after every check is green, then a smoke test checks the live site.
Details, re-runs and the repository settings are in [AGENTS.md](AGENTS.md).
