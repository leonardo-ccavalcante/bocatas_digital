/**
 * postgrestFilter.ts — server re-export of the shared PostgREST filter helpers.
 *
 * The canonical implementation lives in `shared/postgrestFilter.ts` so the
 * SAME escaping is used by both the Express/tRPC server and the React client
 * (single source of truth — the client dup-check fallback must escape identically).
 */
export { ilikeForOr, ilikeValue } from "../../shared/postgrestFilter";
