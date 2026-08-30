/**
 * largePayloadPaths.ts — qué rutas pueden traer un cuerpo grande.
 *
 * `server/_core/index.ts` limita los cuerpos a 1 MB salvo esta lista. Un base64
 * infla ~33 %, así que cualquier procedimiento de subida que falte aquí se
 * rechaza con HTTP 413 ANTES de que corran Zod o el resolver — y desde la UI
 * eso es indistinguible de una función rota.
 *
 * Módulo puro y aparte a propósito: el guardián
 * `server/__tests__/large-payload-paths.test.ts` comprueba ESTA misma función,
 * no una copia. Cuando el test traía su propio matcher (más laxo), la lista
 * parecía cubierta mientras en producción no casaba ninguna ruta.
 */

/** Procedimientos que aceptan bytes (base64 / CSV). Prefijo de router o ruta completa. */
export const LARGE_PAYLOAD_PATHS = [
  "/api/trpc/ocr",
  "/api/trpc/persons.uploadPhoto",
  "/api/trpc/entregas.uploadPhotoToStorage",
  "/api/trpc/families.uploadFamilyDocument",
  "/api/trpc/families.attachSignedActa",
  "/api/trpc/announcements.uploadImage",
  "/api/trpc/programs.sessionDocuments.uploadSessionDocument",
  "/api/trpc/families.previewLegacyImport",
  "/api/trpc/families.confirmLegacyImport",
] as const;

/**
 * tRPC separa router y procedimiento con un PUNTO (`/api/trpc/ocr.extractDocument`),
 * no con una barra, y httpBatchLink añade `?batch=1`. Sin el caso del punto, una
 * entrada escrita como prefijo de router (`/api/trpc/ocr`) no casa con ninguna
 * llamada real.
 */
export function isLargePayloadPath(reqPath: string): boolean {
  return LARGE_PAYLOAD_PATHS.some(
    (p) =>
      reqPath === p ||
      reqPath.startsWith(p + ".") ||
      reqPath.startsWith(p + "?") ||
      reqPath.startsWith(p + "/")
  );
}
