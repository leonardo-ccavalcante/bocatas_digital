/**
 * _shared.ts — shared helpers for the derivar router family.
 *
 * Only used within server/routers/derivar/. Not exported from the public
 * router surface (index.ts).
 */

/** Returns the user's display name, falling back to "Usuario <id>". */
export function resolveProfesionalNombre(user: {
  id: number;
  name: string | null;
}): string {
  return user.name ?? `Usuario ${String(user.id)}`;
}
