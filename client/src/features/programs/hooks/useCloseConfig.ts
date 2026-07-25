/**
 * useCloseConfig.ts — TanStack Query hooks for session close configuration.
 *
 * Exposes:
 *  - useCloseConfig: reads the close config for a program (getCloseConfig)
 *  - useUpdateCloseConfig: persists a new SessionCloseConfig
 *  - useApplyPreset: resets to the canonical preset for the program tipo
 */
import { trpc } from "@/lib/trpc";
import type { SessionCloseConfig } from "@shared/sessionSchemas";
import type { TipoPrograma } from "@shared/programEstados";
import { toast } from "sonner";

export function useCloseConfig(programId: string) {
  return trpc.programs.closeConfig.getCloseConfig.useQuery(
    { programId },
    { enabled: !!programId, staleTime: 60_000 }
  );
}

export function useUpdateCloseConfig(programId: string) {
  const utils = trpc.useUtils();
  return trpc.programs.closeConfig.updateCloseConfig.useMutation({
    onSuccess: () => {
      toast.success("Configuración guardada");
      void utils.programs.closeConfig.getCloseConfig.invalidate({ programId });
    },
    onError: (err) => {
      toast.error("Error al guardar configuración", { description: err.message });
    },
  });
}

export function useApplyPreset(programId: string) {
  const utils = trpc.useUtils();
  return trpc.programs.closeConfig.applyPreset.useMutation({
    onSuccess: (res) => {
      const configResult = res as { config?: SessionCloseConfig };
      const fieldCount = configResult.config?.fields?.length ?? 0;
      toast.success(`Preset aplicado (${fieldCount} campos)`);
      void utils.programs.closeConfig.getCloseConfig.invalidate({ programId });
    },
    onError: (err) => {
      toast.error("Error al aplicar preset", { description: err.message });
    },
  });
}

/** Derived helper: returns a function to apply a preset for a given tipo. */
export function useApplyPresetFn(programId: string) {
  const mutation = useApplyPreset(programId);
  return (tipo: TipoPrograma) => mutation.mutate({ programId, tipo });
}
