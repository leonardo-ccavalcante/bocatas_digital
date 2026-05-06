import type { UseFormReturn } from "react-hook-form";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AudiencesSelector } from "@/components/AudiencesSelector";
import { AnnouncementImageUploader } from "@/components/AnnouncementImageUploader";
import type { Program } from "@/features/announcements/hooks/useAudienceOptions";
import { type FormValues, DEFAULT_AUDIENCE } from "./_shared";

interface AnnouncementFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingId: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: UseFormReturn<FormValues, any, FormValues>;
  programs: Program[];
  roles: string[];
  onSubmit: (values: FormValues) => Promise<void>;
  isPending: boolean;
}

export function AnnouncementFormDialog({
  open,
  onOpenChange,
  editingId,
  form,
  programs,
  roles,
  onSubmit,
  isPending,
}: AnnouncementFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Publicar desde (opcional)</label>
              <Input type="date" {...form.register("published_at")} />
              <p className="text-xs text-gray-500 mt-1">La novedad será visible a partir de esta fecha</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Expira el (opcional)</label>
              <Input type="date" {...form.register("expires_at")} />
              <p className="text-xs text-gray-500 mt-1">La novedad dejará de verse después de esta fecha</p>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">Imagen (opcional)</label>
            <AnnouncementImageUploader
              value={form.watch("image_url")}
              onChange={(url) => form.setValue("image_url", url)}
            />
            {form.formState.errors.image_url && (
              <p className="text-xs text-red-500 mt-1">{form.formState.errors.image_url.message}</p>
            )}
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">Dirigido a (Audiencias)</label>
            <AudiencesSelector
              programs={programs}
              roles={roles}
              value={form.watch("audiences") || DEFAULT_AUDIENCE}
              // tRPC error boundary
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              onChange={(audiences) => form.setValue("audiences", audiences as any)}
            />
            {form.formState.errors.audiences && (
              <p className="text-xs text-red-500 mt-1">{form.formState.errors.audiences.message}</p>
            )}
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

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isPending}
            >
              {editingId ? "Guardar cambios" : "Crear novedad"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
