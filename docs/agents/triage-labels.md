# Labels

The vocabulary actually used in this repo's issue tracker. Do not invent labels;
if a new one is genuinely needed, create it deliberately (`gh label create`) and
document it here in the same change.

## Priority

| Label | Meaning |
|---|---|
| `P0` | Blocks ship / production incident — drop everything |
| `P1` | Fix now — next working session |
| `P2` | Fast-follow — schedule soon |

## Category

| Label | Meaning |
|---|---|
| `bug` | Incorrect behavior |
| `security` | Security or authorization finding |
| `tech-debt` | Debt, cleanup, refactor |
| `a11y` | Accessibility (WCAG 2.1 AA is non-negotiable) |
| `wontfix` | Deliberately not actioned — close with the reasoning |

## Mapping for skills that speak triage-ese

Some skills use a five-role triage vocabulary. This repo does not use those labels;
map the roles as follows:

| Triage role | In this repo |
|---|---|
| `needs-triage` | An open issue with no priority label yet |
| `needs-info` | Comment on the issue pinging the reporter — no label |
| `ready-for-agent` | Any open issue with a priority label and a fully-specified body |
| `ready-for-human` | Not distinguished by label — say so in a comment if it matters |
| `wontfix` | `wontfix` |
