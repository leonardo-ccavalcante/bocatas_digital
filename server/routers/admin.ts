/**
 * admin.ts — tRPC router for superadmin-only staff user management.
 *
 * Procedures:
 *   - getStaffUsers    (D-B11): list auth.users where role in (admin, voluntario, superadmin)
 *   - createStaffUser  (D-B12): invite new staff user with app_metadata.role
 *   - revokeStaffAccess(D-B13): set app_metadata.role = null
 *
 * All procedures are superadmin-only (Job 6, AC1).
 * Uses service_role key — NEVER exposed to client (Job 6, AC4).
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, superadminProcedure } from "../\_core/trpc";
import { createAdminClient } from "../../client/src/lib/supabase/server";
import { softDeleteRecoveryRouter } from "./admin/soft-delete-recovery";
import { logAudit, logProcedureError } from "../\_core/logging-middleware";

// NOTE the `i` flag: an uppercase UUID is accepted here and resolves to the same
// row in Postgres. Any comparison against a user id MUST therefore normalise —
// GoTrue always returns lowercase, so a raw `===` against an uppercased input
// silently fails to match the same person. Use `sameUser()` below, never `===`.
const uuidLike = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "Invalid UUID format");

/** Case-insensitive identity compare for auth UUIDs. See the note above. */
function sameUser(a: string | undefined, b: string | undefined): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

/**
 * Refuse an action that would remove the last superadmin.
 *
 * Since #144 the role in `app_metadata` is what actually grants access, so
 * demoting or revoking the final superadmin is irreversible from inside the app:
 * `setUserRole` and `revokeStaffAccess` are both superadmin-only, and
 * `createStaffUser` can only grant `admin | voluntario`. Recovery would need the
 * Supabase dashboard.
 *
 * RESIDUAL RACE, accepted: this is a read-then-write with no transaction, so two
 * superadmins demoting each other in overlapping requests can still both pass.
 * The Admin API offers no atomic alternative; this closes the sequential case,
 * which is the realistic one. A DB-level invariant would need the role to live
 * in a table we control — see #144's follow-up on retiring `app_users`.
 */
async function assertNotLastSuperadmin(
  supabase: ReturnType<typeof createAdminClient>,
  targetUserId: string
): Promise<void> {
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Error al comprobar los superadmins: ${error.message}`,
    });
  }
  const superadmins = (data.users ?? []).filter(
    (u) => (u.app_metadata?.role as string | undefined) === "superadmin"
  );
  // Only a change that touches a CURRENT superadmin can reduce the count.
  if (!superadmins.some((u) => sameUser(u.id, targetUserId))) return;
  if (superadmins.length <= 1) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Es el último superadmin. Nombra a otro superadmin antes de cambiar o revocar este acceso.",
    });
  }
}

// Using exported superadminProcedure from server/_core/trpc

export const adminRouter = router({
  softDelete: softDeleteRecoveryRouter,
  /**
   * D-B11: List all staff users (role = admin | voluntario | superadmin).
   * Returns: id, email, nombre, role, created_at
   */
  getStaffUsers: superadminProcedure.query(async () => {
    const supabase = createAdminClient();

    const { data, error } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });

    if (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Error al obtener usuarios: ${error.message}`,
      });
    }

    // Filter to staff roles only
    const staffUsers = (data.users ?? [])
      .filter((u) => {
        const role = u.app_metadata?.role as string | undefined;
        return role === "admin" || role === "voluntario" || role === "superadmin";
      })
      .map((u) => ({
        id: u.id,
        email: u.email ?? "",
        nombre: (u.user_metadata?.nombre as string) ?? (u.user_metadata?.name as string) ?? "",
        role: (u.app_metadata?.role as string) ?? "user",
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at ?? null,
      }));

    return staffUsers;
  }),

  /**
   * D-B12: Create a new staff user via Supabase invite flow.
   * Sets app_metadata.role correctly. Sends invite email.
   * Superadmin-only. Service role key never exposed to client.
   */
  createStaffUser: superadminProcedure
    .input(
      z.object({
        email: z.string().email("Email inválido"),
        nombre: z.string().min(2, "El nombre debe tener al menos 2 caracteres").max(100),
        role: z.enum(["admin", "voluntario"]).refine((v) => ["admin", "voluntario"].includes(v), {
          message: "El rol debe ser 'admin' o 'voluntario'",
        }),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const supabase = createAdminClient();

      const { data, error } = await supabase.auth.admin.createUser({
        email: input.email,
        email_confirm: false, // triggers invite email flow
        app_metadata: {
          role: input.role,
        },
        user_metadata: {
          nombre: input.nombre,
          name: input.nombre,
        },
      });

      if (error) {
        logProcedureError(ctx, "admin.createStaffUser failed", error as Error, {
          assignedRole: input.role,
        });
        // 422 or duplicate email
        if (
          error.message.toLowerCase().includes("already") ||
          error.message.toLowerCase().includes("duplicate") ||
          error.message.toLowerCase().includes("exists") ||
          error.status === 422
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Este email ya tiene una cuenta en el sistema",
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Error al crear usuario: ${error.message}`,
        });
      }

      // Audit success with stable user_id (no PII).
      logAudit(ctx, "admin.createStaffUser", {
        targetUserId: data.user.id,
        assignedRole: input.role,
      });

      return {
        id: data.user.id,
        email: data.user.email ?? input.email,
        nombre: input.nombre,
        role: input.role,
        created_at: data.user.created_at,
      };
    }),

  /**
   * T7-E1: Set user role — assign any role to a user by their Supabase auth UUID.
   * Admin-only. Used from PersonaDetalle to promote/demote users.
   */
  setUserRole: superadminProcedure
    .input(
      z.object({
        userId: uuidLike,
        role: z.enum(["beneficiario", "voluntario", "admin", "superadmin"]),
        nombre: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // No self-demotion. Since #144 the role in app_metadata is what actually
      // grants access, so a superadmin demoting themselves takes effect on their
      // very next request. Compared case-insensitively: `uuidLike` accepts an
      // uppercase UUID that resolves to the same row, so a raw `===` would let
      // the guard be walked straight past.
      if (sameUser(input.userId, ctx.user.id)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No puedes cambiar tu propio rol. Pídeselo a otro superadmin.",
        });
      }

      const supabase = createAdminClient();
      // Blocking yourself is not enough: superadmin A demoting superadmin B is
      // just as final when B is the last one left.
      await assertNotLastSuperadmin(supabase, input.userId);
      const { error } = await supabase.auth.admin.updateUserById(input.userId, {
        app_metadata: { role: input.role },
      });
      if (error) {
        logProcedureError(ctx, "admin.setUserRole failed", error as Error, {
          targetUserId: input.userId,
          newRole: input.role,
        });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Error al asignar rol: ${error.message}`,
        });
      }
      // Audit success — stable IDs only, no PII (target_nombre dropped).
      logAudit(ctx, "admin.setUserRole", {
        targetUserId: input.userId,
        newRole: input.role,
      });
      return { success: true, userId: input.userId, role: input.role };
    }),

  /**
   * T7-D1: List ALL users (all roles including beneficiario) for admin directory.
   */
  getAllUsers: superadminProcedure
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        perPage: z.number().int().min(1).max(100).default(50),
        role: z.enum(["beneficiario", "voluntario", "admin", "superadmin", "all"]).default("all"),
        search: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const supabase = createAdminClient();
      const { data, error } = await supabase.auth.admin.listUsers({
        page: input.page,
        perPage: input.perPage,
      });
      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Error al obtener usuarios: ${error.message}`,
        });
      }
      let users = (data.users ?? []).map((u) => ({
        id: u.id,
        email: u.email ?? "",
        nombre: (u.user_metadata?.nombre as string) ?? (u.user_metadata?.name as string) ?? u.email ?? "",
        role: (u.app_metadata?.role as string) ?? "beneficiario",
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at ?? null,
      }));
      if (input.role !== "all") {
        users = users.filter((u) => u.role === input.role);
      }
      if (input.search) {
        const q = input.search.toLowerCase();
        users = users.filter(
          (u) => u.nombre.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
        );
      }
      return { users, total: users.length };
    }),

  /**
   * D-B13: Revoke staff access by setting app_metadata.role = null.
   * User's JWT is invalidated on next request.
   */
  revokeStaffAccess: superadminProcedure
    .input(
      z.object({
        userId: uuidLike,
        nombre: z.string().optional(), // for confirmation message
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Same two guards as setUserRole. Revocation is the more lethal of the
      // pair — it nulls the role outright — and it had neither: the only thing
      // stopping a superadmin from revoking themselves was the UI hiding the
      // button for superadmin rows, which binds nothing for a direct API call.
      if (sameUser(input.userId, ctx.user.id)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No puedes revocarte el acceso a ti mismo. Pídeselo a otro superadmin.",
        });
      }

      const supabase = createAdminClient();
      await assertNotLastSuperadmin(supabase, input.userId);

      const { error } = await supabase.auth.admin.updateUserById(input.userId, {
        app_metadata: {
          role: null,
        },
      });

      if (error) {
        logProcedureError(ctx, "admin.revokeStaffAccess failed", error as Error, {
          targetUserId: input.userId,
        });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Error al revocar acceso: ${error.message}`,
        });
      }

      // Audit success — stable IDs only, no PII (target_nombre dropped).
      logAudit(ctx, "admin.revokeStaffAccess", {
        targetUserId: input.userId,
      });

      return { success: true, userId: input.userId };
    }),
});
