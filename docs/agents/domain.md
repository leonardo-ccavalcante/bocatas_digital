# Domain Docs

How engineering agents and skills should consume this repo's domain documentation
when exploring the codebase.

This is a **single-context** repo: one product (Vite client + Express server in one
tree).

## Before exploring, read these

- **`CONTEXT.md`** at the repo root (domain glossary / ubiquitous language), and
- **`docs/adr/`** — read the ADRs that touch the area you're about to work in.

If a file doesn't exist yet, **proceed silently**. Don't flag its absence; docs are
created lazily when terms or decisions actually crystallize.

## File structure

```text
/
├── AGENTS.md          ← canonical playbook (all agents)
├── CONTEXT.md         ← domain glossary
├── ARCHITECTURE.md    ← security/auth architecture notes
├── docs/adr/          ← numbered architectural decisions
├── client/            ← Vite SPA
├── server/            ← Express + tRPC
└── shared/            ← shared types & helpers
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a
hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to
synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're
inventing language the project doesn't use (reconsider), or there's a real gap (note
it, then add the term via a small PR once the definition crystallizes).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than
silently overriding:

> _Contradicts ADR-0007 (some decision) — but worth reopening because…_
