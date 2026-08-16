import type { Express, Request, Response } from "express";
import { ENV } from "./env";
import { sdk } from "./sdk";
import { isElevatedRole } from "./rlsRedaction";

// Key prefixes a non-elevated session may presign through this proxy. Everything
// else — photographed identity/consent documents under `documentos-consentimiento/`
// and any future bucket — requires admin/superadmin (CAS-02b). This mirrors the
// high-risk field redaction (rlsRedaction.ts: `foto_documento_url` is admin-only),
// so the proxy cannot be used as a side channel to bypass it. Fail closed: an
// unrecognised prefix defaults to elevated-only, not public.
//   - `fotos-perfil/`    profile avatars (shown to all staff in the search view)
//   - `madrid-distritos_` static district GeoJSON for the map (non-PII)
// Prefixes carry their own boundary (`/` or `_`) so a sibling key like
// `madrid-distritosX` cannot ride the allowlist.
const NON_ELEVATED_KEY_PREFIXES = ["fotos-perfil/", "madrid-distritos_"];

// Storage keys are always constructed from a safe charset (`${bucket}/${ts}-${rand}.ext`
// and `madrid-distritos_<hash>.geojson`). Anything outside it — `%`, encoded escapes,
// null bytes — is rejected so encoded traversal cannot smuggle past the prefix check.
const SAFE_KEY = /^[a-zA-Z0-9._/-]+$/;

/**
 * Handler for GET /manus-storage/* — presigns a storage key via the forge backend
 * and 307-redirects to the signed URL.
 *
 * CAS-02 (Mythos audit): this endpoint presigns ANY storage key it is given
 * (document photos `foto_documento`, delivery signatures, etc. — cross-family PII).
 * Without authentication it was an IDOR: anyone on the public internet could fetch
 * any object by knowing/guessing its key, since the server-side forge API key does
 * the presign. We now require an authenticated session (the app is staff-facing;
 * the only anonymous-looking consumer, the map districts GeoJSON, is fetched from
 * behind login so the session cookie is present).
 *
 * CAS-02b (Mythos audit): authentication alone still let any authenticated
 * `voluntario` presign a high-risk identity/consent document, bypassing the
 * field-level redaction that hides those from non-elevated roles. We now require
 * an elevated role (admin/superadmin) for every key outside the non-elevated
 * allowlist. Exported for unit testing.
 */
export async function handleStorageProxy(req: Request, res: Response) {
  // Require a valid session — same mechanism as the tRPC context and the other
  // authenticated REST routes (sdk.authenticateRequest). Anonymous → 401, and we
  // return BEFORE calling the forge presign so no signed URL is ever minted.
  const user = await sdk.authenticateRequest(req).catch(() => null);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const key = req.path.replace(/^\/manus-storage\//, "");
  if (!key) {
    res.status(400).send("Missing storage key");
    return;
  }
  // Reject anything that isn't a plain storage key before any authz decision, so
  // a crafted key (`..`, percent-encoding) can't dodge the prefix allowlist.
  if (!SAFE_KEY.test(key) || key.includes("..")) {
    res.status(400).send("Invalid storage key");
    return;
  }
  // CAS-02b: high-risk objects are admin-only. Non-elevated sessions may presign
  // only the public/low-risk allowlist; anything else → 403 (fail closed).
  const isAllowlisted = NON_ELEVATED_KEY_PREFIXES.some((p) => key.startsWith(p));
  if (!isAllowlisted && !isElevatedRole(user.role)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
    res.status(500).send("Storage proxy not configured");
    return;
  }
  try {
    const forgeUrl = new URL(
      "v1/storage/presign/get",
      ENV.forgeApiUrl.replace(/\/+$/, "") + "/",
    );
    forgeUrl.searchParams.set("path", key);
    const forgeResp = await fetch(forgeUrl, {
      headers: { Authorization: `Bearer ${ENV.forgeApiKey}` },
    });
    if (!forgeResp.ok) {
      const body = await forgeResp.text().catch(() => "");
      console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
      res.status(502).send("Storage backend error");
      return;
    }
    const { url } = (await forgeResp.json()) as { url: string };
    if (!url) {
      res.status(502).send("Empty signed URL from backend");
      return;
    }
    res.set("Cache-Control", "no-store");
    res.redirect(307, url);
  } catch (err) {
    console.error("[StorageProxy] failed:", err);
    res.status(502).send("Storage proxy error");
  }
}

export function registerStorageProxy(app: Express) {
  app.get("/manus-storage/*", handleStorageProxy);
}
