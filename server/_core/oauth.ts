/**
 * Supabase Auth routes — replaces Manus OAuth.
 *
 * The frontend handles auth via @supabase/supabase-js (signInWithPassword,
 * signInWithOAuth, signInWithOtp). The server only needs:
 * 1. /auth/callback — for OAuth providers (Google) code exchange
 * 2. /api/auth/logout — clear session cookies
 */
import type { Express, Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import { upsertUser } from "../db";

function getSafeNext(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return "/";
  }
  return value;
}

export function registerOAuthRoutes(app: Express) {
  /**
   * GET /auth/callback — handles OAuth provider redirects (Google, etc.)
   */
  app.get("/auth/callback", async (req: Request, res: Response) => {
    const code = req.query.code as string | undefined;
    const next = getSafeNext(req.query.next);

    if (!code) {
      res.redirect(302, `/?error=missing_code`);
      return;
    }

    try {
      const supabase = createClient(
        process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "",
        process.env.VITE_SUPABASE_ANON_KEY ?? ""
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

      // Set access token as httpOnly cookie for server-side auth
      const secure = req.protocol === "https" || req.headers["x-forwarded-proto"] === "https";
      const maxAge = 60 * 60 * 24 * 365 * 1000; // 1 year ms
      res.cookie("sb-access-token", data.session.access_token, {
        httpOnly: true, secure, sameSite: "lax", path: "/", maxAge,
      });
      res.cookie("sb-refresh-token", data.session.refresh_token, {
        httpOnly: true, secure, sameSite: "lax", path: "/", maxAge,
      });

      res.redirect(302, next);
    } catch (error) {
      console.error("[Auth] Callback error:", error);
      res.redirect(302, `/?error=server_error`);
    }
  });

  /** POST /api/auth/logout — clears session cookies */
  app.post("/api/auth/logout", (_req: Request, res: Response) => {
    res.clearCookie("sb-access-token", { path: "/" });
    res.clearCookie("sb-refresh-token", { path: "/" });
    res.json({ success: true });
  });

  /** Legacy redirect for old bookmarks */
  app.get("/api/oauth/callback", (req: Request, res: Response) => {
    res.redirect(302, `/auth/callback?${new URLSearchParams(req.query as Record<string, string>)}`);
  });
}
