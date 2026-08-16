/**
 * Supabase Auth routes — replaces Manus OAuth.
 *
 * Supabase handles auth via its JS client on the frontend. The server only needs:
 * 1. A callback route for OAuth providers (Google) to exchange code for session
 * 2. A logout route to clear the session
 *
 * Session management is handled by Supabase Auth cookies automatically.
 */
import type { Express, Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import { upsertUser } from "../db";

export function registerOAuthRoutes(app: Express) {
  /**
   * GET /auth/callback — handles OAuth provider redirects (Google, etc.)
   * The frontend redirects here after Supabase Auth completes the OAuth flow.
   */
  app.get("/auth/callback", async (req: Request, res: Response) => {
    const code = req.query.code as string | undefined;
    const next = (req.query.next as string) || "/";

    if (!code) {
      res.redirect(302, `/?error=missing_code`);
      return;
    }

    try {
      // Exchange the code for a session using the service role client
      const supabase = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_ANON_KEY!
      );

      const { data, error } = await supabase.auth.exchangeCodeForSession(code);

      if (error || !data.user) {
        console.error("[Auth] Code exchange failed:", error?.message);
        res.redirect(302, `/?error=auth_failed`);
        return;
      }

      // Ensure user exists in app_users
      await upsertUser({
        id: data.user.id,
        name: data.user.user_metadata?.name ?? data.user.email?.split("@")[0] ?? null,
        email: data.user.email ?? null,
        loginMethod: data.user.app_metadata?.provider ?? "email",
        lastSignedIn: new Date(),
      });

      // Set the session tokens as cookies for the frontend
      const maxAge = 60 * 60 * 24 * 365; // 1 year
      res.cookie("sb-access-token", data.session.access_token, {
        httpOnly: true,
        secure: req.protocol === "https" || req.headers["x-forwarded-proto"] === "https",
        sameSite: "lax",
        path: "/",
        maxAge: maxAge * 1000,
      });
      res.cookie("sb-refresh-token", data.session.refresh_token, {
        httpOnly: true,
        secure: req.protocol === "https" || req.headers["x-forwarded-proto"] === "https",
        sameSite: "lax",
        path: "/",
        maxAge: maxAge * 1000,
      });

      res.redirect(302, next);
    } catch (error) {
      console.error("[Auth] Callback failed:", error);
      res.redirect(302, `/?error=server_error`);
    }
  });

  /**
   * POST /api/auth/logout — clears session cookies
   */
  app.post("/api/auth/logout", (req: Request, res: Response) => {
    res.clearCookie("sb-access-token", { path: "/" });
    res.clearCookie("sb-refresh-token", { path: "/" });
    res.json({ success: true });
  });

  /**
   * Legacy: keep /api/oauth/callback as a redirect to /auth/callback
   * so old bookmarks/links don't break.
   */
  app.get("/api/oauth/callback", (req: Request, res: Response) => {
    const url = new URL("/auth/callback", `${req.protocol}://${req.get("host")}`);
    url.search = new URLSearchParams(req.query as Record<string, string>).toString();
    res.redirect(302, url.toString());
  });
}
