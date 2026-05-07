import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export type UploadState = {
  docTypeId: string;
  docTypeName: string;
  programSlug: string;
  typeSlug: string;
  kind: "template" | "guide";
};

export function UploadDialog({
  state,
  open,
  onClose,
  onSave,
}: {
  state: UploadState;
  open: boolean;
  onClose: () => void;
  onSave: (file: File, version: string) => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [version, setVersion] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setFile(null);
      setVersion("");
      onClose();
    }
  };

  const handleSave = async () => {
    if (!file || !version) return;
    setIsSaving(true);
    try {
      await onSave(file, version);
    } finally {
      setIsSaving(false);
    }
  };

  const isDisabled = !file || !version.trim() || isSaving;
  const kindLabel = state.kind === "template" ? "plantilla" : "guía";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Subir {kindLabel}</DialogTitle>
          <DialogDescription>
            Sube un archivo de {kindLabel} para el tipo "{state.docTypeName}".
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="upload-file">Archivo</Label>
            <input
              id="upload-file"
              data-testid="upload-file-input"
              type="file"
              className="block w-full text-sm mt-1"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <div>
            <Label htmlFor="upload-version">Versión</Label>
            <Input
              id="upload-version"
              placeholder="versión (p.ej. v1)"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} aria-label="Cancelar">
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={isDisabled} aria-label="Guardar">
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
