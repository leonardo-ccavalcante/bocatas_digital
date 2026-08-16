/**
 * Storage helpers — uses Supabase Storage as primary, Forge S3 as fallback.
 *
 * Configuration:
 * - Primary: Supabase Storage (always available via SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
 * - Fallback: Forge S3 (BUILT_IN_FORGE_API_URL + BUILT_IN_FORGE_API_KEY) — legacy
 *
 * Files are stored in the "uploads" bucket in Supabase Storage.
 * The bucket must exist (created via migration or dashboard).
 */
import { ENV } from './_core/env';
import { createAdminClient } from "../client/src/lib/supabase/server";

const UPLOADS_BUCKET = "uploads";

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
 * Upload a file to storage. Uses Supabase Storage if available, falls back to Forge S3.
 *
 * @param relKey - Relative path/key for the file (e.g. "persons/photo-abc123.jpg")
 * @param data - File content as Buffer, Uint8Array, or string
 * @param contentType - MIME type (default: application/octet-stream)
 * @returns { key, url } — the stored key and public URL
 */
export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const key = relKey.replace(/^\/+/, "");

  // Try Supabase Storage first
  try {
    const supabase = createAdminClient();
    const fileData = typeof data === "string" ? new TextEncoder().encode(data) : data;

    const { error: uploadError } = await supabase.storage
      .from(UPLOADS_BUCKET)
      .upload(key, fileData, {
        contentType,
        upsert: true,
      });

    if (uploadError) {
      throw uploadError;
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(UPLOADS_BUCKET)
      .getPublicUrl(key);

    return { key, url: urlData.publicUrl };
  } catch (supabaseError) {
    // Fallback to Forge S3 if Supabase Storage fails or bucket doesn't exist
    if (ENV.forgeApiUrl && ENV.forgeApiKey) {
      return storagePutForge(key, data, contentType);
    }
    throw supabaseError;
  }
}

// ── Forge S3 fallback (legacy) ───────────────────────────────────────────────

async function storagePutForge(
  key: string,
  data: Buffer | Uint8Array | string,
  contentType: string
): Promise<{ key: string; url: string }> {
  const baseUrl = ENV.forgeApiUrl.replace(/\/+$/, "");
  const url = new URL("v1/storage/upload", baseUrl + "/");
  url.searchParams.set("path", key);

  const blob =
    typeof data === "string"
      ? new Blob([data], { type: contentType })
      : new Blob([data as any], { type: contentType });
  const form = new FormData();
  form.append("file", blob, key.split("/").pop() ?? "file");

  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${ENV.forgeApiKey}` },
    body: form,
  });

  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(`Storage upload failed (${response.status}): ${message}`);
  }

  const result = await response.json();
  return { key, url: result.url };
}
