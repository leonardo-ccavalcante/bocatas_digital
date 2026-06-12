/**
 * postgrestFilter.ts — Safe embedding of user input into PostgREST filters.
 *
 * THE PROBLEM (Mythos CAS-04 + cassandra follow-up)
 * --------------------------------------------------
 * Supabase/PostgREST filters are *strings*. User input reaches an `ilike` filter
 * in TWO syntactically different contexts, and — verified empirically against a
 * real PostgREST — each context needs a DIFFERENT escaping. A single helper for
 * both is wrong for both.
 *
 *   (a) Filter-list embed:  .or(`nombre.ilike.${P},apellidos.ilike.${P}`)
 *       PostgREST parses `.or(...)` as a comma-separated list with `()` grouping.
 *       A raw value containing `,` `(` `)` `.` `:` breaks out and can INJECT
 *       extra filters (e.g. `x,nombre.ilike.*` widens the result to every row;
 *       `x,deleted_at.is.null` corrupts the logic tree → 500). The value here is
 *       NOT URL-encoded by supabase-js as an isolated token, so it must be made
 *       safe by quoting it.
 *
 *   (b) Positional value:  .ilike("nombre", P)
 *       supabase-js URL-encodes the value itself, so list-breakout chars are
 *       harmless — but a `"` wrapper is sent literally and matches nothing, and
 *       LIKE wildcards still apply.
 *
 * EMPIRICAL TRUTH TABLE (live local PostgREST, searching the literal `ZZ100%`
 * against rows {`ZZ100%lit`, `ZZ100x`}; ✓ = matches ONLY the literal row):
 *
 *   form                         | (a) .or()        | (b) .ilike(col,val)
 *   -----------------------------|------------------|--------------------
 *   raw `%v%`                    | both (wildcard)  | both (wildcard)
 *   single-bs `%v\%%`            | ✓                | ✓
 *   double-bs `%v\\%%`           | empty            | empty
 *   single-bs QUOTED `"%v\%%"`   | both (wildcard!) | empty ("→literal)
 *   double-bs QUOTED `"%v\\%%"`  | ✓                | empty ("→literal)
 *
 *   And for an injection payload `x,nombre.ilike.*` in the two-column .or():
 *     UNQUOTED → matched ALL rows (INJECTION) / parse-error 500
 *     QUOTED   → matched nothing (safe)
 *
 * So:
 *   - Context (a) MUST quote (security: blocks list breakout/injection) AND use
 *     a DOUBLE backslash — PostgREST's quoted-value parser consumes one backslash
 *     layer, so `\\%` on the wire reaches LIKE as `\%` → literal `%`.
 *   - Context (b) MUST NOT quote (a literal `"` is sent and matches nothing) and
 *     uses a SINGLE backslash — the value reaches LIKE directly as `\%`.
 *
 * In BOTH contexts, PostgREST aliases a bare `*` to `%` (a wildcard) and there is
 * NO transport-safe backslash escape for it (`\*`, `**`, `%2A` all fail through
 * supabase-js). A literal-`*` substring search is therefore not expressible in a
 * PostgREST `ilike`; we strip `*` from the user value so it cannot widen the
 * match. `*` cannot break out of an `.or()` list (only `,` `(` `)` can), so this
 * is a correctness/over-match guard, not a hole.
 *
 * Two functions, one per context. Callers pass the RAW user value and add no `%`.
 */

/**
 * Escape the SQL LIKE metacharacters in a user value, with `escapePercent`
 * controlling how many backslashes precede a literal `%`/`_`:
 *   - 1 backslash for the positional value path (reaches LIKE directly).
 *   - 2 backslashes for the quoted `.or()` path (the quoted-value parser eats one).
 * `*` is stripped (PostgREST aliases it to `%`; no transport-safe escape exists).
 */
function escapeLikeBody(input: string, backslashes: "single" | "double"): string {
  const bs = backslashes === "double" ? "\\\\" : "\\";
  return (
    input
      // Drop the *→% alias: not backslash-escapable through supabase-js.
      .replace(/\*/g, "")
      // Backslash first so it does not escape an escape we add afterwards.
      .replace(/\\/g, bs + bs)
      // SQL LIKE wildcards → literal.
      .replace(/%/g, bs + "%")
      .replace(/_/g, bs + "_")
  );
}

/**
 * Build the `ilike` token to embed AFTER `ilike.` inside a `.or(...)` filter list.
 * The token is double-quoted (blocks `,`/`(`/`)` list breakout + injection) and
 * uses double-backslash escapes (survive PostgREST's quoted-value parser).
 *
 *   .or(`nombre.ilike.${ilikeForOr(v)},apellidos.ilike.${ilikeForOr(v)}`)
 *
 * Returns e.g. `"%García%"` — a case-insensitive literal substring match, safe.
 *
 * @param input Raw user input (caller may `.trim()` first; do NOT add `%`).
 */
export function ilikeForOr(input: string): string {
  const escaped = escapeLikeBody(input, "double")
    // Transport-level: PostgREST's quoted-value grammar escapes an embedded
    // double quote with a BACKSLASH (\"), which the parser consumes to a literal
    // `"` — NOT by SQL-style doubling (`""`, which early-closes the token and
    // breaks the search). Verified empirically against live PostgREST. (CAS-04)
    .replace(/"/g, '\\"');
  // Outer % are genuine wildcards (substring); whole token quoted for safety.
  return `"%${escaped}%"`;
}

/**
 * Build the positional `pattern` argument for `.ilike(column, pattern)`.
 * NOT quoted — supabase-js URL-encodes the value, so list-breakout chars are
 * inert; a literal `"` would otherwise be sent and match nothing. Single
 * backslash escapes reach LIKE directly.
 *
 *   .ilike("nombre", ilikeValue(v))
 *
 * Returns e.g. `%García%` — a case-insensitive literal substring match, safe.
 *
 * @param input Raw user input (caller may `.trim()` first; do NOT add `%`).
 */
export function ilikeValue(input: string): string {
  return `%${escapeLikeBody(input, "single")}%`;
}
