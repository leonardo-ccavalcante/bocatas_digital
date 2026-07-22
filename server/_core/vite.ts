import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import { createServer as createViteServer, type UserConfig } from "vite";
import viteConfigExport from "../../vite.config";

/**
 * vite.config.ts uses defineConfig(({ command }) => ({...})) — a function form.
 * We must resolve it before spreading into createViteServer options.
 */
function resolveViteConfig(): UserConfig {
  if (typeof viteConfigExport === "function") {
    return (viteConfigExport as (env: { command: string; mode: string }) => UserConfig)(
      { command: "serve", mode: "development" }
    );
  }
  return viteConfigExport as UserConfig;
}

export async function setupVite(app: Express, server: Server) {
  const resolvedConfig = resolveViteConfig();
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  // vite.config.ts default-exports the result of `defineConfig(({ command }) => ...)`,
  // which is a FUNCTION. Spreading a function (`...viteConfig`) yields an empty
  // object, dropping `root`/`plugins`/`resolve`, so the dev server serves from the
  // wrong root with no React plugin (blank page, `/src/main.tsx` 404). Resolve the
  // config first so middleware mode gets the real root + plugins.
  const resolvedConfig =
    typeof viteConfig === "function"
      ? await (viteConfig as (env: { command: "serve"; mode: string }) => unknown)({
          command: "serve",
          mode: process.env.NODE_ENV ?? "development",
        })
      : viteConfig;

  const vite = await createViteServer({
    ...(resolvedConfig as Record<string, unknown>),
    configFile: false,
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath =
    process.env.NODE_ENV === "development"
      ? path.resolve(import.meta.dirname, "../..", "dist", "public")
      : path.resolve(import.meta.dirname, "public");

  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  app.use(express.static(distPath));
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
