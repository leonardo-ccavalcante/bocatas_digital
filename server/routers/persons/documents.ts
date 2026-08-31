/**
 * persons.getDocumentUrls / persons.getPersonIdsWithDocuments
 *
 * Las imágenes de documentos archivados —la del documento de identidad y la
 * del consentimiento firmado a mano— se acuñan BAJO DEMANDA, sólo para
 * superadministración, y cada consulta queda registrada.
 *
 * Por qué la entrada es `personId` y NUNCA un `path`: families.getDocumentSignedUrl
 * firma cualquier ruta de su bucket para cualquier admin, que es un IDOR. Aquí
 * la ruta se lee del servidor y no sale de él. No "armonizar" las dos.
 *
 * Por qué no `select("*")`: además de no traer ninguna otra columna de alto
 * riesgo, deja este archivo fuera del alcance de
 * persons-high-risk-readpath-guard.test.ts por construcción y no por promesa.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createAdminClient } from "../../../client/src/lib/supabase/server";
import { superadminProcedure } from "../../_core/trpc";
import { logAudit, logProcedureError } from "../../_core/logging-middleware";
import {
  CONSENT_DOCUMENT_BUCKET,
  ID_DOCUMENT_BUCKET,
  storageSignedUrl,
  storageSignedUrls,
} from "../../storage";
import { uuidLike } from "./_shared";

/**
 * Vida de la URL firmada. Deliberadamente más corta que el defecto de
 * storage.ts (600s) y muy lejos de la hora que usan los documentos de familia:
 * esto es la foto de un DNI. Cinco minutos bastan para empezar la descarga de
 * una imagen de hasta 10 MiB en un Android de gama baja con la red de una sede,
 * y acotan el replay si el enlace se filtra.
 */
const DOCUMENT_URL_TTL_SECONDS = 300;

export const PersonDocumentSchema = z.object({
  kind: z.enum(["identidad", "consentimiento"]),
  /** Fines que cubre ESTA imagen. Vacío para el documento de identidad. */
  purposes: z.array(z.string()),
  /** URL firmada de vida corta. `null` = consta pero no se pudo firmar. */
  url: z.string().nullable(),
  archivadoEn: z.string().nullable(),
});

export const getDocumentUrls = superadminProcedure
  .input(z.object({ personId: uuidLike }))
  .output(z.object({ documentos: z.array(PersonDocumentSchema) }))
  .query(async ({ ctx, input }) => {
    const supabase = createAdminClient();

    const { data: persona, error: errorPersona } = await supabase
      .from("persons")
      .select("id, foto_documento_url, updated_at")
      .eq("id", input.personId)
      .is("deleted_at", null)
      .maybeSingle();

    if (errorPersona) {
      logProcedureError(ctx, "persons.getDocumentUrls failed", errorPersona, {
        personId: input.personId,
      });
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "No se pudieron obtener los documentos. Inténtalo de nuevo.",
      });
    }
    if (!persona) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Persona no encontrada" });
    }

    const { data: filasConsent, error: errorConsent } = await supabase
      .from("consents")
      .select("purpose, documento_foto_url, granted_at")
      .eq("person_id", input.personId)
      .is("deleted_at", null)
      .not("documento_foto_url", "is", null);

    if (errorConsent) {
      logProcedureError(ctx, "persons.getDocumentUrls failed", errorConsent, {
        personId: input.personId,
      });
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "No se pudieron obtener los documentos. Inténtalo de nuevo.",
      });
    }

    // Dedup por ruta, obligatorio: el alta escribe el MISMO consentDocUrl en
    // TODAS las filas de consents de esa persona (_consentRows.ts), así que una
    // sola hoja firmada produce hasta cinco registros. Sin esto el visor
    // enseñaría la misma foto cinco veces y la auditoría mentiría al contar.
    const porRuta = new Map<string, { purposes: string[]; grantedAt: string | null }>();
    for (const fila of filasConsent ?? []) {
      const ruta = fila.documento_foto_url;
      if (typeof ruta !== "string" || !ruta) continue;
      const previo = porRuta.get(ruta);
      const grantedAt = (fila.granted_at as string | null) ?? null;
      if (previo) {
        previo.purposes.push(fila.purpose as string);
        if (grantedAt && (!previo.grantedAt || grantedAt < previo.grantedAt)) {
          previo.grantedAt = grantedAt;
        }
      } else {
        porRuta.set(ruta, { purposes: [fila.purpose as string], grantedAt });
      }
    }

    const rutasConsent = [...porRuta.keys()];
    const firmadasConsent = rutasConsent.length
      ? await storageSignedUrls(CONSENT_DOCUMENT_BUCKET, rutasConsent, DOCUMENT_URL_TTL_SECONDS)
      : new Map<string, string>();

    const documentos: z.infer<typeof PersonDocumentSchema>[] = [];

    const rutaIdentidad = persona.foto_documento_url;
    if (typeof rutaIdentidad === "string" && rutaIdentidad) {
      documentos.push({
        kind: "identidad",
        purposes: [],
        // Firmar puede fallar; la entrada se queda con url null y NO se
        // descarta. "Consta pero no abre" y "nunca se archivó" son cosas
        // distintas, y confundirlas hace que alguien concluya que no hay foto.
        url: await storageSignedUrl(ID_DOCUMENT_BUCKET, rutaIdentidad, DOCUMENT_URL_TTL_SECONDS),
        archivadoEn: (persona.updated_at as string | null) ?? null,
      });
    }

    for (const [ruta, meta] of porRuta) {
      documentos.push({
        kind: "consentimiento",
        purposes: meta.purposes.sort(),
        url: firmadasConsent.get(ruta) ?? null,
        archivadoEn: meta.grantedAt,
      });
    }

    // Una línea por consulta, TAMBIÉN cuando no hay nada que enseñar: el caso
    // vacío es justo la señal de enumeración que interesa registrar. Sólo ids y
    // contadores — nunca la ruta, la URL ni el nombre.
    logAudit(ctx, "persons.getDocumentUrls", {
      personId: input.personId,
      identidad: typeof rutaIdentidad === "string" && !!rutaIdentidad,
      consentimientos: porRuta.size,
      firmadas: documentos.filter((d) => d.url !== null).length,
    });

    return { documentos };
  });

/**
 * Ids de personas con alguna imagen archivada.
 *
 * Sólo ids: ninguna ruta, ninguna URL, nada firmado. Sirve para que el menú del
 * listado no ofrezca "Documentos" a quien no tiene ninguno.
 *
 * Se descartó añadir un `tiene_documento` a getAll: obligaría a una tercera
 * lista de columnas en getAllColumnsForRole (con su prueba de bloqueo) y a
 * meter la columna de la RUTA en una consulta que devuelve cientos de filas —
 * un refactor que olvide borrarla manda todas las rutas de DNI al navegador.
 */
export const getPersonIdsWithDocuments = superadminProcedure
  .output(z.object({ personIds: z.array(z.string()) }))
  .query(async ({ ctx }) => {
    const supabase = createAdminClient();

    const { data: personas } = await supabase
      .from("persons")
      .select("id")
      .is("deleted_at", null)
      .not("foto_documento_url", "is", null);

    const { data: consentimientos } = await supabase
      .from("consents")
      .select("person_id")
      .is("deleted_at", null)
      .not("documento_foto_url", "is", null);

    const ids = new Set<string>();
    for (const p of personas ?? []) if (typeof p.id === "string") ids.add(p.id);
    for (const c of consentimientos ?? []) {
      if (typeof c.person_id === "string") ids.add(c.person_id);
    }

    logAudit(ctx, "persons.getPersonIdsWithDocuments", { total: ids.size });
    return { personIds: [...ids] };
  });
