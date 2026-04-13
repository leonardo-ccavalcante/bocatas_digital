/**
 * StaffUserList.tsx — D-D8: List of staff users with email, nombre, role badge, revoke button.
 * Job 6, AC2: shows email, nombre, role badge, created_at, "Revocar acceso" action.
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
import { Skeleton } from "@/components/ui/skeleton";
import { useStaffUsers, useRevokeStaffAccess } from "../hooks/useStaffUsers";
import { ROLE_LABELS, ROLE_COLORS } from "../schemas";
import { UserX, CheckCircle } from "lucide-react";

interface RevokeDialogState {
  open: boolean;
  userId: string;
  nombre: string;
}

export function StaffUserList() {
  const { staffUsers, isLoading, error } = useStaffUsers();
  const revokeMutation = useRevokeStaffAccess();
  const [revokeDialog, setRevokeDialog] = useState<RevokeDialogState>({
    open: false,
    userId: "",
    nombre: "",
  });

  const handleRevokeClick = (userId: string, nombre: string) => {
    setRevokeDialog({ open: true, userId, nombre });
  };

  const handleRevokeConfirm = () => {
    revokeMutation.mutate(
      { userId: revokeDialog.userId, nombre: revokeDialog.nombre },
      { onSettled: () => setRevokeDialog({ open: false, userId: "", nombre: "" }) }
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
                  <Badge
                    variant="outline"
                    className={`text-xs ${ROLE_COLORS[user.role] ?? ROLE_COLORS["user"]}`}
                  >
                    {ROLE_LABELS[user.role] ?? user.role}
                  </Badge>
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
