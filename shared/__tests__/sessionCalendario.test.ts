/**
 * sessionCalendario.test.ts — la regla de generación del calendario.
 *
 * Esta es la MISMA función que ejecuta generarSesiones en el servidor
 * (server/routers/programs.sessions.ts) y la que cuenta la previsualización
 * del modal «Generar calendario». Si estos casos cambian, cambian los dos
 * lados a la vez — que es exactamente el punto de haberla extraído.
 */
import { describe, it, expect } from "vitest";
import {
  fechasProgramadas,
  resumirCalendario,
  validarCalendario,
} from "../sessionCalendario";
import type { ProgramacionSlot } from "../sessionSchemas";

const LUNES: ProgramacionSlot = { dia_semana: 1, hora_inicio: "09:00", hora_fin: "13:00" };
const MIERCOLES: ProgramacionSlot = { dia_semana: 3, hora_inicio: "16:00", hora_fin: "20:00" };
const UBICACION = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

describe("fechasProgramadas", () => {
  it("devuelve las fechas de dos franjas semanales, en orden de calendario", () => {
    const fechas = fechasProgramadas("2026-09-07", "2026-09-18", [LUNES, MIERCOLES]);
    expect(fechas.map((f) => f.fecha)).toEqual([
      "2026-09-07", "2026-09-09", "2026-09-14", "2026-09-16",
    ]);
    expect(fechas[0].slot.hora_inicio).toBe("09:00");
    expect(fechas[1].slot.hora_inicio).toBe("16:00");
  });

  it("no exige que el rango empiece en un día de la franja", () => {
    // 2026-09-08 es martes; la primera clase cae el lunes siguiente.
    const fechas = fechasProgramadas("2026-09-08", "2026-09-21", [LUNES]);
    expect(fechas.map((f) => f.fecha)).toEqual(["2026-09-14", "2026-09-21"]);
  });

  it("incluye los dos extremos del rango", () => {
    const fechas = fechasProgramadas("2026-09-07", "2026-09-07", [LUNES]);
    expect(fechas.map((f) => f.fecha)).toEqual(["2026-09-07"]);
  });

  it("con dos franjas el mismo día usa la primera y lo marca en solapadas (límite v1)", () => {
    const otraLunes: ProgramacionSlot = { dia_semana: 1, hora_inicio: "18:00", hora_fin: "20:00" };
    const fechas = fechasProgramadas("2026-09-07", "2026-09-07", [LUNES, otraLunes]);
    expect(fechas).toHaveLength(1);
    expect(fechas[0].slot.hora_inicio).toBe("09:00");
    expect(fechas[0].solapadas).toBe(2);
  });

  it("devuelve vacío sin franjas y con el rango invertido", () => {
    expect(fechasProgramadas("2026-09-07", "2026-09-18", [])).toEqual([]);
    expect(fechasProgramadas("2026-09-18", "2026-09-07", [LUNES])).toEqual([]);
  });
});

describe("resumirCalendario", () => {
  it("cuenta las sesiones nuevas y el rango real que se va a crear", () => {
    const r = resumirCalendario("2026-09-07", "2026-09-18", [LUNES, MIERCOLES]);
    expect(r).toEqual({
      nuevas: 4, existentes: 0, primera: "2026-09-07", ultima: "2026-09-16",
    });
  });

  it("descuenta las fechas que ya tienen sesión (generarSesiones las salta)", () => {
    const r = resumirCalendario("2026-09-07", "2026-09-18", [LUNES, MIERCOLES], [
      "2026-09-07", "2026-09-09",
    ]);
    expect(r).toEqual({
      nuevas: 2, existentes: 2, primera: "2026-09-14", ultima: "2026-09-16",
    });
  });

  it("es honesto cuando no va a crear nada", () => {
    expect(resumirCalendario("2026-09-07", "2026-09-18", [])).toEqual({
      nuevas: 0, existentes: 0, primera: null, ultima: null,
    });
    expect(resumirCalendario("", "", [LUNES])).toEqual({
      nuevas: 0, existentes: 0, primera: null, ultima: null,
    });
  });
});

describe("validarCalendario", () => {
  const valida = { desde: "2026-09-07", hasta: "2026-09-18", slots: [LUNES], locationId: UBICACION };

  it("acepta una configuración completa", () => {
    expect(validarCalendario(valida)).toEqual([]);
  });

  it("exige al menos un día de clase", () => {
    expect(validarCalendario({ ...valida, slots: [] })).toContain(
      "Añade al menos un día de clase."
    );
  });

  it("exige hora de fin posterior a la de inicio", () => {
    const malo: ProgramacionSlot = { dia_semana: 1, hora_inicio: "13:00", hora_fin: "09:00" };
    expect(validarCalendario({ ...valida, slots: [malo] })).toContain(
      "Cada franja necesita hora de inicio y hora de fin, y la de fin debe ser posterior a la de inicio."
    );
  });

  it("exige ubicación — sin ella no se puede pasar lista", () => {
    expect(validarCalendario({ ...valida, locationId: "" })).toContain(
      "Selecciona una ubicación: sin ella no se puede pasar lista en la sesión."
    );
  });

  it("exige el rango de fechas y lo quiere en orden", () => {
    expect(validarCalendario({ ...valida, desde: "" })).toContain(
      "Indica el primer y el último día del curso."
    );
    expect(validarCalendario({ ...valida, desde: "2026-09-18", hasta: "2026-09-07" })).toContain(
      "El último día no puede ser anterior al primero."
    );
  });
});
