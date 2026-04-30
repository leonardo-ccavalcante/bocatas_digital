/**
 * AdminNovedades.tsx — Admin page to manage announcements (CRUD)
 * Only accessible to admin/superadmin roles
 * Task 7 — Phase F
 */
import { useState } from "react";
import { Plus, Pencil, Trash2, Pin, PinOff, Eye, EyeOff } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  useAnnouncements,
  useAnnouncementAudiences,
  useCreateAnnouncement,
  useUpdateAnnouncement,
  useDeleteAnnouncement,
  useTogglePinAnnouncement,
} from "@/features/announcements/hooks/useAnnouncements";
import {
  AudienceRulesEditor,
  toMutableRules,
  type MutableAudienceRule,
} from "@/features/announcements/components/AudienceRulesEditor";
import { AnnouncementImageUploader } from "@/features/announcements/components/AnnouncementImageUploader";
import { AnnouncementMetaPanels } from "@/features/announcements/components/AnnouncementMetaPanels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useEffect } from "react";
import type { AudienceRule } from "@shared/announcementTypes";

const FormSchema = z.object({
  titulo: z.string().min(1, "Título requerido").max(200),
  contenido: z.string().min(1, "Contenido requerido").max(5000),
  tipo: z.enum(["info", "evento", "cierre_servicio", "convocatoria"]),
  es_urgente: z.boolean().default(false),
  fijado: z.boolean().default(false),
  fecha_fin: z.string().optional(),
  imagen_url: z.string().url().optional().nullable(),
});

type FormValues = z.infer<typeof FormSchema>;

const TIPO_LABELS: Record<string, string> = {
  info: "Información",
  evento: "Evento",
  cierre_servicio: "Cierre de servicio",
  convocatoria: "Convocatoria",
};

const TIPO_COLORS: Record<string, string> = {
  info: "bg-blue-50 text-blue-700",
  evento: "bg-green-50 text-green-700",
  cierre_servicio: "bg-orange-50 text-orange-700",
  convocatoria: "bg-purple-50 text-purple-700",
};

// Default audience: visible to everyone (no role/program filter).
const DEFAULT_AUDIENCE: MutableAudienceRule[] = [{ roles: [], programs: [] }];

export default function AdminNovedades() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [audiences, setAudiences] = useState<MutableAudienceRule[]>(DEFAULT_AUDIENCE);
  const [audienceError, setAudienceError] = useState<string | null>(null);

  const { data, isLoading } = useAnnouncements({ limit: 100, includeInactive: showInactive });
  const createMutation = useCreateAnnouncement();
  const updateMutation = useUpdateAnnouncement();
  const deleteMutation = useDeleteAnnouncement();
  const togglePinMutation = useTogglePinAnnouncement();

  // When editing, hydrate the audience editor from the server.
  const { data: serverAudiences } = useAnnouncementAudiences(editingId ?? "");
  useEffect(() => {
    if (editingId && serverAudiences) {
      setAudiences(toMutableRules(serverAudiences as AudienceRule[]));
    }
  }, [editingId, serverAudiences]);

  const announcements = data?.announcements ?? [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const form = useForm<FormValues, any, FormValues>({
    resolver: zodResolver(FormSchema) as any,
    defaultValues: { tipo: "info", fijado: false },
  });

  function openCreate() {
    form.reset({ tipo: "info", es_urgente: false, fijado: false, imagen_url: null });
    setAudiences(DEFAULT_AUDIENCE);
    setAudienceError(null);
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
      imagen_url: (a.imagen_url as string | null) ?? null,
    });
    setAudienceError(null);
    setEditingId(a.id as string);
    setDialogOpen(true);
    // Audiences will be hydrated by the useEffect once the query resolves.
  }

  async function onSubmit(values: FormValues) {
    if (audiences.length === 0) {
      setAudienceError("Añade al menos una regla de audiencia.");
      return;
    }
    setAudienceError(null);
    try {
      if (editingId) {
        await updateMutation.mutateAsync({
          id: editingId,
          ...values,
          audiences,
        });
        toast.success("Novedad actualizada");
      } else {
        await createMutation.mutateAsync({
          ...values,
          audiences,
        });
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

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar novedad" : "Nueva novedad"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Título *</label>
              <Input {...form.register("titulo")} placeholder="Título de la novedad" />
              {form.formState.errors.titulo && (
                <p className="text-xs text-red-500 mt-1">{form.formState.errors.titulo.message}</p>
              )}
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Contenido *</label>
              <Textarea
                {...form.register("contenido")}
                placeholder="Escribe el contenido del comunicado..."
                rows={5}
                className="resize-none"
              />
              {form.formState.errors.contenido && (
                <p className="text-xs text-red-500 mt-1">{form.formState.errors.contenido.message}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Tipo</label>
                <Select
                  value={form.watch("tipo")}
                  onValueChange={(v) =>
                    form.setValue(
                      "tipo",
                      v as "info" | "evento" | "cierre_servicio" | "convocatoria"
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="info">Información</SelectItem>
                    <SelectItem value="evento">Evento</SelectItem>
                    <SelectItem value="cierre_servicio">Cierre de servicio</SelectItem>
                    <SelectItem value="convocatoria">Convocatoria</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Fecha de fin (opcional)</label>
                <Input type="date" {...form.register("fecha_fin")} />
              </div>
            </div>

            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="es_urgente"
                  {...form.register("es_urgente")}
                  className="rounded border-gray-300"
                />
                <label htmlFor="es_urgente" className="text-sm text-gray-700">
                  Es urgente (banner en /inicio + webhook)
                </label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="fijado"
                  {...form.register("fijado")}
                  className="rounded border-gray-300"
                />
                <label htmlFor="fijado" className="text-sm text-gray-700">Fijar en la parte superior</label>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-4">
              <AnnouncementImageUploader
                value={form.watch("imagen_url") ?? null}
                onChange={(url) => form.setValue("imagen_url", url)}
              />
            </div>

            <div className="border-t border-gray-100 pt-4">
              <AudienceRulesEditor
                value={audiences}
                onChange={setAudiences}
                error={audienceError ?? undefined}
              />
            </div>

            {editingId && (
              <div className="border-t border-gray-100 pt-4">
                <AnnouncementMetaPanels
                  announcementId={editingId}
                  isUrgent={form.watch("es_urgente") === true}
                />
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {editingId ? "Guardar cambios" : "Crear novedad"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
