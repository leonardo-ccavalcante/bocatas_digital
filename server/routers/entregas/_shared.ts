import { z } from "zod";

// Permissive UUID validator — matches the pattern used across all other routers.
export const uuidLike = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "Invalid UUID format");

/**
 * Type definitions for the canonical `deliveries` table.
 */
export interface Entrega {
  id: string;
  family_id: string;
  grant_id: string | null;
  session_id: string | null;
  fecha_entrega: string;
  kg_frutas_hortalizas: number | null;
  kg_carne: number | null;
  kg_infantil: number | null;
  kg_otros: number | null;
  kg_total: number | null;
  unidades_no_alimenticias: number | null;
  recogido_por: string | null;
  es_autorizado: boolean | null;
  firma_url: string | null;
  recogido_por_documento_url: string | null;
  registrado_por: string | null;
  notas: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
