import { describe, expect, it, vi } from "vitest";
import { registerHealthRoute } from "./health";

describe("registerHealthRoute", () => {
  it("responde 200 con un estado JSON estable para el health check de Railway", () => {
    let handler: ((req: unknown, res: unknown) => void) | undefined;
    const app = {
      get: vi.fn((_path: string, routeHandler: (req: unknown, res: unknown) => void) => {
        handler = routeHandler;
      }),
    };
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));

    registerHealthRoute(app as unknown as Parameters<typeof registerHealthRoute>[0]);

    expect(app.get).toHaveBeenCalledWith("/health", expect.any(Function));
    handler?.({}, { status });
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({ status: "ok" });
  });
});
