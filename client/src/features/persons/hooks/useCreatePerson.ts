/**
 * useCreatePerson — tRPC-based person creation hook.
 *
 * Previously used the Supabase browser client directly, which failed because
 * Manus OAuth users have no Supabase JWT and RLS denied INSERT.
 * Now delegates to the tRPC server procedure that uses createAdminClient().
 */
import { useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";
import type { PersonCreate } from "../schemas";

export function useCreatePerson() {
  const queryClient = useQueryClient();
  const mutation = trpc.persons.create.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["persons"] });
    },
  });

  return {
    mutateAsync: async ({ data }: { data: PersonCreate }) => {
      return mutation.mutateAsync(data);
    },
    isPending: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
  };
}
