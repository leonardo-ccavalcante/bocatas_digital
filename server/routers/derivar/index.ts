/**
 * derivar/index.ts — merged derivar router
 *
 * Composes hojasRouter + intervencionesRouter + intervencionesUploadsRouter +
 * pdfGenRouter into a single flat tRPC router surface. Wire this into the root
 * router via:
 *
 *   import { derivarRouter } from "./routers/derivar";
 *   // appRouter = router({ ..., derivar: derivarRouter })
 */

import { mergeRouters } from "../../_core/trpc";

import { hojasRouter } from "./hojas";
import { intervencionesRouter } from "./intervenciones";
import { intervencionesUploadsRouter } from "./intervenciones-uploads";
import { pdfGenRouter } from "./pdfGen";

export const derivarRouter = mergeRouters(
  hojasRouter,
  intervencionesRouter,
  intervencionesUploadsRouter,
  pdfGenRouter,
);
