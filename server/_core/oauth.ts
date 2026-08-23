/**
 * Supabase Auth server routes.
 *
 * OAuth (Google) uses the PKCE flow: the code→session exchange happens in the
 * BROWSER, because the one-time `code_verifier` lives in the client's localStorage
 * (never on the server). The client route `/auth/callback`
 * (client/src/pages/AuthCallback.tsx) completes it via `detectSessionInUrl`.
 *
 * The server MUST NOT intercept `/auth/callback`: a server-side
 * `exchangeCodeForSession` has no verifier and always fails, which is what broke
 * Google login (magic-link worked because it returns via the URL fragment, which
 * the server never sees). So this module only handles logout and a legacy redirect;
 * `/auth/callback` falls through to the SPA (see server/_core/vite.ts catch-all).
 *
 * Auth is carried to the API as an `Authorization: Bearer <access_token>` header
 * from the client's Supabase session (see client/src/lib/trpc.ts and main.tsx);
 * `authenticateRequest` verifies it. Storage reads use presigned URLs, so no
 * session cookie is required.
 */
import type { Express, Request, Response } from "express";

export function registerOAuthRoutes(app: Express) {
  /** POST /api/auth/logout — clears any legacy session cookies */
  app.post("/api/auth/logout", (_req: Request, res: Response) => {
    res.clearCookie("sb-access-token", { path: "/" });
    res.clearCookie("sb-refresh-token", { path: "/" });
    res.json({ success: true });
  });

  /** Legacy redirect for old bookmarks → the client-handled callback */
  app.get("/api/oauth/callback", (req: Request, res: Response) => {
    res.redirect(302, `/auth/callback?${new URLSearchParams(req.query as Record<string, string>)}`);
  });
}
