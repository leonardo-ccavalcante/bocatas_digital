import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import type { FiltrosServidor } from "../utils/enrollmentFiltros";

/**
 * Enrolls a person in a program.
 * Returns consent warning if person lacks required consents (non-blocking).
 */
export function useEnrollPerson(programId: string, personId?: string) {
  const utils = trpc.useUtils();

  return trpc.programs.enrollPerson.useMutation({
    onSuccess: (result) => {
      utils.programs.getEnrollments.invalidate({ programId });
      if (personId) {
        utils.programs.getPersonEnrollments.invalidate({ personId });
      }

      if (result.consentWarning) {
        toast.warning("Inscripción realizada con advertencia", {
          description: result.consentWarning,
          duration: 8000,
        });
      } else {
        toast.success("Persona inscrita correctamente");
      }
    },
    onError: (error) => {
      const msg = error.message.includes("ya está inscrita")
        ? "Esta persona ya está inscrita en este programa"
        : error.message;
      toast.error("Error al inscribir", { description: msg });
    },
  });
}

/**
 * Unenrolls a person = baja with mandatory motivo.
 * Call site must open BajaDialog to collect motivo before calling mutate.
 */
export function useUnenrollPerson(programId: string, personId?: string) {
  const utils = trpc.useUtils();

  return trpc.programs.unenrollPerson.useMutation({
    onSuccess: () => {
      utils.programs.getEnrollments.invalidate({ programId });
      utils.programs.getAllWithCounts.invalidate();
      if (personId) {
        utils.programs.getPersonEnrollments.invalidate({ personId });
      }
      toast.success("Baja registrada correctamente");
    },
    onError: (error) => {
      toast.error("Error al registrar la baja", { description: error.message });
    },
  });
}

/**
 * Cambia el estado de UNA o VARIAS inscripciones (el input es una lista).
 * Abrir antes el BajaDialog sigue siendo cosa de quien llama cuando el
 * destino es 'baja'. El lote puede volver a medias: `fallos` no es opcional.
 */
export function useUpdateEnrollmentEstado(programId: string, personId?: string) {
  const utils = trpc.useUtils();

  return trpc.programs.updateEnrollmentEstado.useMutation({
    onSuccess: (result) => {
      utils.programs.getEnrollments.invalidate({ programId });
      utils.programs.getAllWithCounts.invalidate();
      // Un lote toca a N personas: se invalidan TODAS las fichas cacheadas,
      // no sólo la de `personId` (que sigue sirviendo para el panel 1-a-1).
      utils.programs.getPersonEnrollments.invalidate();
      if (personId) {
        utils.programs.getPersonEnrollments.invalidate({ personId });
      }
      // El servidor no revierte un lote a medias: si alguna fila no pasó, hay
      // que decirlo aquí o el aviso «Estado actualizado» miente.
      if (result.fallos.length > 0) {
        toast.warning(
          `${result.ok.length} actualizada${result.ok.length === 1 ? "" : "s"}, ${result.fallos.length} sin cambiar`,
          { description: result.fallos[0].motivo, duration: 8000 }
        );
        return;
      }
      toast.success(
        result.ok.length === 1
          ? "Estado actualizado"
          : `${result.ok.length} estados actualizados`
      );
    },
    onError: (error) => {
      toast.error("Error al cambiar estado", { description: error.message });
    },
  });
}

/**
 * Returns enrollments for a program with pagination.
 * `estado` accepts the full global catalog (including legacy completado/rechazado).
 */
export function useEnrollments(
  programId: string,
  options?: Partial<FiltrosServidor> & { limit?: number; offset?: number }
) {
  const { data, isLoading, error } = trpc.programs.getEnrollments.useQuery(
    {
      programId,
      estado: options?.estado,
      search: options?.search,
      pais_origen: options?.pais_origen,
      genero: options?.genero,
      situacion_laboral: options?.situacion_laboral,
      situacion_ante_empleo: options?.situacion_ante_empleo,
      limit: options?.limit ?? 50,
      offset: options?.offset ?? 0,
    },
    { staleTime: 30 * 1000 }
  );

  return {
    enrollments: data?.enrollments ?? [],
    total: data?.total ?? 0,
    isLoading,
    error,
  };
}
