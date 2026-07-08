# ADR-0001: Zod is the single source of validation truth

**Status:** Accepted

## Context

Validation logic in a TypeScript full-stack app tends to get duplicated: once in the form component, once in the API handler, once as a TypeScript type. Duplication drifts — a field becomes required on the server but not the client, or an enum gains a value in one place and not the other. The DB schema (Supabase/Postgres) is the storage truth, but it can't validate at the application boundary.

## Decision

Zod schemas are the **single source of truth for validation**. Each feature owns its schemas, co-located at `repo/client/src/features/{name}/schemas.ts` (or a `schemas/` directory for larger features). Schemas mirror the DB structure and are reused on both client and server. TypeScript types are derived from Zod (`z.infer`), not hand-written alongside it.

- Never duplicate a Zod schema in a component.
- Server-side validation is mandatory for all sensitive fields.
- The Schema Agent owns `schemas/`; migrations come first, then types are regenerated (`supabase gen types`), then Zod is updated to match.

## Consequences

- One place to change a validation rule; client and server stay in lockstep.
- Forms, tRPC procedures, and types all consume the same schema.
- Adds a discipline cost: schema changes are upstream work and must precede feature work that depends on them.
- `database.types.ts` is generated, never hand-edited — Zod schemas are the editable mirror.
