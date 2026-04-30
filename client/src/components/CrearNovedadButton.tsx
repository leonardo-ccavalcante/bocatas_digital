/**
 * CrearNovedadButton.tsx — Authoring entry point rendered on /novedades.
 * Visible only to admin/superadmin. Exposes two actions:
 *   1. "Nueva novedad"  → opens an inline create dialog (no page navigation)
 *   2. "Importar lote"  → opens BulkImportNovedadesModal
 *
 * The full edit experience (pin/unpin, soft-delete, audit log, dismissal
 * stats) lives on /admin/novedades. This button covers the most common case:
 * "I'm on /novedades and want to publish something quickly."
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useAuth } from "@/_core/hooks/useAuth";
import type { BocatasRole } from "@/components/layout/ProtectedRoute";
import { BulkImportNovedadesModal } from "@/components/BulkImportNovedadesModal";
import { useCreateAnnouncement } from "@/features/announcements/hooks/useAnnouncements";
import {
  AudienceRulesEditor,
  type MutableAudienceRule,
} from "@/features/announcements/components/AudienceRulesEditor";
import { AnnouncementImageUploader } from "@/features/announcements/components/AnnouncementImageUploader";
import { ANNOUNCEMENT_TYPES } from "@shared/announcementTypes";

const ADMIN_ROLES: BocatasRole[] = ["admin", "superadmin"];
const VALID_BOCATAS_ROLES: BocatasRole[] = [
  "superadmin",
  "admin",
  "voluntario",
  "beneficiario",
];

const FormSchema = z.object({
  titulo: z.string().min(1, "Título requerido").max(200),
  contenido: z.string().min(1, "Contenido requerido").max(5000),
  tipo: z.enum(ANNOUNCEMENT_TYPES),
  es_urgente: z.boolean().default(false),
  fijado: z.boolean().default(false),
  fecha_fin: z.string().optional(),
  imagen_url: z.string().url().optional().nullable(),
});

type FormValues = z.infer<typeof FormSchema>;

const TIPO_LABELS: Record<(typeof ANNOUNCEMENT_TYPES)[number], string> = {
  info: "Información",
  evento: "Evento",
  cierre_servicio: "Cierre de servicio",
  convocatoria: "Convocatoria",
};

const DEFAULT_AUDIENCE: MutableAudienceRule[] = [{ roles: [], programs: [] }];

export function CrearNovedadButton() {
  const { user } = useAuth();
  const [bulkOpen, setBulkOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [audiences, setAudiences] = useState<MutableAudienceRule[]>(DEFAULT_AUDIENCE);
  const [audienceError, setAudienceError] = useState<string | null>(null);
  const createMutation = useCreateAnnouncement();

  const rawRole = user?.role as string | undefined;
  const role: BocatasRole =
    rawRole && VALID_BOCATAS_ROLES.includes(rawRole as BocatasRole)
      ? (rawRole as BocatasRole)
      : "beneficiario";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const form = useForm<FormValues, any, FormValues>({
    resolver: zodResolver(FormSchema) as any,
    defaultValues: {
      tipo: "info",
      es_urgente: false,
      fijado: false,
      imagen_url: null,
    },
  });

  if (!ADMIN_ROLES.includes(role)) {
    return null;
  }

  function openCreate() {
    form.reset({
      tipo: "info",
      es_urgente: false,
      fijado: false,
      imagen_url: null,
    });
    setAudiences(DEFAULT_AUDIENCE);
    setAudienceError(null);
    setCreateOpen(true);
  }

  async function onSubmit(values: FormValues) {
    if (audiences.length === 0) {
      setAudienceError("Añade al menos una regla de audiencia.");
      return;
    }
    setAudienceError(null);
    try {
      await createMutation.mutateAsync({ ...values, audiences });
      toast.success("Novedad creada");
      setCreateOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error desconocido";
      toast.error(`No se pudo crear: ${message}`);
    }
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={openCreate}
          className="bg-[#C41230] hover:bg-[#A00E27] text-white gap-1.5"
          aria-label="Crear novedad"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          Nueva novedad
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setBulkOpen(true)}
          className="border-[#C41230]/30 text-[#C41230] hover:bg-[#C41230]/5 gap-1.5"
          aria-label="Importar lote de novedades desde CSV"
        >
          <Upload className="w-4 h-4" aria-hidden="true" />
          Importar lote
        </Button>
      </div>

      <BulkImportNovedadesModal open={bulkOpen} onOpenChange={setBulkOpen} />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nueva novedad</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">
                Título *
              </label>
              <Input
                {...form.register("titulo")}
                placeholder="Título de la novedad"
              />
              {form.formState.errors.titulo && (
                <p className="text-xs text-red-500 mt-1">
                  {form.formState.errors.titulo.message}
                </p>
              )}
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">
                Contenido *
              </label>
              <Textarea
                {...form.register("contenido")}
                placeholder="Escribe el contenido del comunicado..."
                rows={5}
                className="resize-none"
              />
              {form.formState.errors.contenido && (
                <p className="text-xs text-red-500 mt-1">
                  {form.formState.errors.contenido.message}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">
                  Tipo
                </label>
                <Select
                  value={form.watch("tipo")}
                  onValueChange={(v) =>
                    form.setValue(
                      "tipo",
                      v as (typeof ANNOUNCEMENT_TYPES)[number]
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ANNOUNCEMENT_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {TIPO_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">
                  Fecha de fin (opcional)
                </label>
                <Input type="date" {...form.register("fecha_fin")} />
              </div>
            </div>

            <div className="flex items-center gap-4 flex-wrap">
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  {...form.register("es_urgente")}
                  className="rounded border-gray-300"
                />
                Es urgente (banner en /inicio + webhook)
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  {...form.register("fijado")}
                  className="rounded border-gray-300"
                />
                Fijar en lo alto
              </label>
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

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                Crear novedad
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
