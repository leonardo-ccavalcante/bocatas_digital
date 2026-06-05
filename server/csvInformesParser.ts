// Parser for the INFORMES SOCIALES (wide) sheet — 1 row per family, with the
// social-report narrative + denormalized member slots 2..14. Un-pivots each row
// into an InformesFamily (titular + members[] + narrative), reusing the Phase-1
// value coercers and the whole-document quote-aware parser. Pure — no DB. The
// router resolves family_id/titular_id against the roster afterwards.

import {
  parseCSVDocument,
  normalizeHeader,
  repairMojibake,
} from "./csvLegacyFamiliasParser";
import {
  parseDate,
  parseCountry,
  parseDocumento,
  parseParentesco,
  parseCodigoPostal,
} from "./csvLegacyFamiliasMapper";
import type {
  InformesFamily,
  InformesMember,
  InformesTitular,
  RowWarning,
  RowError,
} from "../shared/legacyFamiliasTypes";

const MAX_SLOT = 14;

export interface InformesColumnMap {
  numero_familia: number;
  nombre: number;
  apellidos: number;
  telefono: number;
  documento: number;
  pais: number;
  fecha_nacimiento: number;
  direccion: number;
  codigo_postal: number;
  localidad: number;
  situacion_familiar: number;
  necesidades: number;
  memberSlots: Array<{
    slot: number;
    nombre: number;
    apellido: number;
    fecha: number;
    parentesco: number;
    documento: number;
  }>;
}

// Resolve the wide header by NAME. Titular scalars are matched directly; member
// slots are found by grouping every header that ends in a slot number (≥2) and
// classifying each by its prefix — robust to the sheet's typos ("NACIEMIENTO")
// and trailing spaces ("NOMBRE 11 ").
export function resolveInformesColumns(
  header: ReadonlyArray<string>
): InformesColumnMap {
  const norm = header.map((h, i) => ({ i, n: normalizeHeader(h) }));
  const find = (pred: (n: string) => boolean): number => {
    const m = norm.find((x) => x.n && pred(x.n));
    return m ? m.i : -1;
  };
  const hasTrailingNum = (n: string) => /\s\d+$/.test(n);

  const cmap: InformesColumnMap = {
    numero_familia: find((n) => n.startsWith("numero familia")),
    nombre: find((n) => n === "nombre"),
    apellidos: find((n) => n === "apellidos"),
    telefono: find((n) => n === "telefono"),
    documento: find((n) => n.startsWith("dni") && !hasTrailingNum(n)),
    pais: find((n) => n === "pais"),
    fecha_nacimiento: find(
      (n) => n.startsWith("fecha") && n.includes("nac") && !hasTrailingNum(n)
    ),
    direccion: find((n) => n === "direccion"),
    codigo_postal: find((n) => n.startsWith("codigo postal")),
    localidad: find((n) => n === "localidad"),
    situacion_familiar: find((n) => n.includes("situacion familiar")),
    necesidades: find((n) => n.includes("necesidades")),
    memberSlots: [],
  };

  const slots = new Map<
    number,
    { nombre: number; apellido: number; fecha: number; parentesco: number; documento: number }
  >();
  for (const { i, n } of norm) {
    const m = n.match(/\s(\d+)$/);
    if (!m) continue;
    const slot = Number(m[1]);
    if (slot < 2 || slot > MAX_SLOT) continue;
    const base = n.slice(0, n.length - m[0].length).trim();
    const e =
      slots.get(slot) ??
      { nombre: -1, apellido: -1, fecha: -1, parentesco: -1, documento: -1 };
    if (base === "nombre") e.nombre = i;
    else if (base.startsWith("apellido")) e.apellido = i;
    else if (base.startsWith("fecha")) e.fecha = i;
    else if (base.startsWith("parentesco")) e.parentesco = i;
    else if (base.startsWith("dni") || base.includes("pasaporte") || base.startsWith("documento"))
      e.documento = i;
    slots.set(slot, e);
  }
  cmap.memberSlots = [...slots.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([slot, e]) => ({ slot, ...e }));
  return cmap;
}

function cell(rec: ReadonlyArray<string>, idx: number): string {
  if (idx < 0 || idx >= rec.length) return "";
  return repairMojibake(rec[idx] ?? "").trim();
}

function buildTitular(rec: ReadonlyArray<string>, c: InformesColumnMap): InformesTitular {
  const warnings: RowWarning[] = [];
  const dob = parseDate(cell(rec, c.fecha_nacimiento));
  if (dob.warning) warnings.push(dob.warning);
  const pais = parseCountry(cell(rec, c.pais));
  if (pais.warning) warnings.push(pais.warning);
  const doc = parseDocumento(cell(rec, c.documento));
  if (doc.warning) warnings.push(doc.warning);
  const cp = parseCodigoPostal(cell(rec, c.codigo_postal));
  if (cp.warning) warnings.push(cp.warning);
  return {
    nombre: cell(rec, c.nombre) || null,
    apellidos: cell(rec, c.apellidos) || null,
    fecha_nacimiento: dob.value,
    pais_origen: pais.value,
    telefono: cell(rec, c.telefono) || null,
    direccion: cell(rec, c.direccion) || null,
    municipio: cell(rec, c.localidad) || null,
    codigo_postal: cp.value,
    tipo_documento: doc.tipo_documento,
    numero_documento: doc.numero_documento,
    warnings,
  };
}

function buildMember(
  rec: ReadonlyArray<string>,
  slot: InformesColumnMap["memberSlots"][number]
): InformesMember | null {
  const nombre = cell(rec, slot.nombre);
  // A slot with no name is empty (or garbage) → not a member.
  if (!nombre) return null;
  const warnings: RowWarning[] = [];
  const dob = parseDate(cell(rec, slot.fecha));
  if (dob.warning) warnings.push(dob.warning);
  const doc = parseDocumento(cell(rec, slot.documento));
  if (doc.warning) warnings.push(doc.warning);
  const parRaw = cell(rec, slot.parentesco);
  const par = parseParentesco(parRaw);
  if (par.warning) warnings.push(par.warning);
  return {
    slot: slot.slot,
    nombre,
    apellidos: cell(rec, slot.apellido) || null,
    fecha_nacimiento: dob.value,
    relacion_db: par.relacion,
    parentesco_original: parRaw || null,
    tipo_documento: doc.tipo_documento,
    numero_documento: doc.numero_documento,
    warnings,
  };
}

export interface ParsedInformes {
  families: InformesFamily[];
  parse_errors: RowError[];
  header_found: boolean;
}

// Parse the whole INFORMES document into raw InformesFamily records (family_id /
// titular_id left null — resolved against the roster by the router).
export function parseInformesDocument(text: string): ParsedInformes {
  const records = parseCSVDocument(text);
  let headerIdx = -1;
  let cmap: InformesColumnMap | null = null;
  for (let i = 0; i < Math.min(records.length, 10); i++) {
    const c = resolveInformesColumns(records[i]);
    if (c.numero_familia >= 0 && c.nombre >= 0 && c.situacion_familiar >= 0) {
      headerIdx = i;
      cmap = c;
      break;
    }
  }
  if (headerIdx === -1 || !cmap) {
    return { families: [], parse_errors: [], header_found: false };
  }

  const families: InformesFamily[] = [];
  const parse_errors: RowError[] = [];
  const data = records.slice(headerIdx + 1);
  for (let r = 0; r < data.length; r++) {
    const rec = data[r];
    if (rec.every((x) => x.trim() === "")) continue;
    const legacy = cell(rec, cmap.numero_familia);
    if (!legacy) continue; // blank-numero rows (pivot/stat) — drop, not an error

    const titular = buildTitular(rec, cmap);
    const members: InformesMember[] = [];
    let lastSlotFilled = 0;
    for (const slot of cmap.memberSlots) {
      const m = buildMember(rec, slot);
      if (m) {
        members.push(m);
        lastSlotFilled = slot.slot;
      }
    }
    // Family warnings = titular warnings + every member's warnings, so a
    // consumer of family.warnings sees the full picture (not just the titular).
    const warnings: RowWarning[] = [
      ...titular.warnings,
      ...members.flatMap((m) => m.warnings),
    ];
    families.push({
      legacy_numero_familia: legacy,
      titular,
      members,
      situacion_familiar_texto: cell(rec, cmap.situacion_familiar) || null,
      necesidades_texto: cell(rec, cmap.necesidades) || null,
      family_id: null,
      titular_id: null,
      member_matches: [], // resolved against the roster in the router (2b)
      // The sheet has only 14 member slots; a filled last slot means the family
      // MAY have additional (truncated) members → flag for manual verification.
      members_truncated: lastSlotFilled >= MAX_SLOT,
      warnings,
    });
  }
  return { families, parse_errors, header_found: true };
}
