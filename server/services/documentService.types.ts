// Shared type definitions for the document-generation service (E1).
//
// This is the single source of truth for the data-context shapes that flow
// into renderDocument().  Both the service (documentService.ts), the context
// builder (documentContextBuilder.ts) and the per-family computation helper
// (notaEntregaComputer.ts) import from here to avoid circular dependencies.

export type DocumentSlug = "informe_social" | "nota_entrega" | "derivacion";

/** Per-member row bound into the nota_entrega template. */
export type MemberDeliveryRow = {
  numero_expediente: string; // families.familia_numero zero-padded
  nombre: string; // titular nombre
  apellidos: string; // titular apellidos
  documento: string; // numero_documento
  telefono: string;
  num_adultos: number;
  num_menores_18: number;
  total_miembros: number;
  kg_frutas_hortalizas: number; // computed: per_member_rate_fyh * total_miembros
  kg_carne: number; // computed: per_member_rate_carne * total_miembros
  kg_infantil: number; // computed: per_member_rate_infantil * num_menores_18
  unidades_no_alimentacion: number; // computed: per_member_rate_unidades * total_miembros
  fecha: string; // delivery round date (ISO)
  // FIRMA left blank — docxtemplater renders empty cell for manual wet-ink signature
};

/** Round-level header data for the nota_entrega batch table. */
export type DeliveryRoundHeader = {
  albaran_entrada: string; // albarán de entrada (from round metadata)
  numero_factura_carne: string; // Nº factura de la carne
  codigo_consumo: string; // consumo code
  mes_fecha: string; // "Mayo 2026"
  total_familias: number;
  total_kg_fyh: number; // sum of per-family fyh
  total_kg_carne: number;
  total_kg_infantil: number;
  total_unidades_no_alimentacion: number;
  // Per-member allocation rates (IRPF/BdeA round-level; sourced from
  // program_sessions.session_data.rates — see E1 plan §H open assumption #1).
  per_member_rate_fyh: number; // kg frutas-hortalizas per person
  per_member_rate_carne: number; // kg carne per person
  per_member_rate_infantil: number; // kg infantil per minor
  per_member_rate_unidades: number; // unidades no-alimentación per person
};

/** Full data context passed to renderDocument for any template. */
export type FamilyDocumentContext = {
  // ── Family header (all templates) ──
  titular: {
    nombre: string;
    apellidos: string;
    documento: string;
    telefono: string;
  };
  familia: {
    numero: string; // zero-padded e.g. "0042"
    num_adultos: number;
    num_menores_18: number;
    total_miembros: number;
    distrito: string | null;
    codigo_postal: string | null;
    estado: string;
  };
  miembros: Array<{
    nombre: string;
    apellidos: string;
    parentesco: string;
    fecha_nacimiento: string | null;
  }>;
  // ── Informe social specific ──
  informe?: {
    fecha_seguimiento: string; // last family_follow_ups.fecha (ISO)
    notas_seguimiento: string; // last 3 follow-ups concatenated
    effective_date: string; // same as fecha_seguimiento for freshness gate
  };
  // ── Nota de entrega specific ──
  round?: {
    header: DeliveryRoundHeader;
    rows: MemberDeliveryRow[];
  };
  // ── Template static blocks (injected from document_templates.static_blocks) ──
  logos: string[];
  static_blocks: Record<string, string>; // e.g. rgpd_clause, footer_text
  // ── Generation metadata ──
  generated_at: string; // ISO datetime string
  generated_by_name: string; // actor display name (no PII in logs — log by ID only)
};
