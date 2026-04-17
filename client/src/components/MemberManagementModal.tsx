import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Trash2, Plus, Edit2 } from "lucide-react";

interface Member {
  id: string;
  familia_id: string;
  nombre: string;
  rol: "head_of_household" | "dependent" | "other";
  relacion: "parent" | "child" | "sibling" | "other" | null;
  estado: "activo" | "inactivo";
  fecha_nacimiento: string | null;
  created_at: string;
  updated_at: string;
}

interface MemberManagementModalProps {
  familiaId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MemberManagementModal({
  familiaId,
  open,
  onOpenChange,
}: MemberManagementModalProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<{
    nombre: string;
    rol: "head_of_household" | "dependent" | "other";
    relacion: "parent" | "child" | "sibling" | "other" | "";
    estado: "activo" | "inactivo";
    fechaNacimiento: string;
  }>({
    nombre: "",
    rol: "dependent",
    relacion: "",
    estado: "activo",
    fechaNacimiento: "",
  });

  // Queries
  const { data: members = [], isLoading, refetch } = (trpc.families as any).getMembers.useQuery(
    { familiaId },
    { enabled: open }
  );

  // Mutations
  const addMemberMutation = (trpc.families as any).addMember.useMutation({
    onSuccess: () => {
      toast.success("Miembro agregado exitosamente");
      resetForm();
      refetch();
    },
    onError: (error: any) => {
      toast.error(error.message || "No se pudo agregar el miembro");
    },
  });

  const updateMemberMutation = (trpc.families as any).updateMember.useMutation({
    onSuccess: () => {
      toast.success("Miembro actualizado");
      resetForm();
      refetch();
    },
    onError: (error: any) => {
      toast.error(error.message || "No se pudo actualizar el miembro");
    },
  });

  const deleteMemberMutation = (trpc.families as any).deleteMember.useMutation({
    onSuccess: () => {
      toast.success("Miembro eliminado");
      refetch();
    },
    onError: (error: any) => {
      toast.error(error.message || "No se pudo eliminar el miembro");
    },
  });

  const resetForm = () => {
    setFormData({
      nombre: "",
      rol: "dependent",
      relacion: "",
      estado: "activo",
      fechaNacimiento: "",
    });
    setEditingId(null);
  };

  const handleEdit = (member: Member) => {
    setEditingId(member.id);
    setFormData({
      nombre: member.nombre,
      rol: member.rol,
      relacion: member.relacion || "",
      estado: member.estado,
      fechaNacimiento: member.fecha_nacimiento || "",
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.nombre.trim()) {
      toast.error("El nombre es requerido");
      return;
    }

    try {
      if (editingId) {
        await updateMemberMutation.mutateAsync({
          id: editingId,
          nombre: formData.nombre,
          rol: formData.rol,
          relacion: formData.relacion || undefined,
          estado: formData.estado,
          fechaNacimiento: formData.fechaNacimiento || undefined,
        });
      } else {
        await addMemberMutation.mutateAsync({
          familiaId,
          nombre: formData.nombre,
          rol: formData.rol,
          relacion: formData.relacion || undefined,
          estado: formData.estado,
          fechaNacimiento: formData.fechaNacimiento || undefined,
        });
      }
    } catch (error) {
      console.error("Error saving member:", error);
    }
  };

  const handleDelete = (memberId: string) => {
    if (confirm("¿Está seguro de que desea eliminar este miembro?")) {
      deleteMemberMutation.mutate({ id: memberId });
    }
  };

  const isLoading_ = isLoading || addMemberMutation.isPending || updateMemberMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gestionar Miembros de la Familia</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4 border rounded-lg p-4 bg-muted/50">
            <h3 className="font-semibold text-sm">
              {editingId ? "Editar Miembro" : "Agregar Nuevo Miembro"}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="nombre">Nombre *</Label>
                <Input
                  id="nombre"
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  placeholder="Nombre completo"
                  disabled={isLoading_}
                />
              </div>

              <div>
                <Label htmlFor="rol">Rol *</Label>
                <Select
                  value={formData.rol}
                  onValueChange={(value) => setFormData({ ...formData, rol: value as "head_of_household" | "dependent" | "other" })}
                  disabled={isLoading_}
                >
                  <SelectTrigger id="rol">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="head_of_household">Jefe de Hogar</SelectItem>
                    <SelectItem value="dependent">Dependiente</SelectItem>
                    <SelectItem value="other">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="relacion">Relación</Label>
                <Select
                  value={formData.relacion}
                  onValueChange={(value) => setFormData({ ...formData, relacion: value as "parent" | "child" | "sibling" | "other" | "" })}
                  disabled={isLoading_}
                >
                  <SelectTrigger id="relacion">
                    <SelectValue placeholder="Seleccionar relación" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unspecified">Sin especificar</SelectItem>
                    <SelectItem value="parent">Padre/Madre</SelectItem>
                    <SelectItem value="child">Hijo/Hija</SelectItem>
                    <SelectItem value="sibling">Hermano/Hermana</SelectItem>
                    <SelectItem value="other">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="estado">Estado</Label>
                <Select
                  value={formData.estado}
                  onValueChange={(value) => setFormData({ ...formData, estado: value as "activo" | "inactivo" })}
                  disabled={isLoading_}
                >
                  <SelectTrigger id="estado">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="activo">Activo</SelectItem>
                    <SelectItem value="inactivo">Inactivo</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="md:col-span-2">
                <Label htmlFor="fechaNacimiento">Fecha de Nacimiento</Label>
                <Input
                  id="fechaNacimiento"
                  type="date"
                  value={formData.fechaNacimiento}
                  onChange={(e) => setFormData({ ...formData, fechaNacimiento: e.target.value })}
                  disabled={isLoading_}
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              {editingId && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={resetForm}
                  disabled={isLoading_}
                >
                  Cancelar
                </Button>
              )}
              <Button type="submit" disabled={isLoading_}>
                {editingId ? "Guardar Cambios" : "Agregar Miembro"}
              </Button>
            </div>
          </form>

          {/* Members List */}
          <div>
            <h3 className="font-semibold text-sm mb-3">Miembros Actuales ({members.length})</h3>
            {members.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No hay miembros registrados
              </p>
            ) : (
              <div className="space-y-2">
                {members.map((member: any) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{member.nombre}</p>
                      <p className="text-xs text-muted-foreground">
                        {member.rol === "head_of_household"
                          ? "Jefe de Hogar"
                          : member.rol === "dependent"
                            ? "Dependiente"
                            : "Otro"}{" "}
                        {member.relacion &&
                          `• ${member.relacion === "parent" ? "Padre/Madre" : member.relacion === "child" ? "Hijo/Hija" : member.relacion === "sibling" ? "Hermano/Hermana" : "Otro"}`}
                      </p>
                      {member.fecha_nacimiento && (
                        <p className="text-xs text-muted-foreground">
                          Nac: {new Date(member.fecha_nacimiento).toLocaleDateString("es-ES")}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-1 ml-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(member)}
                        disabled={isLoading_}
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(member.id)}
                        disabled={isLoading_}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
