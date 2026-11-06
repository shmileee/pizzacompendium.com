#!/usr/bin/env bash
# Invariants of the workflows that no linter enforces: zizmor accepts any
# job-level permission and the low-risk ones (`statuses`) at the top too, it
# does not see a push to main that publishes Pages as a release workflow (so it
# never looks at caches), and nothing knows that a job must gate the deployment.
# Five rules:
#
#   1. A job, or the top of a workflow, may have a write permission only if
#      ALLOWED_WRITES lists it: nothing else can publish Pages, push, comment
#      or release.
#   2. A job that uploads the Pages artifact restores no cache, and sets
#      `cache: false` on mise: a cache must never end up in what is published.
#   3. The job that deploys needs every other job of its workflow, except the
#      jobs that need it (the smoke test) and NOT_BLOCKING: a job that is added
#      later gates the deployment too.
#   4. Only checks.yaml deploys (actions/deploy-pages).
#   5. Permissions are written as a block (`permissions:` and indented
#      `name: read` lines), `read-all` or `{}`, never as an inline mapping the
#      rules above would not read.
#
# It reads the text of the workflows, which yamllint keeps two-space indented:
# `needs` is one line (`needs: [a, b]`, `needs: a`) or a list. Run by the
# workflow-invariants hook, so by `mise run lint`:
#
#   scripts/ci/check-workflows.sh [workflow folder]   # default .github/workflows
set -euo pipefail

dir="${1:-$(cd "$(dirname "$0")/../.." && pwd)/.github/workflows}"

# "<workflow file> <job> <permission>": what a job may be granted beyond
# `contents: read`. The top of a workflow is the job "(workflow)": none is
# allowed there.
ALLOWED_WRITES="checks.yaml deploy pages
checks.yaml deploy id-token
codeql.yaml analyze security-events"

# The only workflow that may deploy.
DEPLOY_WORKFLOW="checks.yaml"

# Jobs that may report without gating the deployment (none today). If
# Lighthouse ever stops blocking it, it belongs here and out of `needs`.
NOT_BLOCKING=""

# The facts of one workflow, one per line:
#   job <job> | needs <job> <needed job> | write <job> <permission>
#   inline <job> <permissions value> | uses <job> <action> | cache <job>
#   nocache <job>
read -r -d '' facts_awk << 'AWK' || true
/^jobs:/ { jobs = 1; top = 0; next }
/^permissions:/ {
  jobs = 0; job = ""; top = 1
  value = $0
  sub(/^permissions:[[:space:]]*/, "", value); sub(/[[:space:]]*#.*$/, "", value)
  if (value != "" && value != "read-all" && value != "{}")
    print "inline", "(workflow)", value
  next
}
/^[A-Za-z]/ { jobs = 0; job = ""; top = 0 }
top && /^  [a-z-]+:[[:space:]]*[\042\047]?write/ {
  permission = $1; sub(":", "", permission)
  print "write", "(workflow)", permission
  next
}
jobs && /^  [A-Za-z0-9_-]+:[[:space:]]*(#.*)?$/ {
  job = $1; sub(":", "", job); section = ""
  print "job", job
  next
}
!jobs || job == "" { next }

# A key of the job itself.
/^    [A-Za-z0-9_-]+:/ {
  section = $1; sub(":", "", section)
  value = $0
  sub(/^    [A-Za-z0-9_-]+:[[:space:]]*/, "", value)
  sub(/[[:space:]]*#.*$/, "", value)
  if (section == "permissions" && value != "" && value != "read-all" && value != "{}")
    print "inline", job, value
  if (section == "needs") {
    gsub(/\[/, " ", value); gsub(/\]/, " ", value); gsub(/,/, " ", value)
    n = split(value, parts, " ")
    for (i = 1; i <= n; i++) print "needs", job, parts[i]
  }
  next
}
section == "needs" && /^      - / {
  value = $0
  sub(/^      - */, "", value); sub(/[[:space:]]*#.*$/, "", value)
  print "needs", job, value
}
section == "permissions" && /^      [a-z-]+:[[:space:]]*[\042\047]?write/ {
  permission = $1; sub(":", "", permission)
  print "write", job, permission
}
/^[[:space:]]*(-[[:space:]]+)?uses:/ {
  action = $0
  sub(/^[[:space:]]*(-[[:space:]]+)?uses:[[:space:]]*/, "", action)
  sub(/[[:space:]]*#.*$/, "", action); gsub(/[\042\047]/, "", action); sub(/@.*/, "", action)
  print "uses", job, action
  if ($0 ~ /^[[:space:]]*(-[[:space:]]+)?uses:[^#]*(cache|setup-)/) print "cache", job
}
/^[[:space:]]+restore-keys:/ { print "cache", job }
/^[[:space:]]+cache:[[:space:]]*false([[:space:]]|$)/ { print "nocache", job }
AWK

status=0
problem() {
  echo "check-workflows: $*" >&2
  status=1
}

found=0
while IFS= read -r file; do
  found=1
  name="$(basename "$file")"
  facts="$(awk "$facts_awk" "$file")"

  # 1 and 5. Write permissions per job and at the top, and permissions that
  # cannot be read.
  while read -r kind job value; do
    subject="job $job"
    [ "$job" != "(workflow)" ] || subject="the top of the workflow"
    case "$kind" in
      write)
        grep -Fxq -- "$name $job $value" <<< "$ALLOWED_WRITES" \
          || problem "$name: $subject has the write permission $value, which is not allowed (ALLOWED_WRITES in this script)"
        ;;
      inline)
        problem "$name: $subject has the inline permissions: $value (a block, read-all or {} is accepted)"
        ;;
    esac
  done <<< "$facts"

  # 2. Jobs that upload the Pages artifact.
  while read -r _ job _; do
    if grep -Fxq -- "cache $job" <<< "$facts"; then
      problem "$name: job $job uploads the Pages artifact and restores a cache"
    fi
    if grep -Fxq -- "uses $job jdx/mise-action" <<< "$facts" \
      && ! grep -Fxq -- "nocache $job" <<< "$facts"; then
      problem "$name: job $job uploads the Pages artifact, so its mise step must set cache: false"
    fi
  done < <(grep -E '^uses [^ ]+ actions/upload-pages-artifact$' <<< "$facts" || true)

  # 3 and 4. Jobs that deploy.
  while read -r _ deploy _; do
    if [ "$name" != "$DEPLOY_WORKFLOW" ]; then
      problem "$name: job $deploy deploys, but only $DEPLOY_WORKFLOW may"
    fi
    while read -r _ job; do
      [ "$job" != "$deploy" ] || continue
      case " $NOT_BLOCKING " in
        *" $job "*) continue ;;
      esac
      if ! grep -Fxq -- "needs $deploy $job" <<< "$facts" \
        && ! grep -Fxq -- "needs $job $deploy" <<< "$facts"; then
        problem "$name: the deploy job $deploy does not need the job $job (add it to needs, or to NOT_BLOCKING in this script if it must not gate the deploy)"
      fi
    done < <(grep '^job ' <<< "$facts" || true)
  done < <(grep -E '^uses [^ ]+ actions/deploy-pages$' <<< "$facts" || true)
done < <(find "$dir" -maxdepth 1 -type f \( -name '*.yaml' -o -name '*.yml' \) | LC_ALL=C sort)

if [ "$found" -eq 0 ]; then
  problem "no workflow in $dir"
fi
if [ "$status" -eq 0 ]; then
  echo "check-workflows: ok"
fi
exit "$status"
