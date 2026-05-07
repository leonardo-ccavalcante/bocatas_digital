import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useProgramDocumentTypes } from "./hooks/useProgramDocumentTypes";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClassifyModalProps {
  programaId: string;
  docId: string | null;
  currentTipo: string | null;
  open: boolean;
  onClose: () => void;
}

interface TipoOption {
  id: string;
  slug: string;
  nombre: string;
  scope: string;
  is_required: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ClassifyModal({
  programaId,
  docId,
  currentTipo,
  open,
  onClose,
}: ClassifyModalProps) {
  const [selectedSlug, setSelectedSlug] = useState<string>(currentTipo ?? "");

  // Keep the select in sync when the modal is opened with a different doc/tipo.
  // Using key={docId} on the Dialog handles this reset — see render below.

  const { data: docTypes = [] } = useProgramDocumentTypes(programaId);
  const tipos = docTypes as TipoOption[];

  const classifyMutation = trpc.families.classifyDocument.useMutation();

  const hasChanged = selectedSlug !== (currentTipo ?? "") && selectedSlug !== "";
  const canSave = hasChanged && !classifyMutation.isPending;

  async function handleGuardar() {
    if (!docId || !canSave) return;
    try {
      await classifyMutation.mutateAsync({
        docId,
        documentoTipo: selectedSlug,
      });
      toast.success("Documento reclasificado");
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error inesperado";
      toast.error(msg);
    }
  }

  // When docId is null, render nothing.
  if (!docId) return null;

  return (
    <Dialog
      key={docId}
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reclasificar documento</DialogTitle>
          <DialogDescription>
            Selecciona el nuevo tipo para este documento. El cambio se aplica de inmediato.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          <Select
            value={selectedSlug}
            onValueChange={setSelectedSlug}
          >
            <SelectTrigger aria-label="Nuevo tipo de documento">
              <SelectValue placeholder="Selecciona un tipo…" />
            </SelectTrigger>
            <SelectContent>
              {tipos.map((t) => (
                <SelectItem key={t.id} value={t.slug}>
                  {t.nombre} ({t.scope === "familia" ? "Por familia" : "Por miembro"})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={classifyMutation.isPending}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleGuardar}
            disabled={!canSave}
          >
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
