import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

/**
 * Enrolls a person in a program.
 * Returns consent warning if person lacks required consents (non-blocking).
 */
export function useEnrollPerson(programId: string) {
  const utils = trpc.useUtils();

  return trpc.programs.enrollPerson.useMutation({
    onSuccess: (result) => {
      // Invalidate enrollment list for this program
      utils.programs.getEnrollments.invalidate({ programId });

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
 * Unenrolls (completes) a person's enrollment.
 */
export function useUnenrollPerson(programId: string) {
  const utils = trpc.useUtils();

  return trpc.programs.unenrollPerson.useMutation({
    onSuccess: () => {
      utils.programs.getEnrollments.invalidate({ programId });
      utils.programs.getAllWithCounts.invalidate();
      toast.success("Inscripción finalizada");
    },
    onError: (error) => {
      toast.error("Error al finalizar inscripción", { description: error.message });
    },
  });
}

/**
 * Returns enrollments for a program with pagination.
 */
export function useEnrollments(
  programId: string,
  options?: { estado?: "activo" | "completado" | "rechazado"; search?: string; limit?: number; offset?: number }
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
