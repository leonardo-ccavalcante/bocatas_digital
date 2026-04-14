import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Eye } from "lucide-react";
import { toast } from "sonner";

const ROLE_LABELS: Record<string, string> = {
  user: "Usuario",
  admin: "Admin",
  superadmin: "Superadmin",
  voluntario: "Voluntario",
  beneficiario: "Beneficiario",
};

const ROLE_OPTIONS = ["user", "admin", "superadmin", "voluntario", "beneficiario"] as const;

const FASE_ITINERARIO_LABELS: Record<string, string> = {
  acogida: "Acogida",
  estabilizacion: "Estabilización",
  formacion: "Formación",
  insercion_laboral: "Inserción Laboral",
  autonomia: "Autonomía",
};

const FASE_ITINERARIO_OPTIONS = ["acogida", "estabilizacion", "formacion", "insercion_laboral", "autonomia"] as const;

export function PersonsTable() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "superadmin";

  const { data: persons = [], isLoading, error } = trpc.persons.getAll.useQuery();
  const updateRoleMutation = trpc.persons.updateRole.useMutation();
  const updateFaseItinerarioMutation = trpc.persons.updateFaseItinerario.useMutation();

  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const handleRoleChange = async (personId: string, newRole: string) => {
    if (!isAdmin) return;

    setUpdatingId(personId);
    try {
      await updateRoleMutation.mutateAsync({
        personId,
        newRole: newRole as typeof ROLE_OPTIONS[number],
      });
      toast.success("Rol actualizado correctamente");
    } catch (err: any) {
      toast.error(err.message || "Error al actualizar rol");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleFaseItinerarioChange = async (personId: string, newFase: string) => {
    if (!isAdmin) return;

    setUpdatingId(personId);
    try {
      await updateFaseItinerarioMutation.mutateAsync({
        personId,
        newFaseItinerario: newFase as typeof FASE_ITINERARIO_OPTIONS[number],
      });
      toast.success("Fase itinerario actualizada correctamente");
    } catch (err: any) {
      toast.error(err.message || "Error al actualizar fase itinerario");
    } finally {
      setUpdatingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-red-600 py-4">
        Error al cargar personas: {error.message}
      </div>
    );
  }

  if (persons.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-8 text-center">
        No hay personas registradas
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/50">
          <tr>
            <th className="text-left px-3 py-2 font-medium">Nombre</th>
            <th className="text-left px-3 py-2 font-medium">Fecha Nacimiento</th>
            <th className="text-left px-3 py-2 font-medium">Fase Itinerario</th>
            {isAdmin && (
              <>
                <th className="text-left px-3 py-2 font-medium">Tipo Documento</th>
                <th className="text-left px-3 py-2 font-medium">Número Documento</th>
                <th className="text-left px-3 py-2 font-medium">Situación Legal</th>
                <th className="text-left px-3 py-2 font-medium">Llegada España</th>
                <th className="text-left px-3 py-2 font-medium">Rol</th>
              </>
            )}
            <th className="text-left px-3 py-2 font-medium">Registrado</th>
            <th className="text-left px-3 py-2 font-medium">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {persons.map((person: any) => (
            <tr key={person.id} className="hover:bg-muted/30 transition-colors">
              <td className="px-3 py-2">
                <div className="font-medium">{person.nombre}</div>
                {person.apellidos && <div className="text-xs text-muted-foreground">{person.apellidos}</div>}
              </td>
              <td className="px-3 py-2 text-xs">
                {person.fecha_nacimiento
                  ? new Date(person.fecha_nacimiento).toLocaleDateString("es-ES")
                  : "—"}
              </td>
              <td className="px-3 py-2">
                {isAdmin ? (
                  <Select
                    defaultValue={person.fase_itinerario || "acogida"}
                    onValueChange={(value) => handleFaseItinerarioChange(person.id, value)}
                    disabled={updatingId === person.id}
                  >
                    <SelectTrigger className="w-[140px] h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FASE_ITINERARIO_OPTIONS.map((fase) => (
                        <SelectItem key={fase} value={fase}>
                          {FASE_ITINERARIO_LABELS[fase]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="inline-block bg-[#C41230]/10 text-[#C41230] px-2 py-1 rounded text-xs">
                    {person.fase_itinerario || "—"}
                  </span>
                )}
              </td>
              {isAdmin && (
                <>
                  <td className="px-3 py-2 text-xs">{person.tipo_documento || "—"}</td>
                  <td className="px-3 py-2 text-xs">{person.numero_documento || "—"}</td>
                  <td className="px-3 py-2 text-xs">{person.situacion_legal || "—"}</td>
                  <td className="px-3 py-2 text-xs">
                    {person.fecha_llegada_espana
                      ? new Date(person.fecha_llegada_espana).toLocaleDateString("es-ES")
                      : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <Select
                      defaultValue={person.role || "beneficiario"}
                      onValueChange={(value) => handleRoleChange(person.id, value)}
                      disabled={updatingId === person.id}
                    >
                      <SelectTrigger className="w-[120px] h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLE_OPTIONS.map((role) => (
                          <SelectItem key={role} value={role}>
                            {ROLE_LABELS[role]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                </>
              )}
              <td className="px-3 py-2 text-xs">
                {person.created_at
                  ? new Date(person.created_at).toLocaleDateString("es-ES")
                  : "—"}
              </td>
              <td className="px-3 py-2">
                <Link href={`/personas/${person.id}`}>
                  <Button variant="ghost" size="sm" className="gap-1">
                    <Eye className="h-4 w-4" />
                    Ver
                  </Button>
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
