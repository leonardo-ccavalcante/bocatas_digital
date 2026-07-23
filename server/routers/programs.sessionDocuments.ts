/**
 * programs.sessionDocuments.ts — Session document upload + lesson-plan OCR.
 *
 * Wired as programs.sessionDocuments.* in programsRouter.
 *
 * SECURITY (mirrors programs.enlace.ts ADR-0013):
 * - Authed procedures: voluntarioProcedure + assertProgramAccessForRole
 * - Public procedures: resolveAndVerifyEnlace (token + estado ∈ {planificada,abierta})
 * - Size cap: 8 MB decoded binary (upload); ~1.5 MB decoded base64 (OCR image)
 * - Mime allowlist: pdf, png, jpeg, webp, text/markdown, text/plain
 *   text/html is intentionally excluded (XSS vector — never allowed inline)
 * - ZERO PII in enlace responses (id, tipo_slug, version only)
 * - Storage path: sessions/<sessionId>/<tipoSlug>-<random>.<ext>
 *   stored in session_documents.url; served via server-side signedUrl
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, voluntarioProcedure } from "../_core/trpc";
import { createAdminClient } from "../../client/src/lib/supabase/server";
import { invokeLLM } from "../_core/llm";
import { assertProgramAccessForRole } from "./programs.access";
import { resolveAndVerifyEnlace } from "./programs.enlace";

type Supabase = ReturnType<typeof createAdminClient>;

const uuidLike = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "UUID inválido");

// FIX 1b: Reconciled with the program-documents bucket allowed_mime_types
// (migration 20260723130004). text/html is intentionally excluded — a future
// signed-URL endpoint MUST serve with Content-Disposition: attachment (never
// inline) to prevent stored-XSS; excluding html here is defense-in-depth.
const ALLOWED_MIMES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "text/markdown",
  "text/plain",
]);

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB decoded

// FIX 2: Cap for OCR image base64 strings (~1.5 MB decoded = 2 MB base64 chars).
// NOTE: A per-token/per-session rate limit on this paid-LLM public endpoint is a
// follow-up for /security-review — the current IP-level limit is escapable by
// IP rotation.
const MAX_OCR_BASE64_CHARS = 2_097_152; // ceil(1.5 * 1024 * 1024 * 4 / 3)

const MIME_TO_EXT: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "text/markdown": ".md",
  "text/plain": ".txt",
};

// FIX 4: Extension→MIME map for server-side fallback inference.
// Android content providers often report '' or 'application/octet-stream' for
// files the browser/OS knows how to open. The client does the same inference
// before sending; the server repeats it as defense-in-depth so a bad client
// cannot bypass the allowlist by omitting the content-type.
const EXT_TO_MIME: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  md: "text/markdown",
  txt: "text/plain",
};

function inferMimeFromFilename(fileName: string): string | null {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return EXT_TO_MIME[ext] ?? null;
}

const LESSON_PLAN_SYSTEM_PROMPT = `Eres un asistente de extracción de planes de clase.
Analiza la imagen y extrae el contenido del plan de clase en texto organizado en markdown.
Usa estos encabezados si aparecen en el documento (omite los que estén vacíos):
## Tema
## Objetivos
## Contenidos
## Actividades
## Materiales
## Duración
## Observaciones
Responde SOLO con el texto extraído, sin explicaciones adicionales.
NO incluyas datos personales del alumno o del profesor.`;

async function getProgramIdFromSession(supabase: Supabase, sessionId: string): Promise<string> {
  const { data, error } = await supabase
    .from("program_sessions")
    .select("program_id")
    .eq("id", sessionId)
    .single();
  if (error || !data) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Sesión no encontrada" });
  }
  return data.program_id;
}

async function nextVersion(supabase: Supabase, sessionId: string, tipoSlug: string): Promise<number> {
  const { data } = await supabase
    .from("session_documents")
    .select("version")
    .eq("session_id", sessionId)
    .eq("tipo_slug", tipoSlug)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.version ?? 0) + 1;
}

async function uploadToStorage(
  supabase: Supabase, path: string, buffer: Buffer, contentType: string
): Promise<void> {
  // FIX 1d: contentType here is always the resolved effectiveMime (validated
  // against ALLOWED_MIMES). When a document-viewing / signed-URL endpoint is
  // built, it MUST serve with Content-Disposition: attachment (never inline)
  // to prevent stored-XSS. text/html is excluded from ALLOWED_MIMES as
  // additional defense-in-depth.
  const { error } = await supabase.storage
    .from("program-documents")
    .upload(path, buffer, { contentType, upsert: true });
  if (error) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Error al subir documento" });
  }
}

async function insertDoc(supabase: Supabase, params: {
  sessionId: string; tipoSlug: string; url: string;
  version: number; subidoPor: string; enNombreDe: string | null;
}) {
  const { data, error } = await supabase
    .from("session_documents")
    .insert({
      session_id: params.sessionId,
      tipo_slug: params.tipoSlug,
      url: params.url,
      version: params.version,
      subido_por: params.subidoPor,
      en_nombre_de: params.enNombreDe,
    })
    .select()
    .single();
  if (error || !data) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Error al guardar documento" });
  }
  return data;
}

function buildStoragePath(sessionId: string, tipoSlug: string, effectiveMime: string): string {
  const ext = MIME_TO_EXT[effectiveMime] ?? "";
  const unique = Math.random().toString(36).slice(2, 10);
  return `sessions/${sessionId}/${tipoSlug}-${unique}${ext}`;
}

/**
 * FIX 4: Validate uploaded file and resolve the effective MIME type.
 * Returns both the decoded Buffer and the resolved mime so callers can use
 * it for storage path + content-type (avoids octet-stream/empty extension).
 */
function validateUploadInput(
  base64File: string, mimeType: string, fileName?: string
): { buffer: Buffer; effectiveMime: string } {
  // Infer from filename when Android reports '' or 'application/octet-stream'.
  const effectiveMime =
    (!mimeType || mimeType === "application/octet-stream")
      ? (inferMimeFromFilename(fileName ?? "") ?? mimeType)
      : mimeType;

  if (!ALLOWED_MIMES.has(effectiveMime)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Tipo de archivo no permitido: ${mimeType || "(vacío)"}`,
    });
  }
  const buffer = Buffer.from(base64File, "base64");
  if (buffer.length > MAX_BYTES) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "El archivo supera el límite de 8 MB",
    });
  }
  return { buffer, effectiveMime };
}

async function callLessonPlanOcr(
  base64Image: string, mimeType: string
): Promise<{ success: boolean; texto: string }> {
  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: LESSON_PLAN_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`,
                detail: "high",
              },
            },
            { type: "text", text: "Extrae el plan de clase de esta imagen." },
          ],
        },
      ],
    });
    const content = response.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      return { success: false, texto: "" };
    }
    return { success: true, texto: content };
  } catch {
    return { success: false, texto: "" };
  }
}

// FIX 4: mimeType allows '' (Android content provider may omit it).
// The server infers from fileName as fallback in validateUploadInput.
const uploadInputSchema = z.object({
  sessionId: uuidLike,
  tipoSlug: z.string().min(1).max(50),
  base64File: z.string().min(1),
  mimeType: z.string().default(""),
  fileName: z.string().max(255).default("documento"),
});

export const sessionDocumentsRouter = router({
  uploadSessionDocument: voluntarioProcedure
    .input(uploadInputSchema)
    .mutation(async ({ input, ctx }) => {
      const { buffer, effectiveMime } = validateUploadInput(
        input.base64File, input.mimeType, input.fileName
      );
      const supabase = createAdminClient();
      const programId = await getProgramIdFromSession(supabase, input.sessionId);
      await assertProgramAccessForRole(supabase, programId, ctx.user);
      const version = await nextVersion(supabase, input.sessionId, input.tipoSlug);
      const storagePath = buildStoragePath(input.sessionId, input.tipoSlug, effectiveMime);
      await uploadToStorage(supabase, storagePath, buffer, effectiveMime);
      const subidoPor = ctx.user.name ?? ctx.user.email ?? String(ctx.user.id);
      return insertDoc(supabase, {
        sessionId: input.sessionId, tipoSlug: input.tipoSlug,
        url: storagePath, version, subidoPor, enNombreDe: null,
      });
    }),

  getSessionDocuments: voluntarioProcedure
    .input(z.object({ sessionId: uuidLike }))
    .query(async ({ input, ctx }) => {
      const supabase = createAdminClient();
      const programId = await getProgramIdFromSession(supabase, input.sessionId);
      await assertProgramAccessForRole(supabase, programId, ctx.user);
      const { data } = await supabase
        .from("session_documents")
        .select("id, tipo_slug, url, version, subido_por, created_at")
        .eq("session_id", input.sessionId)
        .order("created_at", { ascending: false });
      return data ?? [];
    }),

  enlaceUploadSessionDocument: publicProcedure
    .input(uploadInputSchema.extend({
      token: z.string().min(1),
      enNombreDe: z.string().max(200).optional(),
    }))
    .mutation(async ({ input }) => {
      const { buffer, effectiveMime } = validateUploadInput(
        input.base64File, input.mimeType, input.fileName
      );
      const supabase = createAdminClient();
      await resolveAndVerifyEnlace(supabase, input.sessionId, input.token);
      const version = await nextVersion(supabase, input.sessionId, input.tipoSlug);
      const storagePath = buildStoragePath(input.sessionId, input.tipoSlug, effectiveMime);
      await uploadToStorage(supabase, storagePath, buffer, effectiveMime);
      const label = input.enNombreDe ? `enlace:${input.enNombreDe}` : "enlace";
      const doc = await insertDoc(supabase, {
        sessionId: input.sessionId, tipoSlug: input.tipoSlug,
        url: storagePath, version, subidoPor: label,
        enNombreDe: input.enNombreDe ?? null,
      });
      return { id: doc.id, tipo_slug: doc.tipo_slug, version: doc.version };
    }),

  // FIX 2: base64Image capped at ~1.5 MB decoded (2 MB base64 chars) to
  // prevent unbounded payload on this paid-LLM endpoint.
  extractLessonPlan: voluntarioProcedure
    .input(z.object({
      base64Image: z.string().min(1).max(MAX_OCR_BASE64_CHARS, "Imagen demasiado grande"),
      mimeType: z.string().default("image/jpeg"),
    }))
    .mutation(async ({ input }) => {
      return callLessonPlanOcr(input.base64Image, input.mimeType);
    }),

  // FIX 2: same cap on the public (token-gated) OCR endpoint.
  enlaceExtractLessonPlan: publicProcedure
    .input(z.object({
      sessionId: uuidLike,
      token: z.string().min(1),
      base64Image: z.string().min(1).max(MAX_OCR_BASE64_CHARS, "Imagen demasiado grande"),
      mimeType: z.string().default("image/jpeg"),
    }))
    .mutation(async ({ input }) => {
      const supabase = createAdminClient();
      await resolveAndVerifyEnlace(supabase, input.sessionId, input.token);
      return callLessonPlanOcr(input.base64Image, input.mimeType);
    }),
});
