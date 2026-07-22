#!/usr/bin/env bash
# claude-reflection-stop-hook.sh — optional Claude Code Stop hook that enforces the
# AGENTS.md "Reflection" section: when a session shipped something (commit/PR/push),
# block session-end ONCE with the reflection checklist.
#
# INERT until enabled. To enable, add to the workspace .claude/settings.local.json:
#   {
#     "hooks": {
#       "Stop": [
#         { "hooks": [ { "type": "command",
#             "command": "bash <absolute-path-to-repo>/scripts/claude-reflection-stop-hook.sh",
#             "timeout": 10 } ] }
#       ]
#     }
#   }
set -euo pipefail

payload="$(cat)"

# Fires at most once per stop: when Claude continues after our block, Claude Code
# re-runs the hook with stop_hook_active=true — exit 0 then to avoid a loop.
if printf '%s' "$payload" | grep -q '"stop_hook_active"[[:space:]]*:[[:space:]]*true'; then
  exit 0
fi

transcript="$(printf '%s' "$payload" | sed -n 's/.*"transcript_path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"
# Expand a leading ~ if present.
transcript="${transcript/#\~/$HOME}"

# Only gate sessions that shipped something.
if [ -z "$transcript" ] || [ ! -f "$transcript" ]; then
  exit 0
fi
if ! grep -Eq 'git commit|gh pr create|git push' "$transcript"; then
  exit 0
fi

cat <<'JSON'
{"decision":"block","reason":"Reflection loop before ending (AGENTS.md §Reflection): 1) evidence gathered — real command output + gh pr checks polled for every touched gate? 2) triple-check — full diff re-read adversarially against the requirement? 3) durable lessons routed — rule→AGENTS.md/docs PR, state→gh issue, decision→ADR, personal→memory? 4) workspace CLAUDE.md still thin and state-free? Address these (or state explicitly that nothing was learned), then finish."}
JSON
