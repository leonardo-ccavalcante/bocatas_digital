/**
 * hooks/useTemplatedReports.ts — Type-safe per-template hook wrappers.
 *
 * ONE hook per template. Never call all 9 at once.
 * Each hook accepts `enabled` so modals can defer fetching until open.
 *
 * Compliance: these hooks do NOT add CSV export — that happens in the modal.
 */

import { trpc } from "@/lib/trpc";

// ── Familias atendidas ──────────────────────────────────────────────────────

export function useFamiliasAtendidas(
  input: { from: string; to: string },
  enabled: boolean,
) {
  return trpc.reports.familiasAtendidas.useQuery(input, { enabled });
}

// ── Padrón por vencer ────────────────────────────────────────────────────────

export function usePadronPorVencer(
  input: { daysAhead: number },
  enabled: boolean,
) {
  return trpc.reports.padronPorVencer.useQuery(input, { enabled });
}

// ── Informes por renovar ──────────────────────────────────────────────────────

export function useInformesPorRenovar(
  input: { daysAhead: number },
  enabled: boolean,
) {
  return trpc.reports.informesPorRenovar.useQuery(input, { enabled });
}

// ── Compliance snapshot ───────────────────────────────────────────────────────

export function useComplianceSnapshot(enabled: boolean) {
  return trpc.reports.complianceSnapshot.useQuery(undefined, { enabled });
}

// ── Familias en riesgo ────────────────────────────────────────────────────────

export function useFamiliasEnRiesgo(
  input: { estado?: "activa" | "all" },
  enabled: boolean,
) {
  return trpc.reports.familiasEnRiesgo.useQuery(input, { enabled });
}

// ── Documentos faltantes ──────────────────────────────────────────────────────

export function useDocumentosFaltantes(
  input: { programaId: string },
  enabled: boolean,
) {
  return trpc.reports.documentosFaltantes.useQuery(input, { enabled });
}

// ── Resumen trimestral ────────────────────────────────────────────────────────

export function useResumenTrimestral(
  input: { year: number; quarter: 1 | 2 | 3 | 4 },
  enabled: boolean,
) {
  return trpc.reports.resumenTrimestral.useQuery(input, { enabled });
}

// ── Distribución por distrito ─────────────────────────────────────────────────

export function useDistribucionPorDistrito(
  input: { estado?: "activa" | "all" },
  enabled: boolean,
) {
  return trpc.reports.distribucionPorDistrito.useQuery(input, { enabled });
}

// ── Evolución histórica ───────────────────────────────────────────────────────

export function useEvolucionHistorica(
  input: { months?: number },
  enabled: boolean,
) {
  return trpc.reports.evolucionHistorica.useQuery(input, { enabled });
}
