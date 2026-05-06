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
} from "../shared/legacyFamiliasTypes";

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

// Mapping between the canonical header order and the LegacyRow keys.
const HEADER_TO_KEY: ReadonlyArray<keyof LegacyRow> = [
  "numero_orden",
  "numero_familia",
  "fecha_alta",
  "nombre",
  "apellidos",
  "sexo",
  "telefono",
  "documento",
  "cabeza_familia",
  "pais",
  "fecha_nacimiento",
  "email",
  "direccion",
  "codigo_postal",
  "localidad",
  "notas_informe_social",
  "nivel_estudios",
  "situacion_laboral",
  "otras_caracteristicas",
];

export function fieldsToLegacyRow(fields: ReadonlyArray<string>): LegacyRow {
  const row: LegacyRow = {};
  for (let i = 0; i < HEADER_TO_KEY.length; i++) {
    const key = HEADER_TO_KEY[i];
    const value = fields[i];
    if (value !== undefined && value !== "") {
      row[key] = value;
    }
  }
  return row;
}

// ─── parseDate ──────────────────────────────────────────────────────────────

type ParsedDate = { value: string | null; warning: RowWarning | null };

export function parseDate(input: string | undefined): ParsedDate {
  if (!input) return { value: null, warning: null };
  const trimmed = input.trim();
  if (!trimmed) return { value: null, warning: null };

  const m = trimmed.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (!m) {
    return {
      value: null,
      warning: {
        field: "fecha",
        code: "date_invalid",
        message: `Fecha no reconocida: "${trimmed}". Formato esperado dd/mm/yyyy.`,
      },
    };
  }

  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);

  if (
    month < 1 || month > 12 ||
    day < 1 || day > 31 ||
    year < 1900 || year > 2100
  ) {
    return {
      value: null,
      warning: {
        field: "fecha",
        code: "date_invalid",
        message: `Fecha fuera de rango: "${trimmed}".`,
      },
    };
  }

  // Validate day-of-month against month length (incl. leap years).
  const daysInMonth = new Date(year, month, 0).getDate();
  if (day > daysInMonth) {
    return {
      value: null,
      warning: {
        field: "fecha",
        code: "date_invalid",
        message: `Fecha inválida: "${trimmed}".`,
      },
    };
  }

  const iso = `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
  return { value: iso, warning: null };
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
      message: `Valor de sexo no reconocido: "${input}". Esperado M o F.`,
    },
  };
}

// ─── parseCountry ──────────────────────────────────────────────────────────

const COUNTRY_LOOKUP: Record<string, string> = {
  // Spain
  espana: "ES",
  españa: "ES",

  // Spanish-speaking Americas
  peru: "PE",
  perú: "PE",
  bolivia: "BO",
  colombia: "CO",
  venezuela: "VE",
  ecuador: "EC",
  argentina: "AR",
  chile: "CL",
  paraguay: "PY",
  uruguay: "UY",
  mexico: "MX",
  méxico: "MX",
  honduras: "HN",
  guatemala: "GT",
  "el salvador": "SV",
  nicaragua: "NI",
  panama: "PA",
  panamá: "PA",
  cuba: "CU",
  "republica dominicana": "DO",
  "república dominicana": "DO",
  "costa rica": "CR",

  // Brazil & Portugal
  brasil: "BR",
  brazil: "BR",
  portugal: "PT",

  // Maghreb / Africa
  marruecos: "MA",
  argelia: "DZ",
  tunez: "TN",
  túnez: "TN",
  egipto: "EG",
  senegal: "SN",
  mali: "ML",
  malí: "ML",
  nigeria: "NG",
  ghana: "GH",
  guinea: "GN",
  "guinea ecuatorial": "GQ",
  costa: "CI",
  "costa de marfil": "CI",
  camerun: "CM",
  camerún: "CM",
  mauritania: "MR",
  somalia: "SO",
  etiopia: "ET",
  etiopía: "ET",
  sudan: "SD",
  sudán: "SD",

  // Middle East / Asia
  siria: "SY",
  iran: "IR",
  irán: "IR",
  irak: "IQ",
  iraq: "IQ",
  pakistan: "PK",
  pakistán: "PK",
  india: "IN",
  bangladesh: "BD",
  china: "CN",
  filipinas: "PH",

  // Europe
  rumania: "RO",
  rumanía: "RO",
  ucrania: "UA",
  rusia: "RU",
  francia: "FR",
  italia: "IT",
  alemania: "DE",
  "reino unido": "GB",
};

type ParsedCountry = { value: string | null; warning: RowWarning | null };

export function parseCountry(input: string | undefined): ParsedCountry {
  if (!input) return { value: null, warning: null };
  const key = input.trim().toLowerCase();
  if (!key) return { value: null, warning: null };
  const iso = COUNTRY_LOOKUP[key];
  if (iso) return { value: iso, warning: null };
  return {
    value: null,
    warning: {
      field: "pais",
      code: "country_unknown",
      message: `País no reconocido: "${input}". Añadir a la tabla de mapeo o corregir en origen.`,
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
      message: `Nivel de estudios no reconocido: "${input}".`,
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
  if (
    v.startsWith("desempleado con subsidio") ||
    v.startsWith("desempleado  con subsidio")
  ) {
    return { value: "desempleado", warning: null };
  }

  return {
    value: null,
    warning: {
      field: "situacion_laboral",
      code: "laboral_unknown",
      message: `Situación laboral no reconocida: "${input}".`,
    },
  };
}

// ─── parseColectivos ───────────────────────────────────────────────────────

type ParsedColectivos = {
  colectivos: string[];
  warning: RowWarning | null;
};

const COLECTIVO_LOOKUP: Record<string, string> = {
  "colectivo lgtbi": "LGTBI",
  lgtbi: "LGTBI",
  gitanos: "Gitanos",
  "sin hogar": "Sin_Hogar",
  "reclusos y/o exreclusos": "Reclusos",
  reclusos: "Reclusos",
};

export function parseColectivos(input: string | undefined): ParsedColectivos {
  if (!input) return { colectivos: [], warning: null };
  const v = input.trim().toLowerCase();
  if (!v) return { colectivos: [], warning: null };
  if (v.startsWith("otros/")) return { colectivos: [], warning: null };

  const tag = COLECTIVO_LOOKUP[v];
  if (tag) return { colectivos: [tag], warning: null };

  return {
    colectivos: [],
    warning: {
      field: "otras_caracteristicas",
      code: "colectivo_unknown",
      message: `Categoría de colectivo no reconocida: "${input}".`,
    },
  };
}

// ─── isTitular / parseParentesco ───────────────────────────────────────────

export function isTitular(input: string | undefined): boolean {
  if (!input) return false;
  return input.trim().toLowerCase() === "x";
}

const PARENTESCO_LOOKUP: Record<
  string,
  "esposo_a" | "hijo_a" | "madre" | "padre" | "suegro_a" | "hermano_a" | "abuelo_a"
> = {
  hijo: "hijo_a",
  hija: "hijo_a",
  esposo: "esposo_a",
  esposa: "esposo_a",
  marido: "esposo_a",
  mujer: "esposo_a",
  hermano: "hermano_a",
  hermana: "hermano_a",
  madre: "madre",
  mama: "madre",
  mamá: "madre",
  padre: "padre",
  papa: "padre",
  papá: "padre",
  abuelo: "abuelo_a",
  abuela: "abuelo_a",
  suegro: "suegro_a",
  suegra: "suegro_a",
};

type ParsedParentesco = {
  relacion: CleanRow["relacion_db"];
  warning: RowWarning | null;
};

export function parseParentesco(input: string | undefined): ParsedParentesco {
  if (!input) return { relacion: "other", warning: null };
  const v = input.trim().toLowerCase();
  if (!v) return { relacion: "other", warning: null };

  const mapped = PARENTESCO_LOOKUP[v];
  if (mapped) return { relacion: mapped, warning: null };

  return {
    relacion: "other",
    warning: {
      field: "parentesco",
      code: "parentesco_coerced",
      message: `Parentesco no estándar coerced a 'other': "${input}". Original preservado en metadata.parentesco_original.`,
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
  const nombre = (input.nombre ?? "").trim();
  if (!nombre) {
    return {
      ok: false,
      error: {
        row_number: rowNumber,
        field: "nombre",
        message: "NOMBRE es obligatorio.",
      },
    };
  }
  const apellidos = (input.apellidos ?? "").trim();
  if (!apellidos) {
    return {
      ok: false,
      error: {
        row_number: rowNumber,
        field: "apellidos",
        message: "APELLIDOS es obligatorio.",
      },
    };
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

  const warnings: RowWarning[] = [];

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

  const codigoPostal = (input.codigo_postal ?? "").trim();

  const row: CleanRow = {
    row_number: rowNumber,
    legacy_numero_familia: numero_familia,
    legacy_numero_orden: (input.numero_orden ?? "").trim() || undefined,
    is_titular: titular,
    parentesco_original: parentescoOriginal,
    fecha_alta: dateAlta.value,
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
