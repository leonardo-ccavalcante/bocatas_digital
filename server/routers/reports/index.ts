/**
 * server/routers/reports/index.ts — Compose all report procedures.
 *
 * Merges the customQuery executor + saved-query CRUD + 10 templated routers
 * into a single `reportsRouter` that is registered as `appRouter.reports`.
 *
 * Adding an 11th report: follow the recipe in CODEMAP.md.
 */

import { mergeRouters } from "../../_core/trpc";
import { customQueryRouter } from "./customQuery/executor";
import { savedQueriesRouter } from "./customQuery/saved";
import { familiasAtendidasRouter } from "./templated/familiasAtendidas";
import { padronPorVencerRouter } from "./templated/padronPorVencer";
import { informesPorRenovarRouter } from "./templated/informesPorRenovar";
import { complianceSnapshotRouter } from "./templated/complianceSnapshot";
import { familiasEnRiesgoRouter } from "./templated/familiasEnRiesgo";
import { documentosFaltantesRouter } from "./templated/documentosFaltantes";
import { resumenTrimestralRouter } from "./templated/resumenTrimestral";
import { distribucionPorDistritoRouter } from "./templated/distribucionPorDistrito";
import { evolucionHistoricaRouter } from "./templated/evolucionHistorica";
import { informeIrpfDemograficoRouter } from "./templated/informeIrpfDemografico";

export const reportsRouter = mergeRouters(
  customQueryRouter,
  savedQueriesRouter,
  familiasAtendidasRouter,
  padronPorVencerRouter,
  informesPorRenovarRouter,
  complianceSnapshotRouter,
  familiasEnRiesgoRouter,
  documentosFaltantesRouter,
  resumenTrimestralRouter,
  distribucionPorDistritoRouter,
  evolucionHistoricaRouter,
  informeIrpfDemograficoRouter,
);

export type ReportsRouter = typeof reportsRouter;
