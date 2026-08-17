import type { Express, Request, Response } from "express";

export function registerHealthRoute(app: Pick<Express, "get">) {
  app.get("/health", (_req: Request, res: Response) => {
    res.status(200).json({ status: "ok" });
  });
}
