/**
 * useDerivar — TanStack Query hooks wrapping trpc.derivar procedures.
 *
 * useStartIntervention: pre-fill payload for NuevaIntervencionForm.
 * useAddIntervention: mutation to persist an intervention row.
 *
 * useTipos reads the live trpc.tiposIntervencion.list catalog, falling back to a
 * static list (matching the DB seed in 20260603000002) when the query is empty —
 * so the picker always has options even before the catalog loads.
 */

import { trpc } from "@/lib/trpc";
import type { Scope } from "@shared/derivar/types";

export interface TipoIntervencion {
  slug: string;
  nombre: string;
}

/** Matches the seed in 20260603000002_create_tipos_intervencion.sql */
export const STATIC_TIPOS: TipoIntervencion[] = [
  { slug: "salud", nombre: "Salud" },
  { slug: "apoyo_logistico", nombre: "Apoyo logístico" },
  { slug: "vivienda", nombre: "Vivienda" },
  { slug: "juridico", nombre: "Jurídico" },
  { slug: "empleo", nombre: "Empleo" },
  { slug: "alimentacion", nombre: "Alimentación" },
  { slug: "infancia", nombre: "Infancia" },
  { slug: "salud_mental", nombre: "Salud mental" },
  { slug: "formacion", nombre: "Formación" },
  { slug: "otro", nombre: "Otro" },
];

const TIPO_NOMBRE_MAP = new Map(STATIC_TIPOS.map((t) => [t.slug, t.nombre]));

/** Resolve a tipo_slug to its human-readable nombre. Falls back to the slug itself. */
export function resolveTipoNombre(slug: string): string {
  return TIPO_NOMBRE_MAP.get(slug) ?? slug;
}

export function useStartIntervention(
  scope: Scope,
  entityId: string,
  programaId: string,
  enabled: boolean,
) {
  return trpc.derivar.startIntervention.useQuery(
    { scope, entityId, programaId },
    { enabled },
  );
}

/** Returns tipos de intervención from the catalog, falling back to STATIC_TIPOS. */
export function useTipos(): { data: TipoIntervencion[]; isLoading: boolean } {
  const q = trpc.tiposIntervencion.list.useQuery();
  const data = (q.data ?? []).map((t) => ({ slug: t.slug, nombre: t.nombre }));
  return { data: data.length > 0 ? data : STATIC_TIPOS, isLoading: q.isLoading };
}

export function useAddIntervention() {
  const utils = trpc.useUtils();
  return trpc.derivar.addIntervention.useMutation({
    onSuccess: () => {
      // Refresh the derivar list so a newly added intervention/hoja appears
      // without a manual reload. (CM-7 compliance invalidation is added when
      // that metric ships.)
      void utils.derivar.list.invalidate();
    },
  });
}
