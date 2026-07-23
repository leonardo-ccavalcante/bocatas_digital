# Issue tracker: GitHub

Issues and PRDs for this project live as GitHub issues in
**`leonardo-ccavalcante/bocatas_digital`** — the ONLY live register of open work
(bugs, tech debt, regressions, follow-ups). In-repo ledgers and plan documents are
historical snapshots; never re-derive "what's open" from them.

Use the `gh` CLI for all operations, run from the repo root (it infers the repo from
`git remote -v`).

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."` (vocabulary: `docs/agents/triage-labels.md`)
- **Close**: `gh issue close <number> --comment "..."` — attach the evidence (commands + output) that justifies closing.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.
