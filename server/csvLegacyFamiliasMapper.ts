// Pure mapping functions for the legacy FAMILIAS CSV importer.
//
// Inputs are raw strings as parsed from the user's Excel/CSV; outputs target
// the Supabase enums declared in client/src/lib/database.types.ts. Every
// non-trivial coercion emits a `RowWarning` so the operator sees it in the
// preview UI before confirming.
//
// No DB access here — keep these functions pure for ≥95% unit-test coverage.

import { z } from "zod";
import {
  type LegacyRow,
  type CleanRow,
  type RowError,
  type RowWarning,
  type nivelEstudiosEnum,
  type situacionLaboralEnum,
  CleanRowSchema,
  NOMBRE_PLACEHOLDER,
  APELLIDOS_PLACEHOLDER,
} from "../shared/legacyFamiliasTypes";
import { normalizeHeader } from "./csvLegacyFamiliasParser";
import {
  MONTHS,
  COUNTRY_LOOKUP,
  PARENTESCO_LOOKUP,
  COLECTIVO_LOOKUP,
} from "./csvLegacyFamiliasDictionaries";

// Canonical column order in the legacy spreadsheet. Used by the parser to
// produce LegacyRow from a CSV array.
export const CSV_HEADERS = [
  "NÚMERO DE ORDEN",
  "NUMERO FAMILIA BOCATAS",
  "FECHA ALTA",
  "NOMBRE",
  "APELLIDOS",
  "SEXO",
  "TELEFONO",
  "DNI/NIE/ PASAPORTE",
  "CABEZA DE FAMILIA",
  "PAIS",
  "Fecha Nacimiento",
  "EMAIL",
  "DIRECCION",
  "CODIGO POSTAL",
  "Localidad",
  "NOTAS PARA INFORME SOCIAL",
  "Nivel de estudios finalizados",
  "Situación Laboral",
  "Otras Características",
] as const;

/**
 * buildTemplateCsv — generate a minimal valid CSV template with the correct
 * headers and one example titular row so users can see the expected format.
 * Used by the download-template button in BulkImportFamiliasLegacyModal and
 * validated by legacy-import.template-roundtrip.test.ts.
 */
export function buildTemplateCsv(): string {
  const header = CSV_HEADERS.join(",");
  // One example row: titular (CABEZA DE FAMILIA = x), valid DNI, realistic data
  const exampleRow = [
    "1",           // NÚMERO DE ORDEN
    "100",         // NUMERO FAMILIA BOCATAS
    "01/01/2024",  // FECHA ALTA
    "Nombre",      // NOMBRE
    "Apellidos",   // APELLIDOS
    "M",           // SEXO
    "600000000",   // TELEFONO
    "12345678A",   // DNI/NIE/ PASAPORTE
    "x",           // CABEZA DE FAMILIA
    "España",      // PAIS
    "01/01/1980",  // Fecha Nacimiento
    "",            // EMAIL
    "",            // DIRECCION
    "",            // CODIGO POSTAL
    "",            // Localidad
    "",            // NOTAS PARA INFORME SOCIAL
    "",            // Nivel de estudios finalizados
    "",            // Situación Laboral
    "",            // Otras Características
  ].join(",");
  return [header, exampleRow].join("\n");
}

// ─── parseDate (G3) ──────────────────────────────────────────────────────────
//
// Handles every shape seen in the real export: dd/mm/yyyy, d/m/yyyy, 2-digit
// years (pivoted — a DOB can't be in the future), Spanish month names
// (abbreviated + full), Excel serials, and junk punctuation (`//`, `_`, stray
// `º`/`!`). Unparseable residue → date_invalid + warning (best-effort policy).

type ParsedDate = { value: string | null; warning: RowWarning | null };

// Pivot for 2-digit years: anything that would land in the future is pushed
// back a century. Computed once at module load.
const PIVOT_YEAR = new Date().getFullYear();

// Bound an echoed raw cell in operator-facing warnings: if a column is
// mis-mapped, this stops a long PII string from spilling into the (admin-
// only, 30-min-TTL) preview stash. Keeps the value-class message intact.
function clip(s: string, n = 40): string {
  const t = s.trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

function isoFromYMD(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (year < 1900 || year > 2100) return null;
  // Day-of-month vs month length (incl. leap years).
  const daysInMonth = new Date(year, month, 0).getDate();
  if (day > daysInMonth) return null;
  return `${year.toString().padStart(4, "0")}-${month
    .toString()
    .padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

// Excel 1900 date system. Epoch 1899-12-30 absorbs Excel's fictitious
// 1900-02-29 so serials match what the spreadsheet displays.
function excelSerialToISO(serial: number): string | null {
  const ms = Date.UTC(1899, 11, 30) + serial * 86_400_000;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return isoFromYMD(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

function invalidDate(raw: string): ParsedDate {
  return {
    value: null,
    warning: {
      field: "fecha",
      code: "date_invalid",
      message: `Fecha no reconocida: "${clip(raw)}".`,
    },
  };
}

export function parseDate(input: string | undefined): ParsedDate {
  if (!input) return { value: null, warning: null };
  const raw = input.trim();
  if (!raw) return { value: null, warning: null };

  // 1) Excel serial — a bare integer in a sane date range. Lower bound 10_000
  //    (≈ 1927-05-18) stays above any 4-digit "year only" (max 9999, e.g.
  //    "1985"), which must fall through to invalid, while still accepting the
  //    serials of elderly beneficiaries born in the 1920s-30s.
  if (/^\d{4,6}$/.test(raw)) {
    const n = Number(raw);
    if (n >= 10_000 && n <= 80_000) {
      const iso = excelSerialToISO(n);
      return iso ? { value: iso, warning: null } : invalidDate(raw);
    }
    return invalidDate(raw);
  }

  // 2) Split on any run of non-alphanumerics (handles / - . _ //, stray º/!).
  const parts = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^0-9A-Za-z]+/)
    .filter(Boolean);
  if (parts.length !== 3) return invalidDate(raw);

  const day = Number(parts[0]);
  if (!Number.isInteger(day)) return invalidDate(raw);

  let month: number;
  if (/^\d{1,2}$/.test(parts[1])) {
    month = Number(parts[1]);
  } else {
    const named = MONTHS[parts[1].toLowerCase()];
    if (!named) return invalidDate(raw);
    month = named;
  }

  let year: number;
  let ambiguous = false;
  if (/^\d{4}$/.test(parts[2])) {
    year = Number(parts[2]);
  } else if (/^\d{2}$/.test(parts[2])) {
    const yy = Number(parts[2]);
    const thisCentury = 2000 + yy;
    if (thisCentury > PIVOT_YEAR) {
      // A 20xx reading would be in the future → it can only be 19xx. Unambiguous.
      year = 1900 + yy;
    } else {
      // 20xx is a valid past year, but 19xx is also plausible → flag for review.
      year = thisCentury;
      ambiguous = true;
    }
  } else {
    return invalidDate(raw);
  }

  const iso = isoFromYMD(year, month, day);
  if (!iso) {
    return {
      value: null,
      warning: {
        field: "fecha",
        code: "date_invalid",
        message: `Fecha fuera de rango: "${clip(raw)}".`,
      },
    };
  }
  return {
    value: iso,
    warning: ambiguous
      ? {
          field: "fecha",
          code: "date_ambiguous",
          message: `Año de 2 dígitos interpretado como ${year} en "${clip(raw)}". Verificar el siglo.`,
        }
      : null,
  };
}

// ─── parseSexo ──────────────────────────────────────────────────────────────

type ParsedSexo = {
  value: "masculino" | "femenino" | null;
  warning: RowWarning | null;
};

export function parseSexo(input: string | undefined): ParsedSexo {
  if (!input) return { value: null, warning: null };
  const v = input.trim().toLowerCase();
  if (!v) return { value: null, warning: null };
  if (v === "m") return { value: "masculino", warning: null };
  if (v === "f") return { value: "femenino", warning: null };
  return {
    value: null,
    warning: {
      field: "sexo",
      code: "sexo_unknown",
      message: `Valor de sexo no reconocido: "${clip(input)}". Esperado M o F.`,
    },
  };
}

// ─── parseCountry ──────────────────────────────────────────────────────────

type ParsedCountry = { value: string | null; warning: RowWarning | null };

export function parseCountry(input: string | undefined): ParsedCountry {
  if (!input) return { value: null, warning: null };
  // Dual nationality ("Perú/Española") → take the first declared country.
  const key = normalizeHeader(input.split("/")[0]);
  if (!key) return { value: null, warning: null };
  const iso = COUNTRY_LOOKUP[key];
  if (iso) return { value: iso, warning: null };
  return {
    value: null,
    warning: {
      field: "pais",
      code: "country_unknown",
      message: `País no reconocido: "${clip(input)}". Añadir a la tabla de mapeo o corregir en origen.`,
    },
  };
}

// ─── parseEstado (Phase 2 — families.estado, CHECK in ('activa','baja')) ─────

type ParsedEstado = { value: "activa" | "baja" | null; warning: RowWarning | null };

export function parseEstado(input: string | undefined): ParsedEstado {
  if (!input) return { value: null, warning: null };
  const v = input.trim().toLowerCase();
  if (!v) return { value: null, warning: null };
  if (v === "a" || v === "activa" || v === "activo" || v === "alta") {
    return { value: "activa", warning: null };
  }
  if (v === "b" || v === "baja") {
    return { value: "baja", warning: null };
  }
  // Real-file junk: "NP", "125", "Esta en otro codigo", … → null + flag.
  return {
    value: null,
    warning: {
      field: "estado",
      code: "estado_unknown",
      message: `Estado no reconocido: "${clip(input)}". Esperado A/Activa o B/Baja.`,
    },
  };
}

// ─── parseCodigoPostal (B3 — families/persons CP CHECK is ^\d{5}$) ────────────
//
// The hand-maintained sheets carry CP as "28012 ", "28.012", "28012/28013",
// "Madrid 28012", 4-digit, etc. Extract the first 5-digit Spanish CP (province
// 01-52) best-effort; anything else → null + warning, NEVER a raw value (a raw
// value would raise check_violation and roll back the whole family on import).

type ParsedCP = { value: string | null; warning: RowWarning | null };

export function parseCodigoPostal(input: string | undefined): ParsedCP {
  if (!input) return { value: null, warning: null };
  const raw = input.trim();
  if (!raw) return { value: null, warning: null };
  const digits = (raw.match(/\d+/g) ?? []).join("");
  if (digits.length >= 5) {
    const cp = digits.slice(0, 5);
    const prov = Number(cp.slice(0, 2));
    if (prov >= 1 && prov <= 52) return { value: cp, warning: null };
  }
  return {
    value: null,
    warning: {
      field: "codigo_postal",
      code: "cp_invalid",
      message: `Código postal no válido: "${clip(raw)}".`,
    },
  };
}

// ─── parseDocumento ────────────────────────────────────────────────────────

type ParsedDocumento = {
  tipo_documento: "DNI" | "NIE" | "Pasaporte" | null;
  numero_documento: string | null;
  warning: RowWarning | null;
};

export function parseDocumento(input: string | undefined): ParsedDocumento {
  if (!input) {
    return { tipo_documento: null, numero_documento: null, warning: null };
  }
  const cleaned = input.replace(/[\s.\-_]/g, "").toUpperCase();
  if (!cleaned) {
    return { tipo_documento: null, numero_documento: null, warning: null };
  }
  if (/^[XYZ]\d{7,8}[A-Z]$/.test(cleaned)) {
    return {
      tipo_documento: "NIE",
      numero_documento: cleaned,
      warning: null,
    };
  }
  if (/^\d{7,8}[A-Z]$/.test(cleaned)) {
    return {
      tipo_documento: "DNI",
      numero_documento: cleaned,
      warning: null,
    };
  }
  // Anything else is treated as Pasaporte. Numbers may have international
  // formats we don't validate further.
  return {
    tipo_documento: "Pasaporte",
    numero_documento: cleaned,
    warning: null,
  };
}

// ─── parseNivelEstudios ────────────────────────────────────────────────────

type NivelEstudios = z.infer<typeof nivelEstudiosEnum>;

type ParsedNivelEstudios = {
  value: NivelEstudios | null;
  warning: RowWarning | null;
};

export function parseNivelEstudios(input: string | undefined): ParsedNivelEstudios {
  if (!input) return { value: null, warning: null };
  const v = input.trim().toLowerCase();
  if (!v) return { value: null, warning: null };

  if (v === "sin estudios") return { value: "sin_estudios", warning: null };
  if (v === "educación primaria" || v === "educacion primaria") {
    return { value: "primaria", warning: null };
  }
  if (v === "educación secundaria" || v === "educacion secundaria") {
    return { value: "secundaria", warning: null };
  }
  if (
    v === "educación post-secundaria no superior" ||
    v === "educacion post-secundaria no superior" ||
    v === "educación postsecundaria no superior"
  ) {
    return {
      value: "bachillerato",
      warning: {
        field: "nivel_estudios",
        code: "estudios_unknown",
        message:
          "Coerced 'Educación Post-Secundaria no Superior' → bachillerato (CINE 3-4). Revisar caso a caso si formación profesional aplica.",
      },
    };
  }
  if (v === "educación superior" || v === "educacion superior") {
    return { value: "universitario", warning: null };
  }

  return {
    value: null,
    warning: {
      field: "nivel_estudios",
      code: "estudios_unknown",
      message: `Nivel de estudios no reconocido: "${clip(input)}".`,
    },
  };
}

// ─── parseSituacionLaboral ─────────────────────────────────────────────────

type SituacionLaboral = z.infer<typeof situacionLaboralEnum>;

type ParsedSituacionLaboral = {
  value: SituacionLaboral | null;
  warning: RowWarning | null;
};

export function parseSituacionLaboral(
  input: string | undefined
): ParsedSituacionLaboral {
  if (!input) return { value: null, warning: null };
  // Collapse multiple spaces (raw CSV has "Desempleado  con Subsidio…").
  const v = input.trim().replace(/\s+/g, " ").toLowerCase();
  if (!v) return { value: null, warning: null };

  if (v === "personas inactivas") {
    return {
      value: "desempleado",
      warning: {
        field: "situacion_laboral",
        code: "laboral_unknown",
        message:
          "Coerced 'Personas Inactivas' (INE) → desempleado. Categoría origen anotada en observaciones.",
      },
    };
  }
  if (v === "personas en situación de precariedad laboral" ||
      v === "personas en situacion de precariedad laboral") {
    return {
      value: "empleo_temporal",
      warning: {
        field: "situacion_laboral",
        code: "laboral_unknown",
        message:
          "Coerced 'Personas en situación de Precariedad Laboral' → empleo_temporal.",
      },
    };
  }
  // `v` is already space-collapsed above, so a single startsWith suffices.
  if (v.startsWith("desempleado con subsidio")) {
    return { value: "desempleado", warning: null };
  }

  return {
    value: null,
    warning: {
      field: "situacion_laboral",
      code: "laboral_unknown",
      message: `Situación laboral no reconocida: "${clip(input)}".`,
    },
  };
}

// ─── parseColectivos ───────────────────────────────────────────────────────

type ParsedColectivos = {
  colectivos: string[];
  warning: RowWarning | null;
};

export function parseColectivos(input: string | undefined): ParsedColectivos {
  if (!input) return { colectivos: [], warning: null };
  const key = normalizeHeader(input);
  if (!key) return { colectivos: [], warning: null };
  // "Otros/ especificar…" is the catch-all non-answer → no tag, no warning.
  if (key.startsWith("otros")) return { colectivos: [], warning: null };

  const tag = COLECTIVO_LOOKUP[key];
  if (tag) return { colectivos: [tag], warning: null };

  return {
    colectivos: [],
    warning: {
      field: "otras_caracteristicas",
      code: "colectivo_unknown",
      message: `Categoría de colectivo no reconocida: "${clip(input)}".`,
    },
  };
}

// ─── isTitular / parseParentesco ───────────────────────────────────────────

export function isTitular(input: string | undefined): boolean {
  if (!input) return false;
  return input.trim().toLowerCase() === "x";
}

type ParsedParentesco = {
  relacion: CleanRow["relacion_db"];
  warning: RowWarning | null;
};

export function parseParentesco(input: string | undefined): ParsedParentesco {
  if (!input) return { relacion: "other", warning: null };
  const key = normalizeHeader(input);
  if (!key) return { relacion: "other", warning: null };

  const mapped = PARENTESCO_LOOKUP[key];
  if (mapped) return { relacion: mapped, warning: null };

  return {
    relacion: "other",
    warning: {
      field: "parentesco",
      code: "parentesco_coerced",
      message: `Parentesco no estándar coerced a 'other': "${clip(input)}". Original preservado en metadata.parentesco_original.`,
    },
  };
}

// ─── parseRow ──────────────────────────────────────────────────────────────

export type ParseRowResult =
  | { ok: true; row: CleanRow }
  | { ok: false; error: RowError };

const emailSchema = z.string().email();

export function parseRow(input: LegacyRow, rowNumber: number): ParseRowResult {
  const numero_familia = (input.numero_familia ?? "").trim();
  if (!numero_familia) {
    return {
      ok: false,
      error: {
        row_number: rowNumber,
        field: "numero_familia",
        message: "NUMERO FAMILIA BOCATAS es obligatorio.",
      },
    };
  }
  const warnings: RowWarning[] = [];

  // Phase 5 (best-effort / G9): a missing nombre/apellidos no longer rejects the
  // row — it would orphan the family (numero_familia is the real key). Recover
  // with a placeholder + warning so the operator can complete it later.
  let nombre = (input.nombre ?? "").trim();
  if (!nombre) {
    nombre = NOMBRE_PLACEHOLDER;
    warnings.push({
      field: "nombre",
      code: "nombre_placeholder",
      message: `NOMBRE vacío — sustituido por "${NOMBRE_PLACEHOLDER}". Completar manualmente.`,
    });
  }
  let apellidos = (input.apellidos ?? "").trim();
  if (!apellidos) {
    apellidos = APELLIDOS_PLACEHOLDER;
    warnings.push({
      field: "apellidos",
      code: "apellidos_placeholder",
      message: `APELLIDOS vacío — sustituido por "${APELLIDOS_PLACEHOLDER}". Completar manualmente.`,
    });
  }

  // Email is optional but, if present, must be valid.
  let email: string | null = null;
  const emailRaw = (input.email ?? "").trim();
  if (emailRaw) {
    const parsed = emailSchema.safeParse(emailRaw);
    if (!parsed.success) {
      return {
        ok: false,
        error: {
          row_number: rowNumber,
          field: "email",
          message: `Email inválido: "${emailRaw}".`,
        },
      };
    }
    email = parsed.data;
  }

  const titular = isTitular(input.cabeza_familia);
  const parentescoOriginal = titular ? null : (input.cabeza_familia ?? "").trim() || null;

  const dateAlta = parseDate(input.fecha_alta);
  if (dateAlta.warning) warnings.push(dateAlta.warning);

  const dateBirth = parseDate(input.fecha_nacimiento);
  if (dateBirth.warning) warnings.push(dateBirth.warning);

  const sexo = parseSexo(input.sexo);
  if (sexo.warning) warnings.push(sexo.warning);

  const country = parseCountry(input.pais);
  if (country.warning) warnings.push(country.warning);

  const doc = parseDocumento(input.documento);
  if (doc.warning) warnings.push(doc.warning);

  const estudios = parseNivelEstudios(input.nivel_estudios);
  if (estudios.warning) warnings.push(estudios.warning);

  const laboral = parseSituacionLaboral(input.situacion_laboral);
  if (laboral.warning) warnings.push(laboral.warning);

  const colectivos = parseColectivos(input.otras_caracteristicas);
  if (colectivos.warning) warnings.push(colectivos.warning);

  const parentesco = titular
    ? { relacion: "other" as const, warning: null }
    : parseParentesco(parentescoOriginal ?? "");
  if (parentesco.warning) warnings.push(parentesco.warning);

  // Compose observaciones: notas + situación laboral original (when coerced)
  // so the analytics distinction is preserved.
  const obsParts: string[] = [];
  const notas = (input.notas_informe_social ?? "").trim();
  if (notas) obsParts.push(notas);
  if (laboral.warning && input.situacion_laboral) {
    obsParts.push(`Categoría origen: ${input.situacion_laboral.trim()} (legacy CSV).`);
  }
  const observaciones = obsParts.length > 0 ? obsParts.join("\n\n") : null;

  // Raw CP kept in metadata for provenance; validated CP (5-digit) → person.codigo_postal.
  const codigoPostal = (input.codigo_postal ?? "").trim();
  const cp = parseCodigoPostal(input.codigo_postal);
  if (cp.warning) warnings.push(cp.warning);

  // ACTIVA/BAJA → row-level estado (titular's drives families.estado downstream).
  const estado = parseEstado(input.estado);
  if (estado.warning) warnings.push(estado.warning);

  const row: CleanRow = {
    row_number: rowNumber,
    legacy_numero_familia: numero_familia,
    legacy_numero_orden: (input.numero_orden ?? "").trim() || undefined,
    is_titular: titular,
    parentesco_original: parentescoOriginal,
    fecha_alta: dateAlta.value,
    estado: estado.value,
    person: {
      nombre,
      apellidos,
      fecha_nacimiento: dateBirth.value,
      genero: sexo.value,
      pais_origen: country.value,
      telefono: (input.telefono ?? "").trim() || null,
      email,
      direccion: (input.direccion ?? "").trim() || null,
      municipio: (input.localidad ?? "").trim() || null,
      tipo_documento: doc.tipo_documento,
      numero_documento: doc.numero_documento,
      nivel_estudios: estudios.value,
      situacion_laboral: laboral.value,
      observaciones,
      codigo_postal: cp.value,
      metadata: {
        colectivos: colectivos.colectivos,
        codigo_postal: codigoPostal || undefined,
        legacy_orden: (input.numero_orden ?? "").trim() || undefined,
        legacy_row: rowNumber,
        parentesco_original: parentescoOriginal ?? undefined,
      },
    },
    relacion_db: parentesco.relacion,
    warnings,
  };

  // Final shape check — should be unreachable; defensive.
  const valid = CleanRowSchema.safeParse(row);
  if (!valid.success) {
    return {
      ok: false,
      error: {
        row_number: rowNumber,
        field: valid.error.issues[0]?.path.join(".") ?? "unknown",
        message: valid.error.issues[0]?.message ?? "Validation failed",
      },
    };
  }
  return { ok: true, row: valid.data };
}
