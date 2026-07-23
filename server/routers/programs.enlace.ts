/**
 * programs.enlace.ts — Magic-link (enlace) + QR-in-session for cierre de sesión.
 *
 * Wired as programs.enlace.* in the programsRouter.
 *
 * SECURITY CRITICAL (gated by W5 /security-review):
 * - Public (token-gated) endpoints use publicProcedure; the token IS the auth.
 * - Token gate: hash match + not expired + estado ∈ {planificada, abierta}.
 * - Enlace responses contain ZERO high-risk PII (only nombre/apellidos/id).
 * - QR signatures are verified with ENV.qrSigningSecret (same as checkin.ts).
 * - Enrollment check: only attend-eligible states may mark attendance.
 *
 * ADR-0002: redactHighRiskFields is the app-wide PII wall; these endpoints
 * enforce it explicitly by selecting only safe columns.
 *
 * GROUP 4b fix: assertEnrolledForAttendance now rejects soft-deleted persons.
 * GROUP 7e fix: enlaceGetSession is a mutation (POST) so the token is in the
 *               body, not the query string — prevents access-log leakage.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, voluntarioProcedure } from "../_core/trpc";
import { createAdminClient } from "../../client/src/lib/supabase/server";
import { ENV } from "../_core/env";
import { parseQrPayload, verifySig } from "../../shared/qr/payload";
import { generateSessionToken, hashSessionToken, verifySessionToken } from "../../shared/sessionEnlace";
import { enforceCloseValidation, loadCloseConfig } from "./programs.sessionClose";
import { assertProgramAccessForRole } from "./programs.access";
import { insertSessionAttendance } from "./programs.sessionAttendance";

type Supabase = ReturnType<typeof createAdminClient>;

const uuidLike = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "UUID inválido");

/** Enrollment estados eligible for attendance (not final/terminated). */
const ATTEND_ELIGIBLE_LIST = [
  "inscrito", "preseleccionado", "admitido", "lista_espera", "activo", "pausado",
] as const;
const ATTEND_ELIGIBLE = new Set<string>(ATTEND_ELIGIBLE_LIST);

/** Session estados that allow enlace access. */
const ENLACE_OPEN_ESTADOS = new Set(["planificada", "abierta"]);

/** Verifies an enlace token against the DB row. Throws FORBIDDEN on any failure.
 * Returns the session row (without enlace_token_hash in the response payload).
 * Exported so programs.sessionDocuments.ts can reuse the same gate. */
export async function resolveAndVerifyEnlace(
  supabase: Supabase,
  sessionId: string,
  token: string
): Promise<{ id: string; program_id: string; location_id: string | null; estado: string; fecha: string }> {
  const { data: session, error } = await supabase
    .from("program_sessions")
    .select("id, program_id, location_id, estado, fecha, enlace_token_hash, enlace_expira")
    .eq("id", sessionId)
    .single();

  if (error || !session) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Enlace inválido o sesión no encontrada" });
  }
  if (!ENLACE_OPEN_ESTADOS.has(session.estado)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Esta sesión ya está cerrada o cancelada" });
  }
  if (!session.enlace_token_hash) {
    throw new TRPCError({ code: "FORBIDDEN", message: "El enlace de esta sesión ha sido revocado" });
  }
  if (session.enlace_expira && new Date(session.enlace_expira) < new Date()) {
    throw new TRPCError({ code: "FORBIDDEN", message: "El enlace ha expirado" });
  }

  const valid = await verifySessionToken(token, session.enlace_token_hash, ENV.sessionLinkSecret);
  if (!valid) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Token de enlace inválido" });
  }
  return {
    id: session.id,
    program_id: session.program_id,
    location_id: session.location_id,
    estado: session.estado,
    fecha: session.fecha,
  };
}

/** Looks up a program's slug by id. */
async function lookupProgramSlug(supabase: Supabase, programId: string): Promise<string> {
  const { data, error } = await supabase
    .from("programs")
    .select("slug")
    .eq("id", programId)
    .single();
  if (error || !data) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Programa no encontrado" });
  }
  return data.slug;
}

/**
 * Checks enrollment and attend-eligibility. Throws BAD_REQUEST if not enrolled.
 *
 * GROUP 4b fix: also rejects attendance for soft-deleted persons (Art.17 RGPD).
 */
async function assertEnrolledForAttendance(
  supabase: Supabase,
  personId: string,
  programId: string
): Promise<void> {
  // GROUP 4b: reject soft-deleted persons — erased persons may not record attendance
  const { data: person } = await supabase
    .from("persons")
    .select("id")
    .eq("id", personId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!person) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "No inscrito en este curso o sin estado activo para asistencia",
    });
  }

  const { data } = await supabase
    .from("program_enrollments")
    .select("estado")
    .eq("person_id", personId)
    .eq("program_id", programId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!data || !ATTEND_ELIGIBLE.has(data.estado)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "No inscrito en este curso o sin estado activo para asistencia",
    });
  }
}

/** Verifies a QR value signature. Throws FORBIDDEN if invalid or tampered. */
async function verifyQrOrThrow(qrValue: string, personId: string): Promise<void> {
  const parsed = parseQrPayload(qrValue);
  if (!parsed) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Formato de QR inválido" });
  }
  if (parsed.uuid.toLowerCase() !== personId.toLowerCase()) {
    throw new TRPCError({ code: "FORBIDDEN", message: "El QR no corresponde a la persona indicada" });
  }
  if (!ENV.qrSigningSecret || ENV.qrSigningSecret.length < 32) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "QR signing secret no configurado" });
  }
  const valid = await verifySig(parsed.uuid, parsed.sig, ENV.qrSigningSecret);
  if (!valid) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Firma del QR inválida o adulterada" });
  }
}

export const enlaceRouter = router({
  /**
   * Creates/regenerates the magic-link token for a session (staff only).
   * Returns the PLAINTEXT token ONCE — only the hash is stored.
   * GROUP 3: throws FORBIDDEN for voluntarios on volunteer_can_access=false programs.
   */
  generarEnlace: voluntarioProcedure
    .input(z.object({
      sessionId: uuidLike,
      expiresInHours: z.number().int().min(1).max(168).default(24),
    }))
    .mutation(async ({ input, ctx }) => {
      const supabase = createAdminClient();
      const { data: session, error } = await supabase
        .from("program_sessions")
        .select("id, estado, program_id")
        .eq("id", input.sessionId)
        .single();
      if (error || !session) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Sesión no encontrada" });
      }
      // GROUP 3: gate at mint time — volunteers cannot generate links for restricted programs
      await assertProgramAccessForRole(supabase, session.program_id, ctx.user);

      const token = generateSessionToken();
      const hash = await hashSessionToken(token, ENV.sessionLinkSecret);
      const expira = new Date(Date.now() + input.expiresInHours * 3600 * 1000).toISOString();
      await supabase.from("program_sessions").update({
        enlace_token_hash: hash,
        enlace_expira: expira,
      }).eq("id", input.sessionId);
      // Return plaintext token ONCE — caller shares it with the teacher
      return { token, expira };
    }),

  /**
   * Revokes the magic link — nulls hash and expiry (staff only).
   * RESIDUAL 1(a): look up the session's program_id and call assertProgramAccessForRole
   * so voluntarios cannot revoke enlaces on restricted programs.
   */
  revogarEnlace: voluntarioProcedure
    .input(z.object({ sessionId: uuidLike }))
    .mutation(async ({ input, ctx }) => {
      const supabase = createAdminClient();
      const { data: session, error } = await supabase
        .from("program_sessions")
        .select("id, program_id")
        .eq("id", input.sessionId)
        .single();
      if (error || !session) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Sesión no encontrada" });
      }
      await assertProgramAccessForRole(supabase, session.program_id, ctx.user);
      await supabase.from("program_sessions").update({
        enlace_token_hash: null,
        enlace_expira: null,
      }).eq("id", input.sessionId);
      return { success: true };
    }),

  /**
   * PUBLIC: token-gated session info + enrolled persons (id, nombre, apellidos ONLY).
   * Zero high-risk PII — explicitly selects only safe columns.
   *
   * GROUP 4a fix: filters out soft-deleted persons from the roster (Art.17 RGPD).
   * GROUP 7e fix: MUTATION (POST) so token travels in the request body, not the
   *   URL query string — prevents leaking the token into access logs / Referer headers.
   */
  enlaceGetSession: publicProcedure
    .input(z.object({ sessionId: uuidLike, token: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const supabase = createAdminClient();
      const session = await resolveAndVerifyEnlace(supabase, input.sessionId, input.token);

      const { data: enrollments } = await supabase
        .from("program_enrollments")
        .select("person_id, estado")
        .eq("program_id", session.program_id)
        .is("deleted_at", null)
        .in("estado", [...ATTEND_ELIGIBLE_LIST]);

      const personIds = (enrollments ?? []).map((e) => e.person_id);
      let persons: { id: string; nombre: string; apellidos: string }[] = [];
      if (personIds.length > 0) {
        // Explicitly select ONLY safe fields — never select PII like situacion_legal.
        // GROUP 4a: filter soft-deleted persons so erased individuals leave the roster.
        const { data: personRows } = await supabase
          .from("persons")
          .select("id, nombre, apellidos")
          .in("id", personIds)
          .is("deleted_at", null);
        persons = (personRows ?? []).map((p) => ({
          id: p.id,
          nombre: p.nombre ?? "",
          apellidos: (p as Record<string, unknown>)["apellidos"] as string ?? "",
        }));
      }

      // The public enlace page needs the close-form definition to render the
      // teacher's cierre fields. session_close_config is admin-authored field
      // metadata (slugs, labels, tipos, obligatorio flags) — ZERO person PII —
      // so it is safe over this token-gated boundary. getCloseConfig is
      // voluntarioProcedure (unreachable publicly), so it MUST come from here.
      const closeConfig = await loadCloseConfig(supabase, session.program_id);

      // Return session without the sensitive enlace_token_hash field
      return {
        session: {
          id: session.id,
          fecha: session.fecha,
          estado: session.estado,
          location_id: session.location_id,
        },
        persons,
        closeConfig,
      };
    }),

  /** PUBLIC: token-gated attendance marking (QR or personId). */
  enlaceMarcarAsistencia: publicProcedure
    .input(z.object({
      sessionId: uuidLike,
      token: z.string().min(1),
      personId: uuidLike,
      qrValue: z.string().optional(),
      enNombreDe: z.string().max(200).optional(),
    }))
    .mutation(async ({ input }) => {
      const supabase = createAdminClient();
      const session = await resolveAndVerifyEnlace(supabase, input.sessionId, input.token);

      if (input.qrValue) {
        await verifyQrOrThrow(input.qrValue, input.personId);
      }

      if (!session.location_id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "La sesión no tiene ubicación asignada. Contacte con el coordinador.",
        });
      }

      await assertEnrolledForAttendance(supabase, input.personId, session.program_id);
      const slug = await lookupProgramSlug(supabase, session.program_id);
      const metodo = input.qrValue ? "qr_scan" : "manual_busqueda";
      const enNombreDe = input.enNombreDe ? `enlace:${input.enNombreDe}` : "enlace";
      return insertSessionAttendance(
        supabase, input.personId, session.location_id, slug, input.sessionId, metodo, enNombreDe
      );
    }),

  /**
   * PUBLIC: token-gated session close (teacher closes via magic link).
   *
   * GROUP 2 fix: validates session_data against the program's session_close_config
   * using the same validateCloseData path as staff-authed cerrarSesion.
   * Unknown keys are stripped (whitelistSessionData) before persistence.
   */
  enlaceCerrar: publicProcedure
    .input(z.object({
      sessionId: uuidLike,
      token: z.string().min(1),
      session_data: z.record(z.string(), z.union([z.string(), z.number(), z.array(z.string()), z.null()])),
      enNombreDe: z.string().max(200).optional(),
    }))
    .mutation(async ({ input }) => {
      const supabase = createAdminClient();
      const session = await resolveAndVerifyEnlace(supabase, input.sessionId, input.token);
      if (session.estado !== "abierta") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Solo se pueden cerrar sesiones abiertas via enlace",
        });
      }

      // GROUP 2: validate + whitelist session_data against the program's close config.
      // Identical code path to cerrarSesion (staff-authed) — prevents bypass via enlace.
      const sanitized = await enforceCloseValidation(
        supabase,
        session.program_id,
        input.sessionId,
        input.session_data as Record<string, unknown>
      );

      // RESIDUAL 4(d): add .eq("estado","abierta") so concurrent double-close is idempotent
      await supabase.from("program_sessions").update({
        estado: "cerrada",
        closed_at: new Date().toISOString(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        session_data: sanitized as any,
        en_nombre_de: input.enNombreDe ? `enlace:${input.enNombreDe}` : "enlace",
      }).eq("id", input.sessionId).eq("estado", "abierta");
      return { success: true };
    }),

  /**
   * Staff-authed: mark attendance for a person in a session (QR or personId).
   * GROUP 3: throws FORBIDDEN for voluntarios on volunteer_can_access=false programs.
   */
  marcarAsistenciaSesion: voluntarioProcedure
    .input(z.object({
      sessionId: uuidLike,
      personId: uuidLike,
      qrValue: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const supabase = createAdminClient();
      const { data: session, error } = await supabase
        .from("program_sessions")
        .select("id, program_id, location_id, estado, fecha")
        .eq("id", input.sessionId)
        .single();
      if (error || !session) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Sesión no encontrada" });
      }

      // GROUP 3: check volunteer_can_access before recording attendance
      await assertProgramAccessForRole(supabase, session.program_id, ctx.user);

      if (input.qrValue) {
        await verifyQrOrThrow(input.qrValue, input.personId);
      }

      if (!session.location_id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "La sesión no tiene ubicación asignada",
        });
      }

      await assertEnrolledForAttendance(supabase, input.personId, session.program_id);
      const slug = await lookupProgramSlug(supabase, session.program_id);
      const metodo = input.qrValue ? "qr_scan" : "manual_busqueda";
      return insertSessionAttendance(
        supabase, input.personId, session.location_id, slug, input.sessionId, metodo, null
      );
    }),
});
