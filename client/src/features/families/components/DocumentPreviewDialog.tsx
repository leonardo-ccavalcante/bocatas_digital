import { useMemo } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface DocumentPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bufferBase64: string;
  fileName: string;
  mime: string;
}

export function DocumentPreviewDialog({
  open,
  onOpenChange,
  bufferBase64,
  fileName,
  mime,
}: DocumentPreviewDialogProps) {
  // Decode base64 → Blob → object URL for the download link.
  // The URL is stable across renders (only changes when bufferBase64/mime change).
  const blobUrl = useMemo(() => {
    const binaryStr = atob(bufferBase64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: mime });
    return URL.createObjectURL(blob);
  }, [bufferBase64, mime]);

  // RGPD GUARD — do NOT add an Office Online viewer iframe
  // (view.officeapps.live.com) here. The generated document contains beneficiary
  // PII (nombre, número de documento, teléfono); embedding it in that iframe
  // would transmit the file to a Microsoft endpoint that is NOT a sub-processor
  // covered by the EIPD. Any in-app preview must render SAME-ORIGIN
  // (e.g. docx-preview / mammoth) so the buffer never leaves this origin.
  // Until that lands, the document is viewed by downloading it.
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md w-full">
        <DialogHeader>
          <DialogTitle>{fileName}</DialogTitle>
          <DialogDescription>
            Descarga el documento para visualizarlo.
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-end pt-2">
          <Button asChild>
            <a href={blobUrl} download={fileName} aria-label={`Descargar ${fileName}`}>
              <Download className="h-4 w-4" aria-hidden="true" />
              Descargar
            </a>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
