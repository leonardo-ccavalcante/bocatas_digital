import { createClient } from "@/lib/supabase/client";

const BUCKET = "family-documents";
const SIGNED_URL_TTL_SECONDS = 3600;

/**
 * Generate a signed URL for a storage path in the private family-documents bucket.
 * Returns null if the path is null/empty or signing fails.
 *
 * If `path` is already a full URL (legacy data migrated before this fix),
 * returns it as-is so old links keep working.
 */
export async function getSignedDocUrl(
  path: string | null | undefined
): Promise<string | null> {
  if (!path) return null;
  // Legacy guard: if someone stored a full URL before this fix, pass it through.
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data) return null;
  return data.signedUrl;
}
