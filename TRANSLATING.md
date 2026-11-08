# Translating the compendium

The Polish text in `content/pl/` is the **source of truth**. Every other
language is a folder `content/<code>/` that mirrors it file-for-file.

```text
content/
  rules.json                ← the hard content rules (see below)
  pl/                       ← source language (marked "source": true in lang.json)
    lang.json               ← language name, page title, UI strings
    00-intro.md             ← content, split into numbered section files
    01-types.md
    …
  en/  uk/  …               ← translations: same file names, same anchor ids
    .sync.json              ← written by `mise run i18n:sync`, never by hand
```

Adding a language: `mise run new-lang de "Deutsch"` copies the Polish files
(without their `::: local` notes) into `content/de/` as a **draft**. Translate
each file in place, check progress with `mise run i18n:status`, and read the
result with `mise run serve` at `/de/`. When it is done, publish it (see
[Languages](#languages)).

## What to translate, what to keep

| Do | Don't |
| --- | --- |
| Translate all prose, headings, list items, link texts, image alt text and image captions. | Change anchor ids: `{#flour-strength}`, `#faq-stone`, … They are shared by all languages, which is how the language picker keeps you on the same section. |
| Translate callout/FAQ titles (the text after `::: tip`, `::: q #id`, `::: flour img=… `). | Change URLs, file names (`img/…webp`), `img=` values or container keywords (`tip`, `warning`, `note`, `q`, `flour`, `flours`, `gallery`, `local`, `recipe`), or the `time=` of a recipe. |
| Localise number formats (`11,5%` → `11.5%` in English). | Change numbers, temperatures, times, weights, hydration values. |
| Keep brand and product names (Caputo, Polselli, Ooni Koda, …) and Italian pizza terms (Napoletana, Classica, Teglia alla Romana, Pinsa Romana, cornicione, biga, poolish, biscotto, semola) in their original form. | Add, remove or reorder sections, list items or FAQ entries. |

**Pictures with text in them.** A photo whose labels are part of the picture
may come in one file per language, named `name-<code>.webp` (today
`dough-balls-timeline-en.webp` and `dough-balls-timeline-uk.webp`; the Polish
`dough-balls-timeline.webp` is the master). This is the one exception to "file
names stay as they are": a translation then points at its own file, and its
caption describes the labels the reader actually sees. Everything else about
the image stays as in the source.

**Currency.** Every price is written in US dollars with the `$` sign in front of
the amount and no space, in every language: `$250`, `$3–5`, `$15–25`. Only
English uses a thousands comma (`$1,000`); Polish and Ukrainian write `$1000`.
Never use `zł`, `PLN`, `EUR` or `€`. The original Polish budgets were converted
at roughly 4 PLN per $1 and rounded to tidy figures (500 → $125, 1000 →
$250, 2000 → $500, 3000–4000 → $750–1000); keep approximate wording ("about",
"ok.", «близько») for rough prices.

**Hard rule: shared text is country-neutral.** The guide must read correctly for
a reader anywhere, in any language. It must never refer to the reader's own
country, nationality or local market: no "in Poland", "Polish pizzerias", "our
country", no local shops, laws, institutions, units or currency. Pizza-specific
geography is fine (Italian flours, Neapolitan pizza). If a note is genuinely
specific to one country or language and worth keeping, it lives only in that
language's own file, inside a `::: local lang=<code> Title` block. A local block
is rendered only on the page of that language, is ignored by the
structure-parity checks, must carry `lang=` equal to its folder (written before
the title) and a title, and may contain plain paragraphs and lists only (no
headings, FAQ items, blocks, tables, quotes or ids, wherever Markdown would put
them: the build checks the rendered structure, the commit hook the plain forms).
A `lang=` that is not the file's own language is an error in the build as
well, wherever the note is.
Country-specific wording anywhere else is a build error, and the same rule runs
in the `content-lint` commit hook and in CI.

The files must keep the same **file names**, the same **structure** and the same
**ids** as `content/pl/`. The build compares, for every file and every
published language: the number of `:::` lines, the ids and headings (level and
id, in order), and the number of images, links, table rows and list items.
Local blocks are left out. Any difference is an error
(`E_PARITY_FENCES`, `E_PARITY_IDS`, `E_PARITY_HEADINGS`, `E_PARITY_IMAGES`,
`E_PARITY_LINKS`, `E_PARITY_TABLE_ROWS`, `E_PARITY_LIST_ITEMS`,
`E_PARITY_ATTRIBUTES`: the name and attributes of every block in order, such as
`flour img=x.webp level=beginner`; titles and `#id`s are not compared, so a
language cannot mark other cards for beginners), and so is an id
that exists in one language but not in the other (`E_ID_MISSING`,
`E_ID_EXTRA`) and a `ui` string that `lang.json` of the source defines but a
translation does not (`E_LANG_UI_MISSING`).

## Markdown extensions

Standard Markdown plus:

```md
## Section title {#stable-id}            heading with an explicit anchor id (h2/h3 appear in the TOC)

::: tip Optional title                    green "did you know" box
::: warning Optional title                red "important" box
::: note Optional title                   neutral box
Body in Markdown…
:::                                       a bare ::: closes the innermost open block

::: q #faq-some-id Question text?         collapsible FAQ item (<details>), anchor id = faq-some-id (always `#id`, never `id=`)
Answer in Markdown…
:::

::: local lang=pl Title of the note       country/language-specific note: shown ONLY on the page of that language
Plain paragraphs and lists only.          (see the hard rule above; lang must match the folder)
:::

:::: flours                               grid of product cards
::: flour img=flour-caputo-cuoco.webp level=beginner Caputo Cuoco
- bullet list (specs) …
:::
::::

:::: gallery                              row of images
![alt text](img/photo.webp)
![alt text](img/other.webp "Optional caption")
::::

:::: recipe time=PT24H                    a recipe: the text inside is shown as it is,
### Basic recipe {#recipe}                 and read as data for search engines (see below)
…a paragraph, the table of ingredients, the numbered steps…
::::
```

A `recipe` block adds nothing to the page; it tells search engines and language
models, in structured data, what the text inside it already says. It reads the
first heading (the name of the recipe), the first paragraph (its description),
the first table (one ingredient a row: the ingredient in the first column, the
amount in the second; a row whose first cell is all bold, such as **Total**, is
left out) and the first numbered list (the steps). `time=` is the total time as
an ISO 8601 duration (`PT24H`, `P2DT3H`). A recipe without a heading with an id,
a table of two columns or a numbered list is an error. Translate the text inside
as usual; keep the block, the order of the columns and `time=` as they are.

Every block is checked against its description; a mistake is an error with the
file and line:

| Block | Title | Attributes | Notes |
| --- | --- | --- | --- |
| `tip`, `warning` | optional (default from `ui.tip` / `ui.warning`) | none | |
| `note` | optional | none | |
| `q` | required (the question) | `#id` required | the first one on a page brings the "expand all" button |
| `flours` | none | none | holds `flour` cards only (`E_BLOCK_CONTENT`) |
| `flour` | required | `img=<file>` optional, `level=beginner` optional | only directly inside `flours`; the file is in `static/img/`; holds one bullet list of single lines (`E_BLOCK_CONTENT`); `level=beginner` gives the card a badge and puts it under the "for beginners" filter, and must be on the same cards in every language (any other value is `E_BLOCK_ATTR`) |
| `gallery` | none | none | at least one image, nothing but images |
| `local` | required | `lang=<code>` required | checked by the content rules, see above |

A block is closed by a bare `:::` of the same length as its opener; a block
that is never closed, a stray `:::` and an unknown block name are errors, a
closing fence of a different length is a warning. Blocks nest. An HTML comment
is a note, whatever it contains: a `:::` inside it opens and closes nothing.
Leave a blank line before a block that follows a list, otherwise Markdown
treats it as part of the last item.

Attributes (`#id`, `img=<file>`, `lang=<code>`) come first,
**before the title**: `::: flour img=caputo.webp Caputo Cuoco`. An attribute
written after the title would become part of the title, so it is an error, and
so is an attribute the block does not have. An attribute value is made of
letters, digits and `- _ . /` only (`img=`, `lang=`, `level=`); `id=` is not an
attribute (write `#id`).

Rules for the Markdown itself:

*   **Headings** are `## Title {#id}`. The id is required, uses letters, digits,
    `-` and `_`, and is unique in the language. `top`, `content`, `toc`,
    `toc-toggle` and `lang-picker` belong to the page (you may link to them, not
    define them). A level-1 heading, a skipped level (h2 straight to h4) and an
    empty title are reported. The title of every h2 and h3 goes into the table
    of contents.
*   **Links** are `[text](#id)` and point at an id on the same page; every other
    target (an address, `mailto:`, `tel:`, `javascript:`, a file) is an error.
    If the id does not exist in that language the link is an error
    (`E_BROKEN_ANCHOR`). Reference links (`[text][r]` with `[r]: #id`) are not
    used.
*   **Images** are `img/<file>`, written exactly as the file is spelled in
    `static/img/` (letters, digits, `-`, `_` and dots only). An image alone in
    its paragraph becomes a figure with its caption; an image inside a sentence
    stays inline.
*   **Numbered lists are recipes:** the steps are drawn as numbered badges
    counted from 1, so a list that starts at another number is a warning
    (`W_LIST_START`). A table becomes a card per row on a phone, using its
    header cells as labels: keep every header cell filled.
*   **No raw HTML.** `<div>`, `<script>`, `<img>` and the like are errors.
    Translator notes can be written as `<!-- … -->` (one comment, nothing else
    on its lines): they are dropped from the page. Task lists (`- [ ]`) are not
    supported and are an error as well.
*   **One way to write each thing.** The commit hook reads the structure line
    by line, without a Markdown parser, so the forms it cannot read are errors
    even where Markdown would accept them: fenced code (`E_CODE_BLOCK`; the
    guide has none), and, as `E_MARKDOWN_FORM` with the form named, a heading
    underlined with `===` or `---` (write `## Title {#id}`, and leave a blank
    line before a `---` rule), `## Title {#id} ##`, quotes (`>`), a heading, a
    `:::` fence or a table that does not start at the beginning of its line
    (in a list item, indented), `+` bullets, `1)` numbers, two list markers on
    one line (`- 1. x`), a rule with spaces (`- - -`), a table row that does
    not start with `|` (a blank line ends a table), and link definitions
    (`[r]: #id`).
*   Files are named `NN-name.md` (two digits, lower-case words joined by `-`),
    in UTF-8, at most 1 MB, and no line is longer than 10,000 characters (the
    longest paragraph of the guide has under a thousand: a longer line is a
    mistake or an attack on the Markdown parser). Anything in a language folder
    that looks like a section (two digits and a hyphen at the start, or `.md`
    or `.markdown` at the end, in any case) but is not such a file is an error,
    so that a section never drops out of the page unnoticed: `01-intro.MD`,
    `01-intro.md.bak` and `01-intro.md~` are all refused. A byte-order mark or
    Windows line endings do not matter; text that is not valid UTF-8 (a file
    saved in Windows-1250) is an error.

## The hard content rules (`content/rules.json`)

The rules that every text must obey are data, not code, so they can be extended
without touching the generator. `mise run content:lint` (and the `content-lint`
hook, CI and the build) apply them line by line to every file of every language,
comments included, and a rule with `"acrossLines": true` also to the lines of a
paragraph joined by spaces, so that a line break inside "where to buy" hides
nothing (the finding is on the line where the phrase starts). The text is read
in composed form (NFC), so a decomposed `ń` is still `ń`. A rule with
`"localExempt": true` is not applied inside `::: local` blocks.

```json
{
  "views": {
    "prose": [{ "replace": "\\bimg=\\S+", "with": "" }],
    "prose-no-urls": ["prose", { "replace": "https?:\\S+", "with": "" }]
  },
  "rules": [
    {
      "id": "no-trick",
      "level": "warning",
      "message": "avoid the word \"trick\"",
      "patterns": ["\\btrick\\b"],
      "flags": "i",
      "languages": ["en"]
    }
  ]
}
```

| Key of a rule | Meaning |
| --- | --- |
| `id` | lower-case words joined by `-`; the diagnostic code is `E_<ID>` or `W_<ID>` (`E_JARGON_HYDRO`) |
| `level` | `"error"` fails the build and the commit, `"warning"` is only printed (and fails `--strict`) |
| `message` | what the author should do, shown with the matched text |
| `patterns` | regular expression sources; a match of any is a hit (each is tried on its own, so a numbered back-reference means what it says). To forbid one more word, add it to the list |
| `flags` | any of `i`, `m`, `s`, `u` (`g` is always on) |
| `view` | optional: the line is cut down first by a named view, for rules that must not see ids, image names or links |
| `languages` | optional: language codes the rule applies to (default: all) |
| `localExempt` | optional: skip lines inside `::: local` blocks |
| `acrossLines` | optional: also match over the lines of a paragraph joined by spaces, for phrases a line break could split |
| `skip` | optional regular expression: lines that match are left alone |
| `allow` | optional list of exact matches that are fine (the acronyms the ALL-CAPS rule lets through) |

A **view** is a named list of `{ "replace": regex, "with": text }` steps, or of
names of views defined before it. A typo in the file (an unknown key, a bad
regex or view name, a duplicate id) is itself an error (`E_RULES`, with the
`field` that is wrong in `--format json`), so a rule cannot be switched off by
accident. Besides these rules the engine checks local blocks,
anchors and the parity between languages described above; those are code.

The rules in force are: no exclamation chains, smileys or emoji, `+/-`, control
and invisible characters (a terminal escape, a right-to-left override, a
zero-width space), outside links (any target but `#id`, so no `mailto:`,
`//host`, `ftp:`, `www.` or e-mail address either), shop or retailer names,
prices in any currency but US dollars and written the one way (`$250`: the
symbol first, no space, no `dollars`), mentions of the club (it is credited in
the footer), social-media or document links, the abbreviations TO and TK
(Polish), the jargon "hydro", hyphens in numeric ranges (use an en dash), the
ASCII apostrophe in Ukrainian words, country-specific remarks in shared text (in
any case: "poland" too; the lower-case English words "polish" and "poles" are
allowed), words that mix Latin and Cyrillic letters (a look-alike letter), and
"a" before a common word that starts with a vowel sound in English ("an
ordinary"). Warnings: American spelling in English, straight double quotes,
ALL-CAPS words (Latin or Cyrillic), double spaces and exclamation marks. The
rules read the text of the sections; the strings of `lang.json` are reviewed by
hand.

## Languages

`lang.json` of every language:

| Key | Meaning |
| --- | --- |
| `code` | equals the folder name: two or three lower-case letters, optionally `-` and a region, e.g. `de`, `pt-BR` |
| `name` | the language's name in itself, shown in the picker |
| `htmlLang` | value of `<html lang>` and of `hreflang`, e.g. `de`, `pt-BR` |
| `title`, `description` | the name of the guide (the heading of the page, the site name, the installed app) and its description |
| `pageTitle` | optional: the `<title>` of the page in search results and link previews: the name with the topic in it, such as "Pizza Compendium: a guide to making pizza at home" (default: `title`) |
| `dir` | optional: `ltr` (default) or `rtl` |
| `order` | optional: position in the picker (default last) |
| `source` | `true` on exactly one language: the one the others copy |
| `status` | optional: `"published"` (default) or `"draft"` |
| `ogLocale` | optional: `language_TERRITORY` for link previews (`en_GB`); by default the most likely territory of `htmlLang`. A published language whose tag has none (`xx`) must give it; a draft need not |
| `ogImageAlt` | optional: description of the preview image (default: the title) |
| `typography` | optional: `{ "nbspAfter": [...], "units": [...] }`. Words after which the build puts a no-break space (one-letter prepositions and conjunctions, and the words that belong to the number after them: `ok.`, `близько`, `about`) and units that stay with the number before them (`g`, `h`, `°C`). Numeric ranges (`5–6`, `$3–5`) never break, and a spaced dash never starts a line, in every language. The text of the files is not changed; a new language may leave it out |
| `ui` | the interface strings. Every key of the source's `ui` is required in a published language (`E_LANG_UI_MISSING`; an extra key is `W_LANG_UI_EXTRA`). Keep `credit` the last key: new keys go directly above it. The source language must define every key the templates and scripts read (the list is `REQUIRED_UI` in `scripts/lib/languages.mjs`; a missing one is `E_LANG_META`): theme `themeAuto`, `themeLight`, `themeDark`; the page chrome `toc`, `tocClose`, `language`, `langCode` (the short label of the picker), `skip`, `top`, `tip`, `warning`, `credit`; 404 page `notFound`; manifest `shortName` (at most 12 characters, checked); FAQ `expandAll`, `collapseAll`, `copyLink`, `linkCopied`, `copyFailed`; hero `heroStart`, `heroFaq`, `heroAlt`; cards `beginner` (the badge and the filter button), `filterLabel`, `filterAll`, `filterStatus` (must hold `{shown}` and `{total}`, checked); the footer `updated` (must hold `{date}`, checked: the date the text of the language last changed, written the way the language writes dates); search `search`, `searchLabel`, `searchBrowse`, `searchResults`, `searchCount`, `searchNone`, `searchSection`, `searchQuestion`, `searchText`, `searchClose`. One optional key, `translationNote`, is a line shown above the text (for a draft or a machine translation); any language may define it. Write strings that need no plural form |

Exactly one `lang.json` must say `"source": true` (`E_LANG_SOURCES` otherwise).
Every published language also gets its own `manifest.webmanifest` (name from
`title`, short name from `ui.shortName`, start page in that language); a missing
app icon in `static/` is `E_STATIC_ICON`.

**Draft or published.** `mise run new-lang` creates a draft. A draft is built
to `dist/<code>/` with `<meta name="robots" content="noindex">` and is left out
of the language picker, `hreflang`, the sitemap, the 404 page and the root-page
redirect; it may be unfinished without any warning. Remove `"status": "draft"`
(or set `"published"`) when the translation is complete. A published language
must be complete: a missing `ui` string or a structural difference is an error,
a file that is missing shows the source text in a `lang="pl"` wrapper with a
warning (`W_FALLBACK`), a file identical to the source is `W_UNTRANSLATED_COPY`,
and a file the source does not have is `W_EXTRA_FILE`.

**Keeping translations current.** The build cannot tell whether a changed
Polish sentence was translated, so it asks you to say so. After you have
brought a translated file in line with the Polish one, run

```sh
mise run i18n:sync en 01-types.md      # one file
mise run i18n:sync en                  # every translated file of `en`
```

which records a hash of the Polish text in `content/en/.sync.json`. From then on
the build warns (`W_STALE`) when the Polish file changes, until you translate
and confirm again. A translated file of a published language that was never
confirmed is a warning too (`W_UNCONFIRMED`): without a record nothing tells
whether the Polish text has changed under it. A draft is not warned about.
Polish `::: local` notes are not part of the hash: they have no counterpart in a
translation, and neither are spaces at the end of a line or blank lines at the
end of the file (the commit hook trims those). `mise run i18n:status` prints
every file of every translation as `ok`, `stale`, `unconfirmed` (translated,
never confirmed), `untranslated` (identical to the source), `missing` or
`extra`.

**Strict builds.** `mise run build:strict` makes every warning an error. Run it
before publishing (and let CI run it): a stale, unconfirmed or untranslated file
in a published language then blocks the release. While you work,
`mise run build` lets you finish one language at a time.

## Glossary

How the existing translations render recurring terms. Keep the choice consistent
across the whole document. The text uses plain words (room temperature, fridge,
hydration) rather than abbreviations – keep it that way.

| Polish | English | Ukrainian |
| --- | --- | --- |
| temperatura pokojowa / lodówka | room temperature / the fridge | кімнатна температура / холодильник |
| hydratacja | hydration | гідратація |
| siła mąki, W | flour strength, W | сила борошна, W |
| kulka | dough ball | кулька (порція тіста) |
| blok | bulk dough ("block") | блок (велика заготовка тіста) |
| kulkowanie | balling | формування кульок |
| wyrastanie / dojrzewanie | rising / maturation | вистоювання / дозрівання |
| podsypka | dusting flour | присипка |
| dyscyplinarka (AVPN, APITER) | specification ("disciplinare") | регламент («disciplinare») |
| panterka / gepard | leopard spotting | леопардові плями |
| szamot / kordieryt / granit | fireclay / cordierite / granite | шамот / кордієрит / граніт |
| łopata (do pizzy) / łopata operacyjna | pizza peel / turning peel | лопата для піци / лопатка для обертання піци |
| szpachelka | spatula (putty-knife style) | шпатель |
| pirometr | infrared thermometer (pyrometer) | пірометр |
| robot planetarny | stand mixer | планетарний міксер |
| pelati / polpa | peeled tomatoes (pelati) / tomato pulp (polpa) | очищені томати (пелаті) / томатна м’якоть (полпа) |
| czad | carbon monoxide | чадний газ |

## Checklist for a new language

1.  `mise run new-lang <code> "<Native name>"`
2.  Edit `content/<code>/lang.json`: `name`, `htmlLang`, `title`,
    `description`, all `ui` strings (the footer `credit` line too), and
    `ogLocale` if the code is not a plain language.
3.  Translate every `content/<code>/*.md`, checking with
    `mise run i18n:status` and `mise run content:lint`.
4.  `mise run build` – fix every error and warning, then `mise run serve` and
    click through the page at `/<code>/`.
5.  Publish it: delete `"status": "draft"` from `lang.json`, run
    `mise run i18n:sync <code>` and `mise run build:strict`.
