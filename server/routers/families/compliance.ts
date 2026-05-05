import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure, protectedProcedure } from "../../_core/trpc";
import { createAdminClient } from "../../../client/src/lib/supabase/server";
import {
  isMemberAdult,
  REQUIRED_FAMILY_DOC_TYPES,
  REQUIRED_PER_MEMBER_DOC_TYPES,
} from "../../families-doc-helpers";
import { uuidLike } from "./_shared";

export const complianceRouter = router({
  // ─── Job 7: Volunteer Identity Verifier ─────────────────────────────────
  /** Search families for volunteer identity verification (field-level redaction) */
  verifyIdentity: protectedProcedure
    .input(z.object({ query: z.string().min(1) }))
    .query(async ({ input }) => {
      const db = createAdminClient();
      const queryNum = parseInt(input.query);

      let query = db
        .from("families")
        .select(
          `id, familia_numero, estado, persona_recoge, autorizado,
           autorizado_documento_url, num_adultos, num_menores_18,
           persons!titular_id(nombre, apellidos)`
        )
        .eq("estado", "activa")
        .is("deleted_at", null);

      if (!isNaN(queryNum)) {
        query = query.eq("familia_numero", queryNum);
      } else {
        query = query.ilike("persons.nombre", `%${input.query}%`);
      }

      const { data, error } = await query.limit(5);
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      if (!data?.length) return [];

      // Field-level redaction — high-risk PII NEVER exposed via this endpoint regardless of role
      return data.map((f) => {
        const persons = f.persons as { nombre: string; apellidos: string } | null;
        return {
          id: f.id,
          familia_numero: f.familia_numero,
          titular_nombre: persons
            ? `${persons.nombre} ${persons.apellidos}`.trim()
            : "",
          num_miembros: (f.num_adultos ?? 0) + (f.num_menores_18 ?? 0),
          persona_recoge: f.persona_recoge,
          autorizado: f.autorizado,
          autorizado_documento_url: f.autorizado_documento_url ?? null,
          // NOT included: situacion_legal, foto_documento_url, recorrido_migratorio
        };
      });
    }),

  // ─── Job 8: Per-member Pending Items ────────────────────────────────────
  /**
   * GET pending consent + doc items per member (for Job 8 + Job 9 Layer B).
   *
   * Iterates (family × required-doc-config) instead of scanning existing
   * family_member_documents rows. Returns one row per (family, member) with
   * missing: string[].
   *
   * Required doc sets sourced from `families-doc-helpers` to avoid drift:
   *   Family-level required: padron_municipal, informe_social
   *   Per-member required (age ≥14): documento_identidad, consent_bocatas, consent_banco_alimentos
   */
  getPendingItems: adminProcedure
    .input(z.object({ family_id: uuidLike.optional() }))
    .query(async ({ input }) => {
      const db = createAdminClient();

      const REQUIRED_FAMILY_DOCS = REQUIRED_FAMILY_DOC_TYPES;
      const REQUIRED_PER_MEMBER_DOCS = REQUIRED_PER_MEMBER_DOC_TYPES;

      let familiesQuery = db
        .from("families")
        .select(
          "id, familia_numero, created_at, persons!titular_id(id, nombre, apellidos, telefono)"
        )
        .eq("estado", "activa")
        .is("deleted_at", null);

      if (input.family_id) {
        familiesQuery = familiesQuery.eq("id", input.family_id);
      }

      const { data: families, error: famErr } = await familiesQuery;
      if (famErr) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: famErr.message });
      if (!families?.length) return [];

      const familyIds = families.map((f) => f.id);

      // Fetch all members for these families from familia_miembros in one query.
      const { data: allMemberRows = [] } = await db
        .from("familia_miembros")
        .select("id, familia_id, nombre, apellidos, person_id, fecha_nacimiento, relacion")
        .in("familia_id", familyIds)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
      const membersByFamily = new Map<string, typeof allMemberRows>();
      for (const m of allMemberRows ?? []) {
        const list = membersByFamily.get(m.familia_id) ?? [];
        list.push(m);
        membersByFamily.set(m.familia_id, list);
      }

      // Fetch all uploaded current docs for these families in a single query.
      const { data: uploadedDocs } = await db
        .from("family_member_documents")
        .select("family_id, member_index, documento_tipo")
        .in("family_id", familyIds)
        .is("deleted_at", null)
        .eq("is_current", true)
        .not("documento_url", "is", null);

      const uploadedKeySet = new Set(
        (uploadedDocs ?? []).map(
          (d: { family_id: string; member_index: number; documento_tipo: string }) =>
            `${d.family_id}:${d.member_index}:${d.documento_tipo}`
        )
      );

      const today = new Date();

      const result: {
        family_id: string;
        familia_numero: number;
        member_index: number;
        member_name: string;
        parentesco: string;
        person_id: string | null;
        missing: string[];
        days_pending: number;
      }[] = [];

      for (const family of families) {
        const familyCreatedAt = new Date(family.created_at);
        const daysPending = Math.floor(
          (today.getTime() - familyCreatedAt.getTime()) / (1000 * 60 * 60 * 24)
        );

        // ── Family-level required docs (member_index = -1) ─────────────────
        const familyMissingDocs = REQUIRED_FAMILY_DOCS.filter(
          (docType) => !uploadedKeySet.has(`${family.id}:-1:${docType}`)
        );
        if (familyMissingDocs.length > 0) {
          const titular = family.persons as {
            id: string;
            nombre: string;
            apellidos: string | null;
          } | null;
          const titularName = titular
            ? `${titular.nombre} ${titular.apellidos ?? ""}`.trim()
            : "";
          result.push({
            family_id: family.id,
            familia_numero: family.familia_numero,
            member_index: -1,
            member_name: titularName,
            parentesco: "familia",
            person_id: titular?.id ?? null,
            // ReadonlyArray<FamilyDocType> → string[] via spread (no cast needed):
            // FamilyDocType is a string-literal union, so each element is structurally
            // a string. Spread also strips the Readonly to satisfy the target string[].
            missing: [...familyMissingDocs],
            days_pending: daysPending,
          });
        }

        // ── Per-member required docs ────────────────────────────────────────
        const titular = family.persons as {
          id: string;
          nombre: string;
          apellidos: string | null;
        } | null;

        type MemberEntry = {
          member_index: number;
          nombre: string;
          apellidos: string | null;
          person_id: string | null;
          parentesco: string;
          fecha_nacimiento: string | null;
        };

        const allMembers: MemberEntry[] = [];

        if (titular) {
          allMembers.push({
            member_index: 0,
            nombre: titular.nombre,
            apellidos: titular.apellidos,
            person_id: titular.id,
            parentesco: "titular",
            fecha_nacimiento: null, // DOB not in this select; treat as adult (≥14)
          });
        }

        const familyMembers = membersByFamily.get(family.id) ?? [];
        familyMembers.forEach((m, idx) => {
          allMembers.push({
            member_index: idx + 1,
            nombre: m.nombre,
            apellidos: m.apellidos ?? null,
            person_id: m.person_id ?? null,
            parentesco: m.relacion ?? "",
            fecha_nacimiento: m.fecha_nacimiento ?? null,
          });
        });

        for (const member of allMembers) {
          if (!isMemberAdult(member, today)) continue;

          const missingDocs = REQUIRED_PER_MEMBER_DOCS.filter(
            (docType) =>
              !uploadedKeySet.has(`${family.id}:${member.member_index}:${docType}`)
          );

          if (missingDocs.length > 0) {
            result.push({
              family_id: family.id,
              familia_numero: family.familia_numero,
              member_index: member.member_index,
              member_name: `${member.nombre} ${member.apellidos ?? ""}`.trim(),
              parentesco: member.parentesco,
              person_id: member.person_id,
              // Same justification as above: ReadonlyArray<FamilyDocType> → string[] via spread.
              missing: [...missingDocs],
              days_pending: daysPending,
            });
          }
        }
      }

      return result;
    }),

  // ─── Job 9: Compliance Dashboard ────────────────────────────────────────
  /** GET compliance stats (CM-1 to CM-5) */
  getComplianceStats: adminProcedure.query(async () => {
    const db = createAdminClient();
    const today = new Date();

    const cutoff330 = new Date(today);
    cutoff330.setDate(cutoff330.getDate() - 330);
    const cutoff60 = new Date(today);
    cutoff60.setDate(cutoff60.getDate() - 60);
    const cutoff30 = new Date(today);
    cutoff30.setDate(cutoff30.getDate() - 30);

    // CM-1: active families missing BdeA consent
    const { count: cm1 } = await db
      .from("families")
      .select("*", { count: "exact", head: true })
      .eq("estado", "activa")
      .is("deleted_at", null)
      .eq("consent_banco_alimentos", false);

    // CM-2: informes sociales >330d old
    const { count: cm2 } = await db
      .from("families")
      .select("*", { count: "exact", head: true })
      .eq("estado", "activa")
      .is("deleted_at", null)
      .eq("informe_social", true)
      .lt("informe_social_fecha", cutoff330.toISOString().split("T")[0]);

    // CM-3: GUF stale >30d or not registered
    const { count: cm3 } = await db
      .from("families")
      .select("*", { count: "exact", head: true })
      .eq("estado", "activa")
      .is("deleted_at", null)
      .or(`alta_en_guf.eq.false,guf_verified_at.lt.${cutoff30.toISOString()}`);

    // CM-4: open sessions (no closed_at, fecha < today)
    const { count: cm4 } = await db
      .from("program_sessions")
      .select("*", { count: "exact", head: true })
      .is("closed_at", null)
      .lt("fecha", today.toISOString().split("T")[0]);

    // CM-5: no delivery in 60+ days
    const { data: allActiveFamilies } = await db
      .from("families")
      .select("id, familia_numero, persons!titular_id(nombre, apellidos, telefono)")
      .eq("estado", "activa")
      .is("deleted_at", null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: recentDeliveries } = await (db as any)
      .from("deliveries")
      .select("family_id")
      .gte("fecha_entrega", cutoff60.toISOString().split("T")[0])
      .is("deleted_at", null);

    const recentFamilyIds = new Set(
      (recentDeliveries ?? []).map((d: { family_id: string }) => d.family_id)
    );
    const cm5List = (allActiveFamilies ?? []).filter(
      (f: { id: string }) => !recentFamilyIds.has(f.id)
    );

    return {
      cm1: cm1 ?? 0,
      cm2: cm2 ?? 0,
      cm3: cm3 ?? 0,
      cm4: cm4 ?? 0,
      cm5: cm5List.length,
      cm5List,
    };
  }),

  // ─── Job 2: Batch Informes Sociales ─────────────────────────────────────
  /** GET families for batch informe social view */
  getInformesSociales: adminProcedure
    .input(
      z
        .object({
          filter: z.enum(["all", "pendientes", "por_renovar", "al_dia"]).default("all"),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const db = createAdminClient();
      const today = new Date();
      const cutoff300 = new Date(today);
      cutoff300.setDate(cutoff300.getDate() - 300);

      let query = db
        .from("families")
        .select(
          `id, familia_numero, informe_social, informe_social_fecha,
           persons!titular_id(nombre, apellidos, telefono)`
        )
        .eq("estado", "activa")
        .is("deleted_at", null);

      const filter = input?.filter ?? "all";
      if (filter === "pendientes") {
        query = query.eq("informe_social", false);
      } else if (filter === "por_renovar") {
        query = query
          .eq("informe_social", true)
          .lt("informe_social_fecha", cutoff300.toISOString().split("T")[0]);
      } else if (filter === "al_dia") {
        query = query
          .eq("informe_social", true)
          .gte("informe_social_fecha", cutoff300.toISOString().split("T")[0]);
      }

      const { data, error } = await query.order("familia_numero");
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return data ?? [];
    }),
});
