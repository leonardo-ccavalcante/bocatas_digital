/**
 * PERSONS_DIRECTORY_FULL_LIMIT — MYT-80-ATL03 review follow-up (P1, gh #80).
 *
 * `persons.getAll` is now server-paginated (bounded default page, hard-capped
 * at `PERSONS_GETALL_MAX_LIMIT` in `server/routers/persons/crud.ts`). But the
 * admin directory (`pages/Personas.tsx` — filter pills, estado/fase counts,
 * text search) and the role/fase management table
 * (`features/persons/components/PersonsTable.tsx`) are both designed to
 * filter/sort/count over the FULL person set client-side (see
 * `pages/Personas.hooks.ts`, `usePersonsData`) — they are not paginated UIs.
 * Both call sites pass this explicit `limit` so today's full-directory
 * behavior is preserved instead of being silently truncated to the server's
 * bounded default (which would hide every person past the cutoff from search,
 * counts, and role management).
 *
 * Must stay <= the server's `PERSONS_GETALL_MAX_LIMIT` (the input schema
 * rejects anything higher) and >= the real person count (707+ and growing)
 * or the directory silently truncates again. When it needs to grow past this
 * cap, that's the signal to build the real pager UI (gh #80 follow-up)
 * instead of raising the number again.
 */
export const PERSONS_DIRECTORY_FULL_LIMIT = 1000;
