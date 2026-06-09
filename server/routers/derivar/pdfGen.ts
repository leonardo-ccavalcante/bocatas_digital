/**
 * pdfGen.ts — derivar DOCX/PDF generation procedures
 *
 * generateDocx: Builds DerivarHojaTemplateData from a hoja + its
 *   interventions, calls renderDerivarHojaDocx with Bocatas logo,
 *   returns base64 string.
 *
 * generatePdf: Same, then converts via convertDocxToPdf, returns base64.
 *
 * Both procedures are adminProcedure (funder-facing strategic data).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createAdminClient } from "../../../client/src/lib/supabase/server";
import {
  renderDerivarHojaDocx,
  DerivarTemplateError,
  type DerivarHojaTemplateData,
} from "../../_core/docxRender";
import { convertDocxToPdf } from "../../_core/pdfFromDocx";
import { router, adminProcedure } from "../../_core/trpc";

/** Maps a missing-template error to a friendly, PII-free BAD_REQUEST. */
function toFriendlyTemplateError(e: unknown): never {
  if (e instanceof DerivarTemplateError) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Plantilla de derivación no configurada. Contacta al administrador.",
    });
  }
  throw e;
}

/** Load Bocatas logo from client/public/bocatas-logo.png */
function loadBocatasLogo(): Buffer {
  try {
    const logoPath = resolve(process.cwd(), "client/public/bocatas-logo.png");
    return readFileSync(logoPath);
  } catch (e) {
    console.warn(
      "Could not load Bocatas logo:",
      e instanceof Error ? e.message : String(e),
    );
    return Buffer.alloc(0); // Return empty buffer if logo not found
  }
}

// ---------------------------------------------------------------------------
// Interfaces for raw DB shapes (avoid `as unknown as`)
// ---------------------------------------------------------------------------

interface RawIntervencion {
  fecha: string;
  tipo_slug: string;
  descripcion: string;
  institucion_snapshot: {
    nombre?: string;
    direccion?: string;
    telefono?: string;
  } | null;
  observaciones: string | null;
}

interface TipoIntervencionRow {
  slug: string;
  nombre: string;
}

interface PersonaFields {
  nombre: string;
  apellidos: string | null;
}

interface FamiliaFields {
  familia_numero: number;
  titular: PersonaFields | null;
}

interface ProgramaFields {
  name: string;
}

interface HojaWithJoins {
  id: string;
  scope: string;
  fecha_apertura: string;
  profesional_nombre: string;
  persona: PersonaFields | null;
  familia: FamiliaFields | null;
  programa: ProgramaFields | null;
}

// ---------------------------------------------------------------------------
// Helper: build template data from DB
// ---------------------------------------------------------------------------

async function buildTemplateData(hojaId: string): Promise<DerivarHojaTemplateData> {
  const db = createAdminClient();

  const { data: hojaRaw, error: hErr } = await db
    .from("derivacion_hojas")
    .select(
      `id, scope, fecha_apertura, profesional_nombre,
      persona:persons(nombre, apellidos),
      familia:families(familia_numero, titular:persons!titular_id(nombre, apellidos)),
      programa:programs(name)`,
    )
    .eq("id", hojaId)
    .single();
  if (hErr || !hojaRaw) throw new TRPCError({ code: "NOT_FOUND" });

  // Cast through known shape — supabase-js returns joined relations as typed
  // objects; we annotate rather than assert with `as unknown as`.
  const hoja = hojaRaw as unknown as HojaWithJoins;

  const { data: rowsRaw } = await db
    .from("derivacion_intervenciones")
    .select("fecha, tipo_slug, descripcion, institucion_snapshot, observaciones")
    .eq("hoja_id", hojaId)
    .order("fecha", { ascending: true });

  const rows = (rowsRaw ?? []) as RawIntervencion[];

  const { data: tiposRaw } = await db
    .from("tipos_intervencion")
    .select("slug, nombre");
  const tipoMap = new Map(
    ((tiposRaw ?? []) as TipoIntervencionRow[]).map((t) => [t.slug, t.nombre]),
  );

  const isPersona = hoja.scope === "persona";

  const nombre = isPersona
    ? `${hoja.persona?.nombre ?? ""} ${hoja.persona?.apellidos ?? ""}`.trim()
    : hoja.familia?.titular
      ? `${hoja.familia.titular.nombre} ${hoja.familia.titular.apellidos ?? ""}`.trim()
      : `Familia #${hoja.familia?.familia_numero ?? ""}`;

  return {
    nombre,
    numUnidadFamiliar: hoja.familia?.familia_numero
      ? String(hoja.familia.familia_numero)
      : "",
    programaReferencia: hoja.programa?.name ?? "",
    profesionalReferencia: hoja.profesional_nombre,
    fechaApertura: new Date(hoja.fecha_apertura).toLocaleDateString("es-ES"),
    intervenciones: rows.map((r) => ({
      fecha: new Date(r.fecha).toLocaleDateString("es-ES"),
      tipo: tipoMap.get(r.tipo_slug) ?? r.tipo_slug,
      descripcion: r.descripcion,
      recursoNombre: r.institucion_snapshot?.nombre ?? "",
      recursoDireccion: r.institucion_snapshot?.direccion ?? "",
      recursoTelefono: r.institucion_snapshot?.telefono ?? "",
      observaciones: r.observaciones ?? "",
      firmaPlaceholder: "",
    })),
  };
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const pdfGenRouter = router({
  /** Render the hoja as a DOCX buffer with Bocatas logo, return base64. */
  generateDocx: adminProcedure
    .input(z.object({ hojaId: z.string().uuid() }))
    .query(async ({ input }) => {
      const data = await buildTemplateData(input.hojaId);
      const bocatasLogo = loadBocatasLogo();
      const buf = await renderDerivarHojaDocx(data, {
        bocatasLogo: bocatasLogo.length > 0 ? bocatasLogo : undefined,
      }).catch(toFriendlyTemplateError);
      return {
        contentBase64: buf.toString("base64"),
        filename: `derivacion_hoja_${input.hojaId.slice(0, 8)}.docx`,
        mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      };
    }),

  /** Render the hoja as a PDF buffer via LibreOffice, return base64. */
  generatePdf: adminProcedure
    .input(z.object({ hojaId: z.string().uuid() }))
    .query(async ({ input }) => {
      const data = await buildTemplateData(input.hojaId);
      const bocatasLogo = loadBocatasLogo();
      const docxBuf = await renderDerivarHojaDocx(data, {
        bocatasLogo: bocatasLogo.length > 0 ? bocatasLogo : undefined,
      }).catch(toFriendlyTemplateError);
      const pdfBuf = await convertDocxToPdf(docxBuf);
      return {
        contentBase64: pdfBuf.toString("base64"),
        filename: `derivacion_hoja_${input.hojaId.slice(0, 8)}.pdf`,
        mime: "application/pdf",
      };
    }),
});
