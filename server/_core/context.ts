import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
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

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  // DEV-ONLY admin bypass. Manus OAuth is unavailable in local dev, so when it is
  // explicitly opted in (DEV_ADMIN_LOGIN=1) AND we are not in production, inject a
  // synthetic admin session. Double-gated; the production branch never runs it.
  if (
    !user &&
    process.env.NODE_ENV !== "production" &&
    process.env.DEV_ADMIN_LOGIN === "1"
  ) {
    user = {
      id: 999999,
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
