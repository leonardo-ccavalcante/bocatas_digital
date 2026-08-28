/**
 * useStaffUsers.ts — Hook for fetching staff users list (D-C13).
 * useRevokeStaffAccess — Mutation for revoking staff access (D-C14).
 * useCreateStaffUser — Mutation for inviting new staff user.
 *
 * All hooks use tRPC admin procedures (superadmin-only).
 */
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

/**
 * D-C13: Returns staff users list (admin, voluntario, superadmin).
 * Only accessible to superadmin role.
 */
export function useStaffUsers() {
  const { data, isLoading, error, refetch } = trpc.admin.getStaffUsers.useQuery(undefined, {
    staleTime: 2 * 60 * 1000, // 2 minutes
    retry: false, // Don't retry on 403
  });

  return {
    staffUsers: data ?? [],
    isLoading,
    error,
    refetch,
  };
}

/**
 * D-C14: Mutation to revoke staff access (set app_metadata.role = null).
 */
export function useRevokeStaffAccess() {
  const utils = trpc.useUtils();

  return trpc.admin.revokeStaffAccess.useMutation({
    onSuccess: (_, variables) => {
      toast.success("Acceso revocado correctamente");
      utils.admin.getStaffUsers.invalidate();
    },
    onError: (error) => {
      toast.error(error.message ?? "Error al revocar acceso");
    },
  });
}

/**
 * Mutation to change an existing staff user's role (server: admin.setUserRole).
 *
 * The procedure existed since T7-E1 but had no client caller, so role changes
 * could only be made from the Supabase dashboard and superadmin could not be
 * granted from the app at all. Wired up alongside #144, which is what makes the
 * new role take effect on the user's next request.
 */
export function useSetUserRole() {
  const utils = trpc.useUtils();

  return trpc.admin.setUserRole.useMutation({
    onSuccess: () => {
      toast.success("Rol actualizado. Se aplicará en su próxima petición.");
      utils.admin.getStaffUsers.invalidate();
    },
    onError: (error) => {
      toast.error(error.message ?? "Error al cambiar el rol");
    },
  });
}

/**
 * Mutation to create/invite a new staff user.
 */
export function useCreateStaffUser() {
  const utils = trpc.useUtils();

  return trpc.admin.createStaffUser.useMutation({
    onSuccess: (data) => {
      toast.success(`Invitación enviada a ${data.email}`);
      utils.admin.getStaffUsers.invalidate();
    },
    onError: (error) => {
      // Don't show toast here — let the form handle the error display
    },
  });
}
