import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import type { EnrollmentEstado } from "../schemas";

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
 * Changes an enrollment's estado within the program's enabled set.
 * Opening BajaDialog first is the caller's responsibility when targeting 'baja'.
 */
export function useUpdateEnrollmentEstado(programId: string, personId?: string) {
  const utils = trpc.useUtils();

  return trpc.programs.updateEnrollmentEstado.useMutation({
    onSuccess: () => {
      utils.programs.getEnrollments.invalidate({ programId });
      utils.programs.getAllWithCounts.invalidate();
      if (personId) {
        utils.programs.getPersonEnrollments.invalidate({ personId });
      }
      toast.success("Estado actualizado");
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
  options?: {
    estado?: EnrollmentEstado;
    search?: string;
    limit?: number;
    offset?: number;
  }
) {
  const { data, isLoading, error } = trpc.programs.getEnrollments.useQuery(
    {
      programId,
      estado: options?.estado,
      search: options?.search,
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
