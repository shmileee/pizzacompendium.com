#!/usr/bin/env bash
# Smoke test of a published Pizza Compendium: is the site up in every
# language, with its own security policy, sitemap, 404 page and redirects?
#
#   scripts/ci/smoke.sh                        # the address in site.json
#   scripts/ci/smoke.sh http://127.0.0.1:8080  # a local preview (mise run serve)
#   scripts/ci/smoke.sh --built dist           # plus: every file in dist/ is live,
#                                              # byte for byte
#   mise run smoke [-- ...]                    # the same through mise
#
# Needs bash, curl, grep, sed, cmp and find. The expected languages are the
# published ones in content/*/lang.json, the expected address is site.json's.
# The redirects (http to https, www to the bare domain) are only checked when
# the address under test is site.json's own. With --built, every file of the
# folder is compared, images and fonts included, except CNAME (an Actions
# deployment ignores it) and dotfiles (the artifact leaves them out).
#
# Every check is retried SMOKE_INTERVAL seconds apart (default 10) until
# SMOKE_TIMEOUT seconds (default 300, 0 = no retry) have passed since the
# start, because a deployment takes a moment to reach DNS and the CDN. Later
# than that a failing check is tried once, and no check is started more than
# SMOKE_GRACE seconds (default 300) after that: it is reported as failed, "not
# run". A request takes 15 seconds at most (10 to connect), so a server that
# never answers cannot stop the report: the script ends at most SMOKE_TIMEOUT +
# SMOKE_GRACE + 15 seconds after it started. The exit status is 1 when any
# check failed. Under GitHub Actions a failure is an annotation and the results
# are a table in the job summary.
set -euo pipefail

root="$(cd "$(dirname "$0")/../.." && pwd)"
timeout="${SMOKE_TIMEOUT:-300}"
grace="${SMOKE_GRACE:-300}"
interval="${SMOKE_INTERVAL:-10}"
agent="pizzacompendium-smoke"

die() {
  printf 'smoke: %s\n' "$*" >&2
  exit 2
}

base=""
built=""
while [ $# -gt 0 ]; do
  case "$1" in
    --built)
      [ $# -ge 2 ] || die "--built needs a folder"
      built="$(cd "$2" 2> /dev/null && pwd)" || die "no such folder: $2"
      shift 2
      ;;
    -h | --help)
      sed -n '2,/^set -euo/p' "$0" | sed -e '$d' -e 's/^# \{0,1\}//'
      exit 0
      ;;
    -*) die "unknown option: $1" ;;
    *)
      base="${1%/}"
      shift
      ;;
  esac
done

site="$(sed -n 's/.*"siteUrl"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$root/site.json" | head -n 1)"
site="${site%/}"
case "$site" in
  https://*) ;;
  *) die "site.json needs a siteUrl that starts with https://" ;;
esac
host="${site#https://}"
base="${base:-$site}"
case "$base" in
  http://* | https://*) ;;
  *) die "not a web address: $base" ;;
esac

# The published languages, as "code htmlLang" lines. A draft is not live.
languages=""
for file in "$root"/content/*/lang.json; do
  code="$(basename "$(dirname "$file")")"
  if grep -Eq '"status"[[:space:]]*:[[:space:]]*"draft"' "$file"; then
    continue
  fi
  html="$(sed -n 's/.*"htmlLang"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$file" | head -n 1)"
  languages="${languages}${languages:+$'\n'}${code} ${html:-$code}"
done
[ -n "$languages" ] || die "no published language in content/"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
: > "$work/results"
deadline=$((SECONDS + timeout))
# No check is started after this, whatever the site does (see the header).
last_start=$((deadline + grace))

# One request, never longer than 15 seconds and 10 of them to connect: a server
# that accepts and never answers must not stall the whole script.
curl_opts=(--silent --show-error --connect-timeout 10 --max-time 15 --user-agent "$agent")

# get <url>: fetches it without following redirects. $status is the HTTP
# status; the body is in $work/body.
status=""
get() {
  status="$(curl "${curl_opts[@]}" --output "$work/body" \
    --write-out '%{http_code}' "$1" 2> "$work/curl.err")" || {
    echo "curl failed (exit $?): $(cat "$work/curl.err")"
    return 1
  }
}

# has <text>: is it in the body that get fetched?
has() {
  grep -Fq -- "$1" "$work/body"
}

# The checks print what is wrong and return 1; `run` retries them.

# A page of the site: status, canonical address, security policy and, when
# given, the language.
check_page() { # <path> <canonical> [<html lang>]
  local bad=0
  get "$base$1" || return 1
  [ "$status" = 200 ] || {
    echo "HTTP $status, expected 200"
    return 1
  }
  if [ -n "${3:-}" ]; then
    has "<html lang=\"$3\"" || {
      echo "no <html lang=\"$3\">"
      bad=1
    }
  fi
  has "<link rel=\"canonical\" href=\"$2\">" || {
    echo "no canonical link to $2"
    bad=1
  }
  has 'http-equiv="Content-Security-Policy"' || {
    echo "no Content-Security-Policy meta tag"
    bad=1
  }
  if ! { has "default-src 'none'" && has "script-src 'self'"; }; then
    echo "the Content-Security-Policy is not the site's own"
    bad=1
  fi
  return "$bad"
}

check_sitemap() {
  local bad=0 code html
  get "$base/sitemap.xml" || return 1
  [ "$status" = 200 ] || {
    echo "HTTP $status, expected 200"
    return 1
  }
  while read -r code html; do
    has "<loc>$site/$code/</loc>" || {
      echo "sitemap.xml does not list $site/$code/"
      bad=1
    }
  done <<< "$languages"
  return "$bad"
}

check_robots() {
  get "$base/robots.txt" || return 1
  [ "$status" = 200 ] || {
    echo "HTTP $status, expected 200"
    return 1
  }
  has "Sitemap: $site/sitemap.xml" || {
    echo "robots.txt does not point at $site/sitemap.xml"
    return 1
  }
}

# An address that does not exist must give the site's own 404.html with status
# 404, not GitHub's "Site not found" page (which has a policy of its own too).
check_not_found() {
  local bad=0
  get "$base/this-page-does-not-exist/" || return 1
  [ "$status" = 404 ] || {
    echo "HTTP $status, expected 404"
    return 1
  }
  has '/assets/style.css' || {
    echo "not the site's own 404 page (its stylesheet is missing)"
    bad=1
  }
  has '<meta name="robots" content="noindex">' || {
    echo "the 404 page is not noindex"
    bad=1
  }
  if [ -n "$built" ]; then
    cmp -s "$built/404.html" "$work/body" || {
      echo "differs from the built 404.html"
      bad=1
    }
  fi
  return "$bad"
}

# A file that is live must be byte for byte the one that was built.
check_same() { # <path> <built file>
  get "$base$1" || return 1
  [ "$status" = 200 ] || {
    echo "HTTP $status, expected 200"
    return 1
  }
  cmp -s "$2" "$work/body" || {
    echo "differs from the built file (is an older deployment still served?)"
    return 1
  }
}

check_redirect() { # <url> <where it must go>
  local out
  out="$(curl "${curl_opts[@]}" --output /dev/null \
    --write-out '%{http_code} %{redirect_url}' "$1" 2> "$work/curl.err")" || {
    echo "curl failed (exit $?): $(cat "$work/curl.err")"
    return 1
  }
  case "${out%% *}" in
    301 | 302 | 307 | 308) ;;
    *)
      echo "HTTP ${out%% *}, expected a redirect"
      return 1
      ;;
  esac
  [ "${out#* }" = "$2" ] || {
    echo "redirects to ${out#* }, expected $2"
    return 1
  }
}

record() { # <ok|FAIL> <title> [detail]
  local detail
  detail="$(printf '%s' "${3:-}" | head -n 1)"
  printf '%s\t%s\t%s\n' "$1" "$2" "$detail" >> "$work/results"
  if [ "$1" = ok ]; then
    printf 'ok    %s\n' "$2"
  else
    printf 'FAIL  %s\n' "$2"
    printf '%s\n' "${3:-}" | sed 's/^/        /'
  fi
}

# run <title> <check> [args]: retries the check until it passes or the
# deadline has passed. No attempt starts after last_start, the first one
# included (it fails as "not run") and no retry either (it fails with what the
# last attempt said), however short SMOKE_GRACE is next to SMOKE_INTERVAL.
run() {
  local title="$1" out="" tried=""
  shift
  while :; do
    if [ "$SECONDS" -ge "$last_start" ]; then
      if [ -z "$tried" ]; then
        out="not run: the smoke test ran out of time"
      fi
      break
    fi
    tried=yes
    if out="$("$@" 2>&1 < /dev/null)"; then
      record ok "$title"
      return 0
    fi
    if [ "$SECONDS" -ge "$deadline" ]; then
      break
    fi
    printf 'wait  %s: %s\n' "$title" "$(printf '%s' "$out" | head -n 1)"
    sleep "$interval"
  done
  record FAIL "$title" "$out"
}

printf 'Smoke test of %s\n' "$base"

run "/ is up, canonical and with the site's policy" check_page / "$site/"
while read -r code html; do
  run "/$code/ is up as <html lang=\"$html\">, canonical and with the policy" \
    check_page "/$code/" "$site/$code/" "$html"
done <<< "$languages"
run "/sitemap.xml lists every language" check_sitemap
run "/robots.txt points at the sitemap" check_robots
run "an unknown address is the site's own 404" check_not_found

if [ -n "$built" ]; then
  # Every file that was deployed, not only the text: a stale CDN that still
  # serves an old image, font or icon must not pass. Left out: 404.html (the
  # check above compares it), CNAME and dotfiles (see the header). The paths
  # are relative, so a dot in the name of the folder itself excludes nothing.
  while IFS= read -r file; do
    rel="${file#./}"
    case "$rel" in
      404.html) continue ;;
      index.html) path="/" ;;
      */index.html) path="/${rel%index.html}" ;;
      *) path="/$rel" ;;
    esac
    run "live $path is the built $rel" check_same "$path" "$built/$rel"
  done < <(cd "$built" && find . -type f ! -name CNAME ! -path '*/.*' | LC_ALL=C sort)
fi

# The domain itself: only meaningful for the real address.
if [ "$base" = "$site" ]; then
  run "http://$host/ redirects to https" check_redirect "http://$host/" "$site/"
  case "$host" in
    www.*) ;;
    *) run "https://www.$host/ redirects to the bare domain" check_redirect "https://www.$host/" "$site/" ;;
  esac
fi

failed="$(grep -c '^FAIL' "$work/results" || true)"
total="$(wc -l < "$work/results" | tr -d ' ')"

if [ "${GITHUB_ACTIONS:-}" = true ]; then
  while IFS=$'\t' read -r result title detail; do
    [ "$result" = ok ] || printf '::error title=smoke test::%s: %s\n' "$title" "$detail"
  done < "$work/results"
fi
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    printf '### Smoke test of %s\n\n| result | check |\n| --- | --- |\n' "$base"
    while IFS=$'\t' read -r result title detail; do
      printf '| %s | %s%s |\n' "$result" "$title" "${detail:+ (${detail//|/\\|})}"
    done < "$work/results"
    printf '\n'
  } >> "$GITHUB_STEP_SUMMARY"
fi

if [ "$failed" -eq 0 ]; then
  printf '\nAll %s checks passed.\n' "$total"
else
  printf '\n%s of %s checks failed.\n' "$failed" "$total"
  exit 1
fi
