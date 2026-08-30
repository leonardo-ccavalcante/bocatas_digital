import type { User } from "../db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The acting user's auth UUID for a `*_por` column that FK-references
 * auth.users(id) — attendances.registrado_por and consents.registrado_por
 * are `UUID REFERENCES auth.users(id)`.
 *
 * Returns the id ONLY when it is a real auth UUID. The DEV_ADMIN_LOGIN synthetic
 * user carries a non-UUID id ("dev-admin-uuid") and is not a row in auth.users,
 * so writing it would fail the type / FK (23503) and break check-in in dev.
 * Any real authenticated staff id comes straight from auth.users(getUser), so it
 * always passes. Never trust a client-supplied actor id — only ctx.user.
 */
export function authActorId(user: User | null): string | null {
  return user && UUID_RE.test(user.id) ? user.id : null;
}
