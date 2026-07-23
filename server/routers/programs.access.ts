/**
 * programs.access.ts — Program-level access guard for session/enlace routers.
 *
 * Mirrors the role check in programs.ts#getAll: non-elevated roles (voluntario)
 * cannot interact with programs that have volunteer_can_access=false.
 *
 * Applied in: listSesiones, abrirSesion, cerrarSesion (programs.sessions.ts)
 *             generarEnlace, revogarEnlace, marcarAsistenciaSesion (programs.enlace.ts)
 *             getCloseConfig (programs.closeConfig.ts)
 *
 * NOT applied to enlaceGetSession / enlaceMarcarAsistencia / enlaceCerrar —
 * those are token-gated public procedures; the gate is at mint time (generarEnlace).
 *
 * RESIDUAL 1(c) fix: fail CLOSED — a query error or missing row is FORBIDDEN,
 * not a silent pass. Matches programs.ts#getAll fail-closed posture.
 */
import { TRPCError } from "@trpc/server";
import type { createAdminClient } from "../../client/src/lib/supabase/server";

type Supabase = ReturnType<typeof createAdminClient>;

interface MinUser {
  role: string;
}

/**
 * Throws FORBIDDEN when program.volunteer_can_access=false and the caller's
 * role is not admin or superadmin.
 *
 * Mirrors programs.ts#getAll role predicate exactly:
 *   role !== "admin" && role !== "superadmin" → apply the filter.
 *
 * RESIDUAL 1(c): fails CLOSED — if the programs row cannot be resolved (error
 * or no row), a non-elevated caller is denied rather than silently passing.
 */
export async function assertProgramAccessForRole(
  supabase: Supabase,
  programId: string,
  user: MinUser
): Promise<void> {
  if (user.role === "admin" || user.role === "superadmin") return;

  const { data, error } = await supabase
    .from("programs")
    .select("volunteer_can_access")
    .eq("id", programId)
    .single();

  // RESIDUAL 1(c): fail CLOSED — unresolvable program must never silently pass
  if (error || !data) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Acceso restringido: programa no encontrado o sin permisos",
    });
  }

  if (data.volunteer_can_access === false) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Acceso restringido: este programa no está disponible para voluntarios",
    });
  }
}
