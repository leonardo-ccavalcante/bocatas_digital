/**
 * useSesiones.ts — TanStack Query hooks for program session calendar (Tela 1).
 *
 * Exposes:
 *  - useListSesiones: list planned sessions for a program (month-filtered)
 *  - useGenerarSesiones: materialise sessions from config.programacion
 */
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

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

/** Generates sessions from the program's config.programacion schedule.
 * Pass invalidate to refresh the list after generation. */
export function useGenerarSesionesMutation(programId: string) {
  const utils = trpc.useUtils();
  return trpc.programs.sessions.generarSesiones.useMutation({
    onSuccess: (result) => {
      toast.success(
        `Calendario generado: ${result.created} sesiones nuevas, ${result.skipped} ya existían.`
      );
      void utils.programs.sessions.listSesiones.invalidate({ programId });
    },
    onError: (err) => {
      toast.error("Error al generar sesiones", { description: err.message });
    },
  });
}
