import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Railway deployment contract", () => {
  it("defines the production build, start command, health check and restart policy", () => {
    const configPath = resolve(process.cwd(), "railway.json");
    const config = JSON.parse(readFileSync(configPath, "utf8")) as {
      build?: { builder?: string; buildCommand?: string };
      deploy?: {
        startCommand?: string;
        healthcheckPath?: string;
        healthcheckTimeout?: number;
        restartPolicyType?: string;
      };
    };

    expect(config.build).toMatchObject({
      builder: "RAILPACK",
      buildCommand: "pnpm build",
    });
    expect(config.deploy).toMatchObject({
      startCommand: "pnpm start",
      healthcheckPath: "/health",
      healthcheckTimeout: 120,
      restartPolicyType: "ON_FAILURE",
    });
  });
});
