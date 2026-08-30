// Storage helpers backed by Supabase Storage.
//
// These used to POST to the Manus object-storage proxy
// (BUILT_IN_FORGE_API_URL/_KEY). The project no longer uses Manus, those vars
// are unset, and `getStorageConfig()` threw before any network call — so every
// upload silently failed: profile photos, signed-consent photos,
// delivery-document photos and novedad images were all discarded.
//
// Contract: writes take an explicit bucket (Manus had one flat keyspace,
// Supabase does not) and return the storage PATH. Callers persist the path and
// mint a short-lived signed URL at read time. A persisted signed URL would be a
// replayable, shareable link to beneficiary PII — the CAS-02 failure mode.

import { createAdminClient } from "../client/src/lib/supabase/server";

/** Signed-URL lifetime. Long enough for a page render or an OCR fetch, short
 *  enough that a leaked link is not a standing grant. */
const SIGNED_URL_TTL_SECONDS = 600;

const normalizeKey = (relKey: string): string => relKey.replace(/^\/+/, "");

/**
 * Download a file from Supabase Storage and return it as a Buffer.
 * Throws a plain Error if the download fails or returns no data.
 */
export async function fetchStorageBuffer(bucket: string, path: string): Promise<Buffer> {
  const db = createAdminClient();
  const { data, error } = await db.storage.from(bucket).download(path);
  if (error || !data) {
    throw new Error(
      `Failed to download storage object '${path}' from bucket '${bucket}': ${error?.message ?? "no data returned"}`
    );
  }
  return Buffer.from(await data.arrayBuffer());
}

/**
 * Upload to a Supabase Storage bucket. Returns the stored path — never a URL.
 */
export async function storagePut(
  bucket: string,
  relPath: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ bucket: string; path: string }> {
  const path = normalizeKey(relPath);
  const body = typeof data === "string" ? Buffer.from(data) : Buffer.from(data);

  const { error } = await createAdminClient()
    .storage.from(bucket)
    .upload(path, body, { contentType, upsert: true });

  if (error) {
    // The driver message can carry the object path; keep it out of the client
    // response and out of any error that bubbles to a toast.
    console.error(`[storage] upload to '${bucket}' failed: ${error.message}`);
    throw new Error("No se pudo guardar el archivo");
  }

  return { bucket, path };
}

/**
 * Mint a short-lived signed URL for a stored path.
 *
 * Returns null instead of throwing: an avatar that cannot be signed must not
 * fail the list query it is embedded in. Absolute URLs pass through unchanged
 * so rows written before this migration keep resolving.
 */
export async function storageSignedUrl(
  bucket: string,
  path: string | null | undefined,
  ttlSeconds: number = SIGNED_URL_TTL_SECONDS
): Promise<string | null> {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;

  const { data, error } = await createAdminClient()
    .storage.from(bucket)
    .createSignedUrl(normalizeKey(path), ttlSeconds);

  if (error || !data?.signedUrl) {
    console.error(`[storage] signing '${bucket}' failed: ${error?.message ?? "no url"}`);
    return null;
  }
  return data.signedUrl;
}

/**
 * Batch variant — one Storage round trip for a whole list page. Returns a map
 * keyed by the ORIGINAL path so callers can look values back up directly.
 */
export async function storageSignedUrls(
  bucket: string,
  paths: Array<string | null | undefined>,
  ttlSeconds: number = SIGNED_URL_TTL_SECONDS
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const present = paths.filter((p): p is string => typeof p === "string" && p.length > 0);
  for (const p of present) {
    if (/^https?:\/\//i.test(p)) out.set(p, p);
  }
  const toSign = [...new Set(present.filter(p => !/^https?:\/\//i.test(p)))];
  if (toSign.length === 0) return out;

  const { data, error } = await createAdminClient()
    .storage.from(bucket)
    .createSignedUrls(toSign.map(normalizeKey), ttlSeconds);

  if (error || !data) {
    console.error(`[storage] batch signing '${bucket}' failed: ${error?.message ?? "no data"}`);
    return out;
  }
  data.forEach((entry, i) => {
    if (entry.signedUrl) out.set(toSign[i], entry.signedUrl);
  });
  return out;
}

/**
 * Replace a storage-path field with a short-lived signed URL, IN PLACE, across
 * a list of rows — one Storage round trip for the whole page (never one per
 * row: these run inside the check-in and "Sin QR" search paths, which carry
 * hard latency budgets).
 *
 * Takes `unknown[]` and mutates rather than returning a re-typed array: the
 * callers' rows come from dynamic `.select(string)` calls whose inferred type
 * is a union, and re-typing them would need the `as unknown as X` cast the
 * house rules forbid.
 *
 * Rows whose field is null, or already an absolute URL, are left alone. A row
 * whose URL cannot be minted gets null rather than failing the query — a
 * missing avatar must never break a person search.
 */
export async function signPathField(
  bucket: string,
  rows: readonly unknown[],
  field: string
): Promise<void> {
  const targets = rows.filter(
    (r): r is Record<string, unknown> => typeof r === "object" && r !== null
  );
  const paths = targets.map(r => {
    const v = r[field];
    return typeof v === "string" ? v : null;
  });
  if (!paths.some(Boolean)) return;

  const signed = await storageSignedUrls(bucket, paths);
  for (const row of targets) {
    const current = row[field];
    if (typeof current !== "string" || !current) continue;
    row[field] = signed.get(current) ?? null;
  }
}

/** Bucket holding beneficiary profile photos. */
export const AVATAR_BUCKET = "fotos-perfil";
/**
 * Foto del documento de identidad (`persons.foto_documento_url`). Privado y de
 * máximo riesgo: sólo se firma para quien ya ha pasado por
 * `redactHighRiskFields` (admin/superadmin).
 */
export const ID_DOCUMENT_BUCKET = "documentos-identidad";
