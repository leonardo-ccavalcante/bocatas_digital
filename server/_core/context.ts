import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { type User, getUserById } from "../db";
import { Logger } from "./logger";
import { randomUUID } from "crypto";
import { createAdminClient } from "../../client/src/lib/supabase/server";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  logger: Logger;
  correlationId: string;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;
  const correlationId = randomUUID();
  const logger = new Logger();

  try {
    // Extract the Supabase auth token from the request
    // Supabase stores session in cookies (sb-<ref>-auth-token) or Authorization header
    const authHeader = opts.req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (token) {
      // Verify token with Supabase
      const supabase = createAdminClient();
      const { data: { user: authUser }, error } = await supabase.auth.getUser(token);

      if (authUser && !error) {
        user = await getUserById(authUser.id) ?? null;
      }
    } else {
      // Try cookie-based auth
      const cookies = opts.req.headers.cookie ?? "";
      // Look for sb-access-token cookie (set by our /auth/callback)
      const accessTokenMatch = cookies.match(/sb-access-token=([^;]+)/);
      const accessToken = accessTokenMatch ? decodeURIComponent(accessTokenMatch[1]) : null;

      if (accessToken) {
        const supabase = createAdminClient();
        const { data: { user: authUser }, error } = await supabase.auth.getUser(accessToken);
        if (authUser && !error) {
          user = await getUserById(authUser.id) ?? null;
        }
      }
    }
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  // DEV-ONLY admin bypass
  if (
    !user &&
    process.env.NODE_ENV === "development" &&
    process.env.DEV_ADMIN_LOGIN === "1"
  ) {
    user = {
      id: "dev-admin-uuid",
      openId: "dev-admin",
      name: "Dev Admin",
      email: "dev@localhost",
      loginMethod: "dev",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    } as User;
    console.warn(
      "[Auth] DEV_ADMIN_LOGIN=1 — injecting a synthetic admin session (non-production only).",
    );
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    logger,
    correlationId,
  };
}
