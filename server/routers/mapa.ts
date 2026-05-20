/**
 * Mapa router — Stage S2 thin vertical slice (Karpathy step 2 of the
 * parallel-implementation plan).
 *
 * INTENTIONALLY MINIMAL. The full router (Stage S3 server-mapa Feature
 * Agent) will:
 *   • aggregate families + persons by distrito using M1+M2 columns
 *   • enforce k-anonymity floor 3 (rows with <3 active families return null)
 *   • support layer toggle (densidad | compliance) via input.layer
 *   • reuse getComplianceStats from families/compliance.ts
 *   • redact via redactHighRiskFields (none should surface here, but
 *     defense in depth)
 *
 * This thin slice exists to PROVE THE TOOLCHAIN: tRPC v11 wiring, Zod
 * input validation, TanStack Query consumption, lazy chunking, Vite
 * bundle, ESLint 300-LOC rule, all working end-to-end with the
 * post-M1/M2/M3 schema in place. Once this slice merges, 4 server +
 * 5 client Feature Agents can fan out without each re-discovering
 * toolchain bugs.
 */

import { z } from "zod";

import type { DistritoSlug } from "../../shared/madrid/distritos";
import { DISTRITO_SLUGS } from "../../shared/madrid/distritos";
import { protectedProcedure, router } from "../_core/trpc";

/**
 * Layer toggle — Stage S3 server-mapa expands this to drive aggregation
 * strategy. In the thin slice we accept either value but ignore it.
 */
const layerSchema = z.enum(["densidad", "compliance"]).default("densidad");

/**
 * Output shape per distrito. `count` is null when k-anonymity floor (<3
 * active families) suppresses the real number. The thin-slice stub returns
 * deterministic hardcoded data; S3 replaces with real Supabase aggregation.
 */
export const distritoStatRowSchema = z.object({
  distrito: z.enum(DISTRITO_SLUGS),
  count: z.number().int().nullable(),
  compliance: z.number().min(0).max(1).optional(),
});

export type DistritoStatRow = z.infer<typeof distritoStatRowSchema>;

const distritoStatsOutputSchema = z.object({
  rows: z.array(distritoStatRowSchema),
  layer: layerSchema,
  // K-anonymity floor used (read by the client to render the "<N familias"
  // tooltip on suppressed cells).
  kAnonymityFloor: z.number().int().positive(),
});

export const mapaRouter = router({
  /**
   * Stub procedure — returns a deterministic 3-distrito sample. S3 replaces
   * with real aggregation that hits the families + persons distrito columns
   * (from M1 + M2).
   */
  distritoStats: protectedProcedure
    .input(
      z.object({
        layer: layerSchema.optional(),
      }).optional(),
    )
    .output(distritoStatsOutputSchema)
    .query(({ input }) => {
      const layer = input?.layer ?? "densidad";

      // Hardcoded 3-distrito sample. The first two are real counts, the
      // third is k-anon-suppressed (null) to exercise the tooltip path.
      const sampleRows: DistritoStatRow[] = [
        { distrito: "centro" satisfies DistritoSlug, count: 12, compliance: 0.83 },
        { distrito: "carabanchel" satisfies DistritoSlug, count: 7, compliance: 0.71 },
        { distrito: "vicalvaro" satisfies DistritoSlug, count: null }, // <3, suppressed
      ];

      return {
        rows: sampleRows,
        layer,
        kAnonymityFloor: 3,
      };
    }),
});

export type MapaRouter = typeof mapaRouter;
