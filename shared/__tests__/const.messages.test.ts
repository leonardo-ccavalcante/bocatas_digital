/**
 * const.messages.test.ts — RC-07 (F011/F237).
 * La UI es Spanish-only (AGENTS.md): los mensajes de los guards tRPC llegan a
 * toasts del cliente y no pueden estar en inglés. Los códigos de soporte
 * (10001)/(10002) se conservan para correlación.
 */
import { describe, it, expect } from "vitest";
import { UNAUTHED_ERR_MSG, NOT_ADMIN_ERR_MSG } from "../const";

describe("mensajes de guardia de auth en español", () => {
  it("UNAUTHED_ERR_MSG es español y conserva el código (10001)", () => {
    expect(UNAUTHED_ERR_MSG).not.toMatch(/please|login/i);
    expect(UNAUTHED_ERR_MSG).toContain("(10001)");
  });

  it("NOT_ADMIN_ERR_MSG es español y conserva el código (10002)", () => {
    expect(NOT_ADMIN_ERR_MSG).not.toMatch(/permission|you do not/i);
    expect(NOT_ADMIN_ERR_MSG).toContain("(10002)");
  });
});
