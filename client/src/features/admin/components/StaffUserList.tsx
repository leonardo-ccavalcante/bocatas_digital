/**
 * StaffUserList.tsx — D-D8: List of staff users with email, nombre, role badge, revoke button.
 * Job 6, AC2: shows email, nombre, role badge, created_at, "Revocar acceso" action.
 *
 * Role changing was wired up alongside #144: `admin.setUserRole` had existed
 * since T7-E1 but no client ever called it, so roles could only be moved from
 * the Supabase dashboard and `superadmin` could not be granted from the app at
 * all. That mattered because the invite flow cannot create a superadmin either,
 * so a lost superadmin had no in-app recovery.
 */
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/_core/hooks/useAuth";
import { useStaffUsers, useRevokeStaffAccess, useSetUserRole } from "../hooks/useStaffUsers";
import { ROLE_LABELS, ROLE_COLORS, AssignableRoleSchema, type AssignableRole } from "../schemas";
import { UserX, CheckCircle } from "lucide-react";

interface RevokeDialogState {
  open: boolean;
  userId: string;
  nombre: string;
}

interface RoleDialogState {
  open: boolean;
  userId: string;
  nombre: string;
  role: AssignableRole | null;
}

const CLOSED_ROLE_DIALOG: RoleDialogState = {
  open: false,
  userId: "",
  nombre: "",
  role: null,
};

export function StaffUserList() {
  const { staffUsers, isLoading, error } = useStaffUsers();
  const { user: currentUser } = useAuth();
  const revokeMutation = useRevokeStaffAccess();
  const setRoleMutation = useSetUserRole();
  const [revokeDialog, setRevokeDialog] = useState<RevokeDialogState>({
    open: false,
    userId: "",
    nombre: "",
  });
  const [roleDialog, setRoleDialog] = useState<RoleDialogState>(CLOSED_ROLE_DIALOG);

  const handleRevokeClick = (userId: string, nombre: string) => {
    setRevokeDialog({ open: true, userId, nombre });
  };

  const handleRevokeConfirm = () => {
    revokeMutation.mutate(
      { userId: revokeDialog.userId, nombre: revokeDialog.nombre },
      { onSettled: () => setRevokeDialog({ open: false, userId: "", nombre: "" }) }
    );
  };

  // The Select only stages the change; nothing is written until the dialog is
  // confirmed. Granting superadmin is not something to do on a stray click.
  const handleRoleSelect = (userId: string, nombre: string, next: string) => {
    const parsed = AssignableRoleSchema.safeParse(next);
    if (!parsed.success) return;
    setRoleDialog({ open: true, userId, nombre, role: parsed.data });
  };

  const handleRoleConfirm = () => {
    if (!roleDialog.role) return;
    setRoleMutation.mutate(
      { userId: roleDialog.userId, role: roleDialog.role, nombre: roleDialog.nombre },
      { onSettled: () => setRoleDialog(CLOSED_ROLE_DIALOG) }
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        Error al cargar usuarios: {error.message}
      </div>
    );
  }

  if (staffUsers.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground text-sm">
        No hay usuarios de staff registrados.
      </div>
    );
  }

  return (
    <>
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Email</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nombre</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Rol</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Estado</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {staffUsers.map((user) => (
              <tr key={user.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                  {user.email}
                </td>
                <td className="px-4 py-3 font-medium text-foreground">
                  {user.nombre || <span className="text-muted-foreground italic">Sin nombre</span>}
                </td>
                <td className="px-4 py-3">
                  {user.id === currentUser?.id ? (
                    // Self-change is refused by the server too (admin.setUserRole):
                    // a superadmin demoting themselves takes effect immediately and,
                    // if they were the last one, cannot be undone from the app.
                    <Badge
                      variant="outline"
                      className={`text-xs ${ROLE_COLORS[user.role] ?? ROLE_COLORS["user"]}`}
                    >
                      {ROLE_LABELS[user.role] ?? user.role} (tú)
                    </Badge>
                  ) : (
                    <Select
                      value={user.role}
                      onValueChange={(next) =>
                        handleRoleSelect(user.id, user.nombre || user.email, next)
                      }
                    >
                      <SelectTrigger
                        className="h-8 w-[150px] text-xs"
                        aria-label={`Rol de ${user.nombre || user.email}`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {AssignableRoleSchema.options.map((role) => (
                          <SelectItem key={role} value={role} className="text-xs">
                            {ROLE_LABELS[role] ?? role}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className="flex items-center gap-1.5 text-emerald-600 text-xs font-medium">
                    <CheckCircle className="w-3.5 h-3.5" />
                    Activo
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  {user.role !== "superadmin" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10 text-xs h-7"
                      onClick={() => handleRevokeClick(user.id, user.nombre || user.email)}
                    >
                      <UserX className="w-3.5 h-3.5 mr-1" />
                      Revocar
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Role-change confirmation. Superadmin gets an extra warning: it is the
          only role that can grant roles, and the invite flow cannot create one. */}
      <AlertDialog
        open={roleDialog.open}
        onOpenChange={(open) => !open && setRoleDialog(CLOSED_ROLE_DIALOG)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Cambiar el rol de {roleDialog.nombre} a{" "}
              {roleDialog.role ? (ROLE_LABELS[roleDialog.role] ?? roleDialog.role) : ""}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {roleDialog.role === "superadmin"
                ? "Un superadmin puede invitar, revocar y cambiar el rol de cualquier persona, incluida la tuya. Concédelo solo a quien deba administrar los accesos."
                : "El nuevo rol se aplicará en su próxima petición. No necesita volver a iniciar sesión."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRoleConfirm}
              disabled={setRoleMutation.isPending}
            >
              {setRoleMutation.isPending ? "Guardando..." : "Cambiar rol"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Revoke confirmation dialog */}
      <AlertDialog
        open={revokeDialog.open}
        onOpenChange={(open) => !open && setRevokeDialog({ open: false, userId: "", nombre: "" })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Revocar acceso de {revokeDialog.nombre}?</AlertDialogTitle>
            <AlertDialogDescription>
              No podrá iniciar sesión con permisos de staff. Esta acción se puede deshacer
              invitando al usuario de nuevo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRevokeConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={revokeMutation.isPending}
            >
              {revokeMutation.isPending ? "Revocando..." : "Revocar acceso"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
