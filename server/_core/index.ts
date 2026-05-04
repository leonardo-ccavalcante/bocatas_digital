import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import rateLimit from "express-rate-limit";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

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

  // Global body parser: 1MB (safe default for JSON API payloads)
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ limit: "1mb", extended: true }));
  // OCR / photo-upload routes carry base64 images — allow up to 10MB
  const uploadJsonParser = express.json({ limit: "10mb" });
  app.use("/api/trpc/ocr", uploadJsonParser);
  app.use("/api/trpc/persons.uploadPhoto", uploadJsonParser);

  // Rate limiting
  app.use("/api/trpc", apiLimiter);
  app.use("/api/oauth", authLimiter);

  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
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
      console.log(`Server running on http://localhost:${preferredPort}/`);
    });
  } else {
    // Development: auto-find next available port for convenience
    const port = await findAvailablePort(preferredPort);
    if (port !== preferredPort) {
      console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
    }
    server.listen(port, () => {
      console.log(`Server running on http://localhost:${port}/`);
    });
  }
}

startServer().catch(console.error);
