/**
 * SignedHojaUploadModal — dialog for uploading a signed PDF to a hoja.
 *
 * Self-contained: owns its file-selection state, the uploadSignedHoja
 * mutation, and the post-upload cache invalidation via trpc.useUtils().
 * The parent only supplies open/onOpenChange and the target hojaId.
 */

import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Upload } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export interface SignedHojaUploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hojaId: string;
}

export function SignedHojaUploadModal({
  open,
  onOpenChange,
  hojaId,
}: SignedHojaUploadModalProps) {
  const trpcCtx = trpc.useUtils();
  const [selectedSignedFile, setSelectedSignedFile] = useState<File | null>(null);
  const signedFileInputRef = useRef<HTMLInputElement>(null);

  // Reset file selection whenever the modal closes
  useEffect(() => {
    if (!open) {
      setSelectedSignedFile(null);
      if (signedFileInputRef.current) signedFileInputRef.current.value = "";
    }
  }, [open]);

  const uploadSignedHojaMutation = trpc.derivar.uploadSignedHoja.useMutation({
    onSuccess: () => {
      toast.success("Hoja firmada subida correctamente.");
      onOpenChange(false);
      void trpcCtx.derivar.getHoja.invalidate({ hojaId });
    },
    onError: (err) => {
      toast.error(err.message ?? "Error al subir la hoja firmada.");
    },
  });

  const handleUploadSignedHoja = async () => {
    if (!selectedSignedFile) return;
    const arrayBuffer = await selectedSignedFile.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    uploadSignedHojaMutation.mutate({
      hojaId,
      fileBase64: base64,
      originalName: selectedSignedFile.name,
    });
  };

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md w-full" aria-label="Subir hoja firmada">
        <DialogHeader>
          <DialogTitle>Subir hoja firmada</DialogTitle>
          <DialogDescription>
            Sube el PDF firmado de la hoja de derivaciones. Se adjuntará al expediente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          <div>
            <input
              ref={signedFileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              onChange={(e) => setSelectedSignedFile(e.target.files?.[0] ?? null)}
              className="block text-sm text-muted-foreground file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer"
              aria-label="Seleccionar PDF firmado"
              data-testid="signed-file-input"
            />
          </div>
          {selectedSignedFile && (
            <p className="text-xs text-muted-foreground">
              Seleccionado:{" "}
              <span className="font-medium">{selectedSignedFile.name}</span>{" "}
              ({formatSize(selectedSignedFile.size)})
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 mt-4">
          <Button
            variant="outline"
            type="button"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={() => void handleUploadSignedHoja()}
            disabled={!selectedSignedFile || uploadSignedHojaMutation.isPending}
          >
            {uploadSignedHojaMutation.isPending ? (
              <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Subiendo…</>
            ) : (
              <><Upload className="h-4 w-4 mr-1" />Subir PDF firmado</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
