import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../db";
import { authenticateRequest } from "./authenticateRequest";
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
    user = await authenticateRequest(opts.req);
  } catch {
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
    console.warn("[Auth] DEV_ADMIN_LOGIN=1 — injecting synthetic admin session.");
  }

  return { req: opts.req, res: opts.res, user, logger, correlationId };
}
