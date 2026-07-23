/**
 * useSesionMutations.ts — tRPC mutation hooks for session lifecycle actions.
 *
 * Exposes one hook per action: abrir, cerrar, cancelar, reprogramar.
 * All hooks invalidate programs.sessions.listSesiones on success.
 */
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

function useInvalidateSesiones(programId: string) {
  const utils = trpc.useUtils();
  return () => {
    void utils.programs.sessions.listSesiones.invalidate({ programId });
  };
}

export function useAbrirSesion(programId: string) {
  const invalidate = useInvalidateSesiones(programId);
  return trpc.programs.sessions.abrirSesion.useMutation({
    onSuccess: () => {
      toast.success("Sesión abierta");
      invalidate();
    },
    onError: (err) => {
      toast.error("Error al abrir sesión", { description: err.message });
    },
  });
}

export function useCerrarSesion(programId: string) {
  const invalidate = useInvalidateSesiones(programId);
  return trpc.programs.sessions.cerrarSesion.useMutation({
    onSuccess: () => {
      toast.success("Sesión cerrada");
      invalidate();
    },
    onError: (err) => {
      toast.error("Error al cerrar sesión", { description: err.message });
    },
  });
}

export function useCancelarSesion(programId: string) {
  const invalidate = useInvalidateSesiones(programId);
  return trpc.programs.sessions.cancelarSesion.useMutation({
    onSuccess: () => {
      toast.success("Sesión cancelada");
      invalidate();
    },
    onError: (err) => {
      toast.error("Error al cancelar sesión", { description: err.message });
    },
  });
}

export function useReprogramarSesion(programId: string) {
  const invalidate = useInvalidateSesiones(programId);
  return trpc.programs.sessions.reprogramarSesion.useMutation({
    onSuccess: () => {
      toast.success("Sesión reprogramada");
      invalidate();
    },
    onError: (err) => {
      toast.error("Error al reprogramar sesión", { description: err.message });
    },
  });
}

export function useMarcarAsistenciaSesion(programId: string) {
  const invalidate = useInvalidateSesiones(programId);
  return trpc.programs.enlace.marcarAsistenciaSesion.useMutation({
    onSuccess: () => {
      toast.success("Asistencia registrada");
      invalidate();
    },
  });
}

export function useGenerarEnlace(programId: string) {
  const invalidate = useInvalidateSesiones(programId);
  return trpc.programs.enlace.generarEnlace.useMutation({
    onSuccess: () => {
      invalidate();
    },
    onError: (err) => {
      toast.error("Error al generar enlace", { description: err.message });
    },
  });
}

export function useRevogarEnlace(programId: string) {
  const invalidate = useInvalidateSesiones(programId);
  return trpc.programs.enlace.revogarEnlace.useMutation({
    onSuccess: () => {
      toast.success("Enlace revocado");
      invalidate();
    },
    onError: (err) => {
      toast.error("Error al revocar enlace", { description: err.message });
    },
  });
}
