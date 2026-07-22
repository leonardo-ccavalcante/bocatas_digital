# ADR-0003: XState only for the check-in flow

**Status:** Accepted

## Context

XState gives explicit, testable state machines — valuable for flows with genuinely distinct states and transitions. But it adds ceremony and a learning cost. Applied to simple forms it's over-engineering, and inconsistent use ("some flows are machines, some aren't, for no clear reason") makes the codebase harder to reason about.

The check-in flow is the one place with real state complexity: idle → scanning → registered / already-checked-in / not-found, plus a manual fallback and optimistic offline behavior, all under an < 8s latency target.

## Decision

XState is used **only** for the check-in flow. Every other flow — registration, family CRUD, dashboard, announcements — uses plain React state, TanStack Query for server state, and Zustand for global UI state. Do not introduce XState elsewhere.

## Consequences

- The check-in machine is explicit and testable, matching its real complexity.
- Contributors have one clear rule: if it isn't check-in, don't reach for XState.
- New flows that *seem* to want a machine should first justify why they differ from "a form with TanStack Query"; if there's a genuine case, supersede this ADR rather than quietly adding a second machine.
