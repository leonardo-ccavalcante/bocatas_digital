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
  // Decode base64 → Blob → object URL for preview and download.
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

  // KNOWN LIMITATION (E1 plan §H assumption #3):
  // The Office Online viewer (view.officeapps.live.com) requires a publicly-reachable URL.
  // A `blob:` URL produced from a local base64 buffer is only resolvable within this browser
  // origin and will NOT be accessible to the Office viewer's external servers.
  // As a result, the iframe will render an error or remain blank when running against localhost
  // or any non-public URL. The download fallback below is the reliable path until this component
  // is wired up to a Supabase Storage signed URL that is publicly reachable.
  // TODO (post-E1): replace blobUrl with a short-lived signed Storage URL before using the iframe in production.
  const officeViewerUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(blobUrl)}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-full">
        <DialogHeader>
          <DialogTitle>{fileName}</DialogTitle>
          <DialogDescription>
            Vista previa del documento generado
          </DialogDescription>
        </DialogHeader>

        {/* Download fallback — always visible, not behind any interaction */}
        <div className="flex justify-end pb-2">
          <Button variant="outline" size="sm" asChild>
            <a
              href={blobUrl}
              download={fileName}
              aria-label={`Descargar ${fileName}`}
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Descargar
            </a>
          </Button>
        </div>

        {/* Office Online viewer — will not render for localhost blob URLs; see KNOWN LIMITATION above */}
        <div className="w-full" style={{ height: "80vh" }}>
          <iframe
            src={officeViewerUrl}
            title={`Vista previa: ${fileName}`}
            className="w-full h-full rounded border"
            allow="fullscreen"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
