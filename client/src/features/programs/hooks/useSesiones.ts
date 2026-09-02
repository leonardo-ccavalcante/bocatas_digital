/**
 * useSesiones.ts — TanStack Query hooks for program session calendar (Tela 1).
 *
 * Exposes:
 *  - useListSesiones: list planned sessions for a program (month-filtered)
 *
 * La generación del calendario vive en GenerarCalendarioDialog: pasa por
 * programs.update (horario + ubicación) ANTES de llamar a generarSesiones.
 */
import { trpc } from "@/lib/trpc";

export function useListSesiones(
  programId: string,
  year?: number,
  month?: number
) {
  return trpc.programs.sessions.listSesiones.useQuery(
    { programId, year, month },
    {
      enabled: !!programId,
      staleTime: 30_000,
    }
  );
}
