#!/usr/bin/env bash
# Vercel ignoreCommand: exit 0 = skip build, exit 1 = build. Fails safe to build.
if [ "${VERCEL_GIT_COMMIT_REF:-main}" != "main" ]; then exit 0; fi
if [ -n "${FILES+x}" ]; then
  files="$FILES"
else
  files="$(git diff --name-only HEAD^ HEAD 2>/dev/null)" || exit 1
fi
[ -n "$files" ] || exit 1
while IFS= read -r f; do
  [ -n "$f" ] || continue
  case "$f" in
    docs/*|e2e/*|qa/*|supabase/*|*.md|*.test.*) ;;
    *) exit 1 ;;
  esac
done <<< "$files"
exit 0
