import {
  type TipoAnnouncement,
  type AnnouncementRole,
  type AnnouncementProgram,
  type AudienceRule,
  ANNOUNCEMENT_TYPES,
  LEGACY_ANNOUNCEMENT_TYPES,
  ANNOUNCEMENT_ROLES,
  ANNOUNCEMENT_PROGRAMS,
  isCurrentTipo,
  isLegacyTipo,
} from "../shared/announcementTypes";

// ─── 1. isVisibleToUser ──────────────────────────────────────────────────────

export interface VisibilityInput {
  userRole: AnnouncementRole;
  userPrograms: readonly AnnouncementProgram[];
  audiences: readonly AudienceRule[];
  fechaInicio: Date | null;
  fechaFin: Date | null;
  activo: boolean;
  now?: Date;
}

export function isVisibleToUser(input: VisibilityInput): boolean {
  const now = input.now ?? new Date();

  if (!input.activo) return false;
  if (input.fechaInicio !== null && now < input.fechaInicio) return false;
  if (input.fechaFin !== null && now >= input.fechaFin) return false;
  if (input.audiences.length === 0) return false;

  return input.audiences.some((rule) => {
    const roleMatch =
      rule.roles.length === 0 ||
      (rule.roles as readonly string[]).includes(input.userRole);
    const programMatch =
      rule.programs.length === 0 ||
      input.userPrograms.some((p) =>
        (rule.programs as readonly string[]).includes(p)
      );
    return roleMatch && programMatch;
  });
}

// ─── 2. diffForAudit ─────────────────────────────────────────────────────────

export interface AuditChange {
  field: string;
  old_value: unknown;
  new_value: unknown;
}

interface AnnouncementMutableFields {
  titulo: string;
  contenido: string;
  tipo: TipoAnnouncement;
  es_urgente: boolean;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  fijado: boolean;
  imagen_url: string | null;
}

const MUTABLE_FIELDS: ReadonlyArray<keyof AnnouncementMutableFields> = [
  "titulo",
  "contenido",
  "tipo",
  "es_urgente",
  "fecha_inicio",
  "fecha_fin",
  "fijado",
  "imagen_url",
];

export function diffForAudit(
  prev: AnnouncementMutableFields,
  next: AnnouncementMutableFields
): AuditChange[] {
  const changes: AuditChange[] = [];
  for (const field of MUTABLE_FIELDS) {
    if (prev[field] !== next[field]) {
      changes.push({ field, old_value: prev[field], new_value: next[field] });
    }
  }
  return changes;
}

// ─── 3. shouldFireWebhook ────────────────────────────────────────────────────

export function shouldFireWebhook(
  prevEsUrgente: boolean | null,
  nextEsUrgente: boolean,
  isCreate: boolean
): boolean {
  if (isCreate) return nextEsUrgente;
  return prevEsUrgente === false && nextEsUrgente === true;
}

// ─── 4. parseAudienciasDSL ───────────────────────────────────────────────────

export interface DSLParseResult {
  rules: AudienceRule[];
  errors: { token: string; message: string }[];
}

export function parseAudienciasDSL(
  input: string,
  lineNumber?: number
): DSLParseResult {
  const linePrefix =
    lineNumber !== undefined ? ` (línea ${lineNumber})` : "";

  if (input.trim() === "") {
    return {
      rules: [],
      errors: [
        { token: "", message: `audiencias requerida${linePrefix}` },
      ],
    };
  }

  const rules: AudienceRule[] = [];
  const errors: { token: string; message: string }[] = [];

  const segments = input.split(";").map((s) => s.trim()).filter((s) => s !== "");

  for (const segment of segments) {
    const colonParts = segment.split(":");
    if (colonParts.length !== 2) {
      errors.push({
        token: segment,
        message: `Regla inválida: "${segment}" debe tener exactamente un ":" (roles:programas)${linePrefix}`,
      });
      continue;
    }

    const rawRoles = colonParts[0].trim();
    const rawPrograms = colonParts[1].trim();

    // Parse roles side
    const parsedRoles: AnnouncementRole[] = [];
    let ruleHasError = false;

    if (rawRoles !== "*") {
      const roleTokens = rawRoles.split(",").map((r) => r.trim());
      for (const token of roleTokens) {
        if (token === "") continue;
        if ((ANNOUNCEMENT_ROLES as readonly string[]).includes(token)) {
          parsedRoles.push(token as AnnouncementRole);
        } else {
          errors.push({
            token,
            message: `Rol desconocido: "${token}"${linePrefix}`,
          });
          ruleHasError = true;
        }
      }
    }

    // Parse programs side
    const parsedPrograms: AnnouncementProgram[] = [];

    if (rawPrograms !== "*") {
      const programTokens = rawPrograms.split(",").map((p) => p.trim());
      for (const token of programTokens) {
        if (token === "") continue;
        if ((ANNOUNCEMENT_PROGRAMS as readonly string[]).includes(token)) {
          parsedPrograms.push(token as AnnouncementProgram);
        } else {
          errors.push({
            token,
            message: `Programa desconocido: "${token}"${linePrefix}`,
          });
          ruleHasError = true;
        }
      }
    }

    // Both sides empty after stripping * counts as a bare ":" error
    if (rawRoles === "" && rawPrograms === "") {
      errors.push({
        token: segment,
        message: `Regla vacía: "${segment}"${linePrefix}`,
      });
      continue;
    }

    if (!ruleHasError) {
      rules.push({ roles: parsedRoles, programs: parsedPrograms });
    }
  }

  return { rules, errors };
}

// ─── 5. validateBulkRow ──────────────────────────────────────────────────────

export interface BulkRowInput {
  titulo?: string;
  contenido?: string;
  tipo?: string;
  es_urgente?: string;
  fecha_inicio?: string;
  fecha_fin?: string;
  fijado?: string;
  audiencias?: string;
}

export interface BulkRowError {
  row: number;
  field: string;
  message: string;
}

export interface ParsedBulkRow {
  titulo: string;
  contenido: string;
  tipo: TipoAnnouncement;
  es_urgente: boolean;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  fijado: boolean;
  audiencias: AudienceRule[];
}

function coerceBool(
  raw: string | undefined,
  field: string,
  row: number
): { value: boolean; error: BulkRowError | null } {
  if (raw === undefined || raw === "") {
    return { value: false, error: null };
  }
  const normalized = raw.trim().toLowerCase();
  if (
    normalized === "true" ||
    normalized === "1" ||
    normalized === "sí" ||
    normalized === "si"
  ) {
    return { value: true, error: null };
  }
  if (
    normalized === "false" ||
    normalized === "0" ||
    normalized === "no" ||
    normalized === ""
  ) {
    return { value: false, error: null };
  }
  return {
    value: false,
    error: {
      row,
      field,
      message: `Valor inválido para ${field}: "${raw}". Use true/false/1/0/sí/si/no.`,
    },
  };
}

export function validateBulkRow(
  row: BulkRowInput,
  lineNumber: number
): { ok: boolean; errors: BulkRowError[]; parsed?: ParsedBulkRow } {
  const errors: BulkRowError[] = [];

  // titulo
  const tituloRaw = (row.titulo ?? "").trim();
  if (tituloRaw.length === 0) {
    errors.push({ row: lineNumber, field: "titulo", message: "titulo es requerido." });
  } else if (tituloRaw.length > 200) {
    errors.push({ row: lineNumber, field: "titulo", message: "titulo excede 200 caracteres." });
  }

  // contenido
  const contenidoRaw = (row.contenido ?? "").trim();
  if (contenidoRaw.length === 0) {
    errors.push({ row: lineNumber, field: "contenido", message: "contenido es requerido." });
  } else if (contenidoRaw.length > 5000) {
    errors.push({ row: lineNumber, field: "contenido", message: "contenido excede 5000 caracteres." });
  }

  // tipo
  const tipoRaw = (row.tipo ?? "").trim();
  let parsedTipo: TipoAnnouncement | null = null;
  if (tipoRaw.length === 0) {
    errors.push({ row: lineNumber, field: "tipo", message: "tipo es requerido." });
  } else if (isLegacyTipo(tipoRaw)) {
    errors.push({
      row: lineNumber,
      field: "tipo",
      message: `Valor de tipo "${tipoRaw}" no permitido: es un valor legacy. Use uno de: ${ANNOUNCEMENT_TYPES.join(", ")}.`,
    });
  } else if (!isCurrentTipo(tipoRaw)) {
    errors.push({
      row: lineNumber,
      field: "tipo",
      message: `Valor de tipo "${tipoRaw}" no válido. Use uno de: ${ANNOUNCEMENT_TYPES.join(", ")}.`,
    });
  } else {
    parsedTipo = tipoRaw;
  }

  // es_urgente
  const urgResult = coerceBool(row.es_urgente, "es_urgente", lineNumber);
  if (urgResult.error) errors.push(urgResult.error);

  // fijado
  const fijadoResult = coerceBool(row.fijado, "fijado", lineNumber);
  if (fijadoResult.error) errors.push(fijadoResult.error);

  // fecha_inicio
  let parsedFechaInicio: string | null = null;
  if (row.fecha_inicio !== undefined && row.fecha_inicio !== "") {
    const ts = Date.parse(row.fecha_inicio);
    if (isNaN(ts)) {
      errors.push({
        row: lineNumber,
        field: "fecha_inicio",
        message: `fecha_inicio "${row.fecha_inicio}" no es una fecha ISO 8601 válida.`,
      });
    } else {
      parsedFechaInicio = row.fecha_inicio;
    }
  }

  // fecha_fin
  let parsedFechaFin: string | null = null;
  if (row.fecha_fin !== undefined && row.fecha_fin !== "") {
    const ts = Date.parse(row.fecha_fin);
    if (isNaN(ts)) {
      errors.push({
        row: lineNumber,
        field: "fecha_fin",
        message: `fecha_fin "${row.fecha_fin}" no es una fecha ISO 8601 válida.`,
      });
    } else {
      parsedFechaFin = row.fecha_fin;
    }
  }

  // fecha_fin must be after fecha_inicio
  if (
    parsedFechaInicio !== null &&
    parsedFechaFin !== null &&
    Date.parse(parsedFechaFin) <= Date.parse(parsedFechaInicio)
  ) {
    errors.push({
      row: lineNumber,
      field: "fecha_fin",
      message: "fecha_fin debe ser posterior a fecha_inicio.",
    });
    parsedFechaFin = null; // invalidate
  }

  // audiencias
  let parsedAudiencias: AudienceRule[] = [];
  const dslResult = parseAudienciasDSL(row.audiencias ?? "", lineNumber);
  if (dslResult.errors.length > 0) {
    for (const dslError of dslResult.errors) {
      errors.push({
        row: lineNumber,
        field: "audiencias",
        message: dslError.message,
      });
    }
  }
  if (dslResult.rules.length === 0 && dslResult.errors.length === 0) {
    errors.push({
      row: lineNumber,
      field: "audiencias",
      message: "audiencias debe tener al menos una regla válida.",
    });
  }
  parsedAudiencias = dslResult.rules;

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    errors: [],
    parsed: {
      titulo: tituloRaw,
      contenido: contenidoRaw,
      tipo: parsedTipo!,
      es_urgente: urgResult.value,
      fecha_inicio: parsedFechaInicio,
      fecha_fin: parsedFechaFin,
      fijado: fijadoResult.value,
      audiencias: parsedAudiencias,
    },
  };
}

// Re-export types used by callers so they only need one import
export type {
  TipoAnnouncement,
  AnnouncementRole,
  AnnouncementProgram,
  AudienceRule,
};
export {
  ANNOUNCEMENT_TYPES,
  LEGACY_ANNOUNCEMENT_TYPES,
  ANNOUNCEMENT_ROLES,
  ANNOUNCEMENT_PROGRAMS,
  isCurrentTipo,
  isLegacyTipo,
};
