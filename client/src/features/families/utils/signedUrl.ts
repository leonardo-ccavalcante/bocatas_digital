import { trpcVanilla } from "@/lib/trpc";

/**
 * Resolve a short-lived signed URL for a path in the PRIVATE `family-documents`
 * bucket. Signing happens SERVER-SIDE (`families.getDocumentSignedUrl`, via the
 * service-role client): the browser's anon Supabase client is blocked by storage
 * RLS on this private bucket, so a client-side `createSignedUrl` returns 404
 * "Object not found". Returns null on failure (callers toast a generic error).
 *
 * If `path` is already a full URL (legacy data migrated before paths were
 * stored), it is returned as-is so old links keep working.
 */
export async function getSignedDocUrl(
  path: string | null | undefined
): Promise<string | null> {
  if (!path) return null;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  try {
    const { signedUrl } = await trpcVanilla.families.getDocumentSignedUrl.query({
      path,
    });
    return signedUrl;
  } catch {
    return null;
  }
}
