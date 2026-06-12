import type { Express, Request, Response } from "express";
import { ENV } from "./env";
import { sdk } from "./sdk";

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
 * behind login so the session cookie is present). Exported for unit testing.
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
