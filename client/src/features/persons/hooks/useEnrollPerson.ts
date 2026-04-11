/**
 * useEnrollPerson — tRPC-based program enrollment hook.
 *
 * Previously used the Supabase browser client directly, which failed because
 * Manus OAuth users have no Supabase JWT and RLS denied INSERT on program_enrollments.
 * Now delegates to the tRPC server procedure that uses createAdminClient().
 */
import { useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";

interface EnrollPersonParams {
  personId: string;
  programIds: string[];
}

export function useEnrollPerson() {
  const queryClient = useQueryClient();
  const mutation = trpc.persons.enroll.useMutation({
    onSuccess: (_data, { personId }) => {
      void queryClient.invalidateQueries({ queryKey: ["persons", personId] });
      void queryClient.invalidateQueries({ queryKey: ["enrollments", personId] });
    },
  });

  return {
    mutateAsync: async ({ personId, programIds }: EnrollPersonParams) => {
      return mutation.mutateAsync({ personId, programIds });
    },
    isPending: mutation.isPending,
    error: mutation.error,
  };
}
