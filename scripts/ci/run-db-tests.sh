#!/usr/bin/env bash
# Runs the SQL safety checks in supabase/tests against $DATABASE_URL.
# Each file ends with RAISE 'RESULT k=v; ...' (rolling back all changes). This script parses
# that line and fails, naming the exact rule, when any check is not PASS / blocked / 0.
# Report only: it never changes the schema or data.
set -uo pipefail
DB="${DATABASE_URL:?DATABASE_URL must point at a disposable test database}"
fail=0
summary="${GITHUB_STEP_SUMMARY:-/dev/null}"
echo "## Database safety checks" >> "$summary"

for f in supabase/tests/*.sql; do
  name=$(basename "$f" .sql)
  out=$(psql "$DB" -X -q -f "$f" 2>&1)
  result=$(grep -o 'RESULT .*' <<<"$out" | head -1 | sed 's/^RESULT //')
  if [[ -z "$result" ]]; then
    echo "::error file=$f::$name did not produce a RESULT line — the script itself crashed: $(grep -m1 ERROR <<<"$out")"
    echo "- ❌ **$name** crashed: \`$(grep -m1 ERROR <<<"$out")\`" >> "$summary"
    fail=1; continue
  fi
  bad=""
  IFS=';' read -ra parts <<<"$result"
  for p in "${parts[@]}"; do
    p=$(xargs <<<"$p"); [[ -z "$p" ]] && continue
    k=${p%%=*}; v=${p#*=}
    case "$v" in
      PASS|blocked|0) ;;
      *) bad+="$k=$v "; echo "::error file=$f::$name: rule '$k' was NOT enforced (got '$v'). A stranger or bad write got through — this blocks the build." ;;
    esac
  done
  if [[ -n "$bad" ]]; then echo "- ❌ **$name**: $bad" >> "$summary"; fail=1
  else echo "- ✅ **$name**: all checks enforced" >> "$summary"; echo "$name: OK ($result)"; fi
done
exit $fail
