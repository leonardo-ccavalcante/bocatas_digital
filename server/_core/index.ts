import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import rateLimit from "express-rate-limit";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { createAdminClient } from "../../client/src/lib/supabase/server";
import { generateWarningsReport } from "../legacyImportReport";
import { generateInformesWarningsReport } from "../informesImportReport";
import type { InformesStashPayload } from "../../shared/legacyFamiliasTypes";
import { sdk } from "./sdk";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

// ─── Rate limiters ────────────────────────────────────────────────────────────
// General API: 200 req / 15 min per IP (generous for normal use)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
  skip: () => process.env.NODE_ENV === "test",
});
// Auth endpoints: 20 req / 15 min per IP (brute-force protection)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many authentication attempts, please try again later." },
  skip: () => process.env.NODE_ENV === "test",
});

async function startServer() {
  const app = express();
  const server = createServer(app);

    // Body parsers: routes that carry large payloads (base64 images, CSV exports)
  // get 10MB; everything else gets the safe 1MB default.
  // IMPORTANT: use a single conditional middleware so the 1MB global parser
  // never runs first and rejects large-payload routes with HTTP 413.
  const LARGE_PAYLOAD_PATHS = [
    "/api/trpc/ocr",
    "/api/trpc/persons.uploadPhoto",
    "/api/trpc/families.previewLegacyImport",
    "/api/trpc/families.confirmLegacyImport",
  ];
  app.use((req, res, next) => {
    const isLarge = LARGE_PAYLOAD_PATHS.some((p) => req.path === p || req.path.startsWith(p + "?") || req.path.startsWith(p + "/"));
    return express.json({ limit: isLarge ? "10mb" : "1mb" })(req, res, next);
  });
  app.use(express.urlencoded({ limit: "1mb", extended: true }));
  // Trust the first proxy (required for express-rate-limit to correctly identify IPs behind reverse proxies)
  app.set("trust proxy", 1);
  // Rate limiting
  app.use("/api/trpc", apiLimiter);
  app.use("/api/oauth", authLimiter);

  // OAuth callback under /api/oauth/callback
  registerStorageProxy(app);
  registerOAuthRoutes(app);

  // ── REST: download warnings/errors Excel report for a legacy import preview ──
  // GET /api/legacy-import/report/:token
  // Requires a valid session cookie (admin only). Returns an .xlsx file.
  app.get("/api/legacy-import/report/:token", async (req, res) => {
    try {
      // Auth: verify session cookie via sdk (same as tRPC context)
      const user = await sdk.authenticateRequest(req).catch(() => null);
      if (!user || user.role !== "admin") {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      const { token } = req.params;
      if (!token || typeof token !== "string" || token.length > 128) {
        res.status(400).json({ error: "Invalid token" });
        return;
      }
      const supabase = createAdminClient();
      const { data, error } = await supabase
        .from("bulk_import_previews")
        .select("parsed_rows")
        .eq("token", token)
        .single();
      if (error || !data) {
        res.status(404).json({ error: "Preview not found or expired" });
        return;
      }
      const parsedRows = data.parsed_rows as { groups?: unknown[]; src_filename?: string | null };
      const groups = (parsedRows?.groups ?? []) as Parameters<typeof generateWarningsReport>[0];
      const buffer = await generateWarningsReport(groups);
      const srcFilename = parsedRows?.src_filename ?? "importacion";
      const baseName = srcFilename.replace(/\.csv$/i, "");
      const reportName = `reporte_advertencias_${baseName}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${reportName}"`);
      res.send(buffer);
    } catch (err) {
      console.error("[legacy-import/report] Error generating report:", err);
      res.status(500).json({ error: "Failed to generate report" });
    }
  });

  // POST /api/legacy-import/confirm-report
  // Requires a valid session cookie (admin only). Accepts error_details JSON, returns .xlsx.
  app.post("/api/legacy-import/confirm-report", express.json({ limit: "1mb" }), async (req, res) => {
    try {
      const user = await sdk.authenticateRequest(req).catch(() => null);
      if (!user || user.role !== "admin") {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      const { error_details, src_filename } = req.body as {
        error_details?: Array<{ legacy_numero_familia: string; message: string }>;
        src_filename?: string;
      };
      if (!Array.isArray(error_details)) {
        res.status(400).json({ error: "error_details must be an array" });
        return;
      }
      // Generate a simple XLSX with the error details
      const ExcelJS = await import("exceljs");
      const wb = new ExcelJS.default.Workbook();
      wb.creator = "Bocatas Digital";
      wb.created = new Date();
      const ws = wb.addWorksheet("Fallos de importación");
      ws.views = [{ showGridLines: false }];
      ws.columns = [
        { key: "a", width: 4 },
        { key: "b", width: 12 },
        { key: "c", width: 80 },
      ];
      // Header
      const hdr = ws.addRow(["", "Nº Familia", "Error"]);
      hdr.eachCell({ includeEmpty: false }, (cell, col) => {
        if (col === 1) return;
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1A237E" } };
        cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
        cell.alignment = { vertical: "middle" };
      });
      hdr.height = 22;
      for (const e of error_details) {
        const row = ws.addRow(["", e.legacy_numero_familia, e.message]);
        row.getCell("B").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFCE4EC" } };
        row.getCell("B").font = { color: { argb: "FF880E4F" }, size: 10 };
        row.getCell("C").font = { size: 10 };
        row.getCell("C").alignment = { wrapText: true };
        row.height = 28;
      }
      const buf = await wb.xlsx.writeBuffer();
      const baseName = (src_filename ?? "importacion").replace(/\.csv$/i, "");
      const reportName = `reporte_fallos_${baseName}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${reportName}"`);
      res.send(Buffer.from(buf));
    } catch (err) {
      console.error("[legacy-import/confirm-report] Error generating report:", err);
      res.status(500).json({ error: "Failed to generate report" });
    }
  });

  // GET /api/informes-import/report/:token
  // Requires a valid session cookie (admin only). Returns an .xlsx file.
  app.get("/api/informes-import/report/:token", async (req, res) => {
    try {
      const user = await sdk.authenticateRequest(req).catch(() => null);
      if (!user || user.role !== "admin") {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      const { token } = req.params;
      if (!token || typeof token !== "string" || token.length > 128) {
        res.status(400).json({ error: "Invalid token" });
        return;
      }
      const supabase = createAdminClient();
      const { data, error } = await supabase
        .from("bulk_import_previews")
        .select("parsed_rows")
        .eq("token", token)
        .single();
      if (error || !data) {
        res.status(404).json({ error: "Preview not found or expired" });
        return;
      }
      const stash = data.parsed_rows as InformesStashPayload;
      if (stash?.kind !== "informes_enrich_v1") {
        res.status(400).json({ error: "Token is not an Informes preview" });
        return;
      }
      const buffer = await generateInformesWarningsReport(stash.families, stash.src_filename);
      const baseName = (stash.src_filename ?? "informes").replace(/\.csv$/i, "");
      const reportName = `reporte_informes_${baseName}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${reportName}"`);
      res.send(buffer);
    } catch (err) {
      console.error("[informes-import/report] Error generating report:", err);
      res.status(500).json({ error: "Failed to generate report" });
    }
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  // Override the host shown in the startup banner via DEV_HOST. Defaults to
  // localhost. Useful when running inside Docker / a dev container where the
  // host-visible address is not 'localhost' (e.g. docker-compose service name).
  const displayHost = process.env.DEV_HOST || "localhost";

  // In production the PORT env var is authoritative (set by the platform).
  // Silently drifting to a different port would make the container unreachable.
  // Fail fast so the orchestrator can restart with a clean port assignment.
  if (process.env.NODE_ENV === "production") {
    const available = await isPortAvailable(preferredPort);
    if (!available) {
      console.error(`[FATAL] Port ${preferredPort} is already in use. Exiting.`);
      process.exit(1);
    }
    server.listen(preferredPort, () => {
      console.log(`Server running on http://${displayHost}:${preferredPort}/`);
    });
  } else {
    // Development: auto-find next available port for convenience
    const port = await findAvailablePort(preferredPort);
    if (port !== preferredPort) {
      console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
    }
    server.listen(port, () => {
      console.log(`Server running on http://${displayHost}:${port}/`);
    });
  }
}

startServer().catch(console.error);
