/**
 * postgrestFilter.ts — Safe embedding of user input into PostgREST filters.
 *
 * THE PROBLEM (Mythos CAS-04)
 * ---------------------------
 * Supabase/PostgREST filters are *strings*. The two ways user input reaches a
 * filter are both unsafe when the value is interpolated raw:
 *
 *   .or(`nombre.ilike.%${v}%,apellidos.ilike.%${v}%`)
 *   .ilike("nombre", `%${v}%`)
 *
 * PostgREST parses `.or(...)` as a comma-separated filter list with `()`
 * grouping. A value containing `,` `(` `)` `.` `:` can break out of the
 * intended filter or inject extra ones. Inside a `like`/`ilike` pattern the
 * SQL LIKE metacharacters `%` and `_` are wildcards, and PostgREST additionally
 * treats `*` as an alias for `%`. So a raw value can silently alter matching
 * (e.g. `100%` matches far more than the literal string) or, in the `.or()`
 * list context, escape the filter entirely.
 *
 * THE FIX
 * -------
 * One helper, applied at every raw site. It returns the COMPLETE, already
 * double-quoted `ilike` pattern token for a literal substring search, safe to
 * embed directly after `ilike.` inside `.or(...)` and equally safe as the
 * positional `pattern` argument of `.ilike(column, pattern)`.
 *
 * Two layers of escaping:
 *
 *   1. SQL LIKE metacharacters in the *user value* are backslash-escaped so
 *      they match literally: `\` → `\\` (first, so it doesn't escape a later
 *      escape), then `%` → `\%`, `_` → `\_`. PostgreSQL's default LIKE escape
 *      character is `\`, so `\%` matches a literal `%`, etc.
 *
 *   2. The whole token is wrapped in double quotes — PostgREST's documented
 *      mechanism for a value containing reserved characters (`,` `.` `:` `()`
 *      `"`). The quotes are a transport-level delimiter stripped before the
 *      value reaches PostgreSQL's LIKE, so they neutralise `.or()` list
 *      breakout AND disable the `*`→`%` alias (the alias applies only to bare,
 *      unquoted patterns). An embedded `"` in the user value is escaped by
 *      doubling it (`"` → `""`), per PostgREST's quoting rules.
 *
 * The substring anchors (`%...%`) are placed INSIDE the quotes by the helper so
 * they remain genuine wildcards while the user value between them is literal.
 * Callers therefore pass the RAW user value and must NOT add their own `%`.
 *
 * Behaviour is preserved: still a case-insensitive substring search, just safe.
 */

/**
 * Escape a user-supplied value and wrap it as a complete, double-quoted
 * `ilike` substring pattern (`"%<escaped>%"`).
 *
 * Embed the result directly after `ilike.` — do NOT add surrounding `%`:
 *
 *   // inside .or(...)
 *   .or(`nombre.ilike.${escapeIlikePattern(v)},apellidos.ilike.${escapeIlikePattern(v)}`)
 *
 *   // positional .ilike(column, pattern)
 *   .ilike("nombre", escapeIlikePattern(v))
 *
 * @param input Raw user input (already `.trim()`ed by the caller if desired).
 * @returns A double-quoted `ilike` pattern token doing a literal substring match.
 */
export function escapeIlikePattern(input: string): string {
  const escaped = input
    // Backslash first so it does not escape an escape we add afterwards.
    .replace(/\\/g, "\\\\")
    // SQL LIKE wildcards → literal.
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")
    // Transport-level: an embedded double quote is escaped by doubling.
    .replace(/"/g, '""');

  // Outer % are real wildcards (substring); the whole token is double-quoted so
  // PostgREST reserved chars (, . : ( ) ") cannot break out of an .or() list
  // and the *→% alias is disabled.
  return `"%${escaped}%"`;
}
