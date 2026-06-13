/**
 * DocPreviewModal — PDF preview dialog for DOCX/PDF generation.
 *
 * Renders when previewKind is non-null. Owns the full lifecycle:
 * fetch preview → display blob URL → confirm → generate + download → close.
 *
 * Parent is responsible only for setting previewKind via its action buttons.
 * This component calls onClose (i.e. setPreviewKind(null)) when done or cancelled.
 */

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, ExternalLink } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export interface DocPreviewModalProps {
  /** null = closed; "docx" | "pdf" = open for that kind */
  previewKind: "docx" | "pdf" | null;
  hojaId: string;
  /** Parent calls this with null to close (e.g. setPreviewKind(null)) */
  onClose: () => void;
}

function downloadBase64(b64: string, filename: string, mime: string): void {
  const blob = new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], {
    type: mime,
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function DocPreviewModal({
  previewKind,
  hojaId,
  onClose,
}: DocPreviewModalProps) {
  const trpcCtx = trpc.useUtils();
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);

  const generateDocxMutation = trpc.derivar.generateDocx.useMutation();
  const generatePdfMutation = trpc.derivar.generatePdf.useMutation();

  // Fetch preview PDF whenever the modal opens for a new kind
  useEffect(() => {
    if (!previewKind) return;

    let cancelled = false;

    const fetchPreview = async () => {
      // Revoke any previous blob URL before creating a new one
      setPreviewBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setPreviewLoading(true);

      try {
        const preview = await trpcCtx.derivar.previewPdf.fetch({ hojaId });
        if (cancelled) return;
        // Convert base64 → Blob → object URL (avoids Chrome CSP block on data: URLs)
        const bytes = Uint8Array.from(
          atob(preview.contentBase64),
          (c) => c.charCodeAt(0),
        );
        const blob = new Blob([bytes], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        setPreviewBlobUrl(url);
      } catch (e) {
        if (cancelled) return;
        toast.error(
          e instanceof Error ? e.message : "Error al generar la vista previa",
        );
        onClose();
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    };

    void fetchPreview();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKind, hojaId]);

  // Revoke blob URL when modal closes
  useEffect(() => {
    if (!previewKind && previewBlobUrl) {
      URL.revokeObjectURL(previewBlobUrl);
      setPreviewBlobUrl(null);
    }
  }, [previewKind, previewBlobUrl]);

  // Loading feedback during the (server-side, can be slow) generate+download.
  // Closing BEFORE the await would dismiss the modal instantly with zero
  // feedback — keep it open with a spinner, close only on success, stay open on
  // error so the user keeps context to retry. (Mirrors the original
  // busy-driven "Generando..." UX, co-located with the action.)
  const isGenerating =
    generateDocxMutation.isPending || generatePdfMutation.isPending;

  const onConfirmGenerate = async () => {
    if (!previewKind) return;
    const kind = previewKind;
    try {
      const out =
        kind === "docx"
          ? await generateDocxMutation.mutateAsync({ hojaId })
          : await generatePdfMutation.mutateAsync({ hojaId });
      downloadBase64(out.contentBase64, out.filename, out.mime);
      onClose();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Error al generar el documento",
      );
    }
  };

  const onCancelPreview = () => {
    onClose();
  };

  return (
    <Dialog
      open={previewKind !== null}
      onOpenChange={(open) => !open && onCancelPreview()}
    >
      <DialogContent
        className="max-w-3xl w-full"
        aria-label="Vista previa del documento"
      >
        <DialogHeader>
          <DialogTitle>Vista previa del documento</DialogTitle>
          <DialogDescription>
            {previewKind === "docx"
              ? "Vista previa del Word (.docx) — descarga el archivo tras confirmar."
              : "Vista previa del PDF (.pdf) — descarga el archivo tras confirmar."}
          </DialogDescription>
        </DialogHeader>

        <div className="w-full rounded border overflow-hidden" style={{ height: "60vh" }}>
          {previewLoading ? (
            <div
              className="flex items-center justify-center h-full bg-muted/30"
              aria-label="Cargando vista previa"
            >
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground text-sm">
                Generando vista previa…
              </span>
            </div>
          ) : previewBlobUrl ? (
            /* Use <object> instead of <iframe> — Chrome allows blob: URLs in <object> */
            <object
              data={previewBlobUrl}
              type="application/pdf"
              className="w-full h-full"
              aria-label="Vista previa PDF"
            >
              <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground text-sm p-6">
                <p>Tu navegador no puede mostrar el PDF en línea.</p>
                <a
                  href={previewBlobUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline flex items-center gap-1"
                >
                  Abrir PDF en nueva pestaña <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </object>
          ) : null}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            type="button"
            onClick={onCancelPreview}
            disabled={isGenerating}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={() => void onConfirmGenerate()}
            disabled={previewLoading || isGenerating}
            aria-busy={isGenerating}
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" aria-hidden="true" />
                Generando…
              </>
            ) : previewKind === "docx" ? (
              "Descargar Word"
            ) : (
              "Descargar PDF"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
