/**
 * instituciones/crud.ts — tRPC router for the `instituciones` reference table.
 *
 * Role access (mirrors DB RLS):
 *   - list / search / getById: voluntarioProcedure (voluntario + admin + superadmin)
 *   - create: adminProcedure (admin + superadmin)
 *   - update: superadminProcedure
 *   - deactivate: superadminProcedure
 *
 * The `distrito` column is auto-synced from `codigo_postal` via a DB trigger.
 * Never set `distrito` directly in insert/update.
 *
 * No PII in this table — instituciones are reference data (org names, addresses).
 * Log only ids, never names or contact details, in error paths.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";

import {
  router,
  adminProcedure,
  superadminProcedure,
  voluntarioProcedure,
} from "../../_core/trpc";
import { createAdminClient } from "../../../client/src/lib/supabase/server";
import { InstitucionCreateSchema } from "../../../shared/derivar/types";
import type { Database } from "../../../client/src/lib/database.types";
import { ilikeValue } from "../../_core/postgrestFilter";

type InstitucionUpdate = Database["public"]["Tables"]["instituciones"]["Update"];

/**
 * Intentionally uses a regex rather than z.string().uuid() because Zod v4
 * enforces UUID version bytes (1-8) which rejects sentinel/test UUIDs that
 * are valid per RFC 4122 section 4.1.7 (nil UUID and all-zero variants).
 * This mirrors the pattern used in server/routers/families/_shared.ts.
 */
const uuidSchema = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    "Invalid UUID format",
  );

// ─── list ────────────────────────────────────────────────────────────────────

const listInputSchema = z
  .object({
    search: z.string().max(200).optional(),
    area: z.string().optional(),
    distrito: z.string().optional(),
    is_active: z.boolean().optional(),
    offset: z.number().int().min(0).default(0),
    limit: z.number().int().min(1).max(500).default(50),
  })
  .optional();

// ─── update ──────────────────────────────────────────────────────────────────

const updateInputSchema = z.object({
  id: uuidSchema,
  data: InstitucionCreateSchema.partial().extend({
    is_active: z.boolean().optional(),
  }),
});

// ─── Router ──────────────────────────────────────────────────────────────────

export const institucionesRouter = router({
  /**
   * Typeahead-friendly search (max 20). Available to all authenticated staff.
   */
  search: voluntarioProcedure
    .input(
      z.object({
        q: z.string().max(200).optional(),
        area: z.string().optional(),
        activeOnly: z.boolean().default(true),
      }),
    )
    .query(async ({ input }) => {
      const db = createAdminClient();
      let q = db
        .from("instituciones")
        .select("*")
        .limit(20)
        .order("nombre", { ascending: true });

      if (input.activeOnly) q = q.eq("is_active", true);
      if (input.q?.trim()) q = q.ilike("nombre", ilikeValue(input.q.trim()));
      if (input.area) q = q.contains("areas", [input.area]);

      const { data, error } = await q;
      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }
      return data ?? [];
    }),

  /**
   * Paginated full list with optional filters. Admin-only (strategic data).
   */
  list: adminProcedure.input(listInputSchema).query(async ({ input }) => {
    const offset = input?.offset ?? 0;
    const limit = input?.limit ?? 50;

    const db = createAdminClient();
    let q = db
      .from("instituciones")
      .select("*", { count: "exact" })
      .order("nombre", { ascending: true })
      .range(offset, offset + limit - 1);

    // Default to active-only unless caller explicitly passes is_active: false
    if (input?.is_active !== undefined) {
      q = q.eq("is_active", input.is_active);
    } else {
      q = q.eq("is_active", true);
    }

    if (input?.search?.trim()) {
      q = q.ilike("nombre", ilikeValue(input.search.trim()));
    }
    if (input?.area) {
      q = q.contains("areas", [input.area]);
    }
    if (input?.distrito) {
      q = q.eq("distrito", input.distrito);
    }

    const { data, error, count } = await q;
    if (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error.message,
      });
    }
    return { rows: data ?? [], total: count ?? 0 };
  }),

  /**
   * Fetch a single institution by id. Admin-only.
   */
  getById: adminProcedure
    .input(z.object({ id: uuidSchema }))
    .query(async ({ input }) => {
      const db = createAdminClient();
      const { data, error } = await db
        .from("instituciones")
        .select("*")
        .eq("id", input.id)
        .single();

      if (error || !data) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      return data;
    }),

  /**
   * Create a new institution. Admin and superadmin only.
   * `created_by` is set from the authenticated user id.
   * `distrito` is auto-synced by DB trigger — do not pass it.
   */
  create: adminProcedure
    .input(InstitucionCreateSchema)
    .mutation(async ({ ctx, input }) => {
      const db = createAdminClient();
      const { data, error } = await db
        .from("instituciones")
        .insert({
          nombre: input.nombre,
          tipo: input.tipo ?? null,
          areas: input.areas,
          direccion: input.direccion ?? null,
          codigo_postal: input.codigo_postal ?? null,
          telefono: input.telefono ?? null,
          email: input.email ?? null,
          notas: input.notas ?? null,
          created_by: String(ctx.user.id),
        })
        .select()
        .single();

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }
      return data;
    }),

  /**
   * Partial update of an institution. Superadmin only.
   * `distrito` is excluded — it is derived from `codigo_postal` via DB trigger.
   */
  update: superadminProcedure
    .input(updateInputSchema)
    .mutation(async ({ input }) => {
      const db = createAdminClient();

      const updatePayload: InstitucionUpdate = {
        updated_at: new Date().toISOString(),
      };

      const d = input.data;
      if (d.nombre !== undefined) updatePayload.nombre = d.nombre;
      if (d.tipo !== undefined) updatePayload.tipo = d.tipo ?? null;
      if (d.areas !== undefined) updatePayload.areas = d.areas;
      if (d.direccion !== undefined) updatePayload.direccion = d.direccion ?? null;
      if (d.codigo_postal !== undefined) updatePayload.codigo_postal = d.codigo_postal ?? null;
      if (d.telefono !== undefined) updatePayload.telefono = d.telefono ?? null;
      if (d.email !== undefined) updatePayload.email = d.email ?? null;
      if (d.notas !== undefined) updatePayload.notas = d.notas ?? null;
      if (d.is_active !== undefined) updatePayload.is_active = d.is_active;

      const { data, error } = await db
        .from("instituciones")
        .update(updatePayload)
        .eq("id", input.id)
        .select()
        .single();

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }
      return data;
    }),

  /**
   * Soft-deactivate an institution. Superadmin only.
   * Sets `is_active = false`; does not delete the row (referential integrity
   * for existing derivaciones).
   */
  deactivate: superadminProcedure
    .input(z.object({ id: uuidSchema }))
    .mutation(async ({ input }) => {
      const db = createAdminClient();
      const { data, error } = await db
        .from("instituciones")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("id", input.id)
        .select()
        .single();

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }
      return data;
    }),
});

export type InstitucionesRouter = typeof institucionesRouter;
