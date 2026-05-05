/**
 * AdminNovedades — Admin page to manage announcements (CRUD)
 * Only accessible to admin/superadmin roles
 */
import { useState } from "react";
import { Plus, Pencil, Trash2, Pin, PinOff, Eye, EyeOff } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { BulkImportNovedadesModal } from "@/components/BulkImportNovedadesModal";
import { SchedulingDashboard } from "@/features/announcements/components/SchedulingDashboard";
import { useAudienceOptions } from "@/features/announcements/hooks/useAudienceOptions";
import {
  useAnnouncements,
  useCreateAnnouncement,
  useUpdateAnnouncement,
  useDeleteAnnouncement,
  useTogglePinAnnouncement,
} from "@/features/announcements/hooks/useAnnouncements";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  FormSchema,
  type FormValues,
  TIPO_LABELS,
  TIPO_COLORS,
  DEFAULT_AUDIENCE,
} from "./_shared";
import { AnnouncementFormDialog } from "./AnnouncementFormDialog";

export default function AdminNovedades() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const { programs, roles } = useAudienceOptions();

  const { data, isLoading } = useAnnouncements({ limit: 100, includeInactive: showInactive });
  const createMutation = useCreateAnnouncement();
  const updateMutation = useUpdateAnnouncement();
  const deleteMutation = useDeleteAnnouncement();
  const togglePinMutation = useTogglePinAnnouncement();

  const announcements = data?.announcements ?? [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const form = useForm<FormValues, any, FormValues>({
    resolver: zodResolver(FormSchema) as any,
    defaultValues: { tipo: "info", fijado: false },
  });

  function openCreate() {
    form.reset({ tipo: "info", es_urgente: false, fijado: false, audiences: DEFAULT_AUDIENCE });
    setEditingId(null);
    setDialogOpen(true);
  }

  function openEdit(a: Record<string, unknown>) {
    form.reset({
      titulo: a.titulo as string,
      contenido: a.contenido as string,
      tipo: a.tipo as "info" | "evento" | "cierre_servicio" | "convocatoria",
      es_urgente: (a.es_urgente as boolean | undefined) ?? false,
      fijado: a.fijado as boolean,
      fecha_fin: (a.fecha_fin as string | null) ?? undefined,
    });
    setEditingId(a.id as string);
    setDialogOpen(true);
  }

  async function onSubmit(values: FormValues) {
    try {
      if (editingId) {
        await updateMutation.mutateAsync({ id: editingId, ...values });
        toast.success("Novedad actualizada");
      } else {
        await createMutation.mutateAsync(values);
        toast.success("Novedad creada");
      }
      setDialogOpen(false);
    } catch {
      toast.error("Error al guardar");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("¿Eliminar esta novedad?")) return;
    try {
      await deleteMutation.mutateAsync({ id });
      toast.success("Novedad eliminada");
    } catch {
      toast.error("Error al eliminar");
    }
  }

  async function handleTogglePin(id: string) {
    try {
      await togglePinMutation.mutateAsync({ id });
    } catch {
      toast.error("Error al fijar");
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Gestión de Novedades</h1>
          <p className="text-sm text-gray-500">Crea y gestiona comunicados para los usuarios</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowInactive(!showInactive)}
            className="gap-2"
          >
            {showInactive ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            {showInactive ? "Ocultar inactivas" : "Ver inactivas"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setBulkImportOpen(true)}
            className="gap-2"
          >
            <Plus className="w-4 h-4" /> Importar CSV
          </Button>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="w-4 h-4" /> Nueva novedad
          </Button>
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}
        </div>
      ) : announcements.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">
          No hay novedades. Crea la primera.
        </div>
      ) : (
        <div className="space-y-3">
          {announcements.map((a) => {
            const ann = a as Record<string, unknown>;
            return (
              <div
                key={ann.id as string}
                className={`bg-white rounded-2xl border p-4 flex items-start gap-4 ${
                  !(ann.activo as boolean) ? "opacity-50" : ""
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${TIPO_COLORS[ann.tipo as string] ?? ""}`}>
                      {TIPO_LABELS[ann.tipo as string] ?? ann.tipo as string}
                    </span>
                    {(ann.fijado as boolean) && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-yellow-50 text-yellow-700">
                        Fijado
                      </span>
                    )}
                    {!(ann.activo as boolean) && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                        Inactiva
                      </span>
                    )}
                  </div>
                  <p className="font-semibold text-sm text-gray-900 truncate">{ann.titulo as string}</p>
                  <p className="text-xs text-gray-500 line-clamp-1 mt-0.5">{ann.contenido as string}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(ann.created_at as string).toLocaleDateString("es-ES")}
                    {(ann.autor_nombre as string | null) && ` · ${ann.autor_nombre as string}`}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleTogglePin(ann.id as string)}
                    title={ann.fijado ? "Desfijar" : "Fijar"}
                  >
                    {(ann.fijado as boolean) ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => openEdit(ann)}
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-red-500 hover:text-red-700"
                    onClick={() => handleDelete(ann.id as string)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AnnouncementFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editingId={editingId}
        form={form}
        programs={programs}
        roles={roles}
        onSubmit={onSubmit}
        isPending={createMutation.isPending || updateMutation.isPending}
      />

      {/* Bulk Import Modal */}
      <BulkImportNovedadesModal open={bulkImportOpen} onOpenChange={setBulkImportOpen} />

      {/* Scheduling Dashboard */}
      {announcements && announcements.length > 0 && (
        <div className="mt-8 pt-8 border-t">
          <SchedulingDashboard
            announcements={announcements.map((a) => ({
              id: a.id,
              titulo: a.titulo,
              published_at: (a.published_at as string | null) ?? null,
              expires_at: (a.expires_at as string | null) ?? null,
            }))}
            onReschedule={(id, date) => {
              console.log(`Reschedule ${id} to ${date}`);
            }}
          />
        </div>
      )}
    </div>
  );
}
