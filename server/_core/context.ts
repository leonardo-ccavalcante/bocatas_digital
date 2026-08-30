import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../db";
import { authenticateRequest, requestHasCredential, isAppRole } from "./authenticateRequest";
import { Logger } from "./logger";
import { randomUUID } from "crypto";

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

  // Capture credential presence BEFORE authenticating: authenticateRequest
  // returns null both for an anonymous request and for a rejected credential,
  // and the dev bypass below must distinguish the two.
  const credentialPresented = requestHasCredential(opts.req);

  try {
    user = await authenticateRequest(opts.req);
  } catch {
    user = null;
  }

  // A credential was presented but did not resolve to a user (rejected/expired
  // token, or a JWT-secret misconfig). Surface it — IDs only, never PII — so a
  // real auth bug is not mistaken for a normal anonymous session. Only while the
  // dev bypass is armed (NODE_ENV=development + DEV_ADMIN_LOGIN=1), where telling
  // "rejected" apart from "anonymous" matters and prod log noise is avoided (#172).
  if (
    !user &&
    credentialPresented &&
    process.env.NODE_ENV === "development" &&
    process.env.DEV_ADMIN_LOGIN === "1"
  ) {
    console.warn(
      `[Auth] credencial presentada pero rechazada (correlationId=${correlationId}); bypass DEV omitido por credencial presente.`
    );
  }

  // DEV-ONLY session bypass — only for a genuinely anonymous request. A
  // credential that was PRESENTED and rejected stays unauthenticated (#172 /
  // F077); it must never be silently upgraded to a synthetic session.
  // DEV_LOGIN_ROLE lets voluntario/beneficiario/superadmin be exercised locally
  // without OAuth (defaults to admin); the NODE_ENV + DEV_ADMIN_LOGIN double
  // guard is unchanged, so production is unaffected.
  if (
    !user &&
    !credentialPresented &&
    process.env.NODE_ENV === "development" &&
    process.env.DEV_ADMIN_LOGIN === "1"
  ) {
    const role = isAppRole(process.env.DEV_LOGIN_ROLE) ? process.env.DEV_LOGIN_ROLE : "admin";
    user = {
      id: "dev-admin-uuid",
      openId: "dev-admin",
      name: `Dev ${role}`,
      email: "dev@localhost",
      loginMethod: "dev",
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    } as User;
    console.warn(`[Auth] DEV_ADMIN_LOGIN=1 — injecting synthetic ${role} session.`);
  }

  return { req: opts.req, res: opts.res, user, logger, correlationId };
}
