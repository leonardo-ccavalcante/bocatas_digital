/**
 * types.ts — Shared type definitions for the sessions sub-feature.
 */

/** Values submitted via the session close form. */
export type SessionDataValues = Record<string, string | number | string[] | null>;
