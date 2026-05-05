import {
  type TipoAnnouncement,
  type AudienceRule,
  ANNOUNCEMENT_TYPES,
  isCurrentTipo,
  isLegacyTipo,
} from "../../../shared/announcementTypes";
import { parseAudienciasDSL } from "./dsl";

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

  const tituloRaw = (row.titulo ?? "").trim();
  if (tituloRaw.length === 0) {
    errors.push({ row: lineNumber, field: "titulo", message: "titulo es requerido." });
  } else if (tituloRaw.length > 200) {
    errors.push({ row: lineNumber, field: "titulo", message: "titulo excede 200 caracteres." });
  }

  const contenidoRaw = (row.contenido ?? "").trim();
  if (contenidoRaw.length === 0) {
    errors.push({ row: lineNumber, field: "contenido", message: "contenido es requerido." });
  } else if (contenidoRaw.length > 5000) {
    errors.push({ row: lineNumber, field: "contenido", message: "contenido excede 5000 caracteres." });
  }

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

  const urgResult = coerceBool(row.es_urgente, "es_urgente", lineNumber);
  if (urgResult.error) errors.push(urgResult.error);

  const fijadoResult = coerceBool(row.fijado, "fijado", lineNumber);
  if (fijadoResult.error) errors.push(fijadoResult.error);

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
    parsedFechaFin = null;
  }

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
