import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Loader2, AlertTriangle, FileText } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { getSignedDocUrl } from "@/features/families/utils/signedUrl";
// `?url` emits the worker as a separate asset and yields its URL only — the
// heavy pdf.js library itself is dynamically imported below so it code-splits
// out of the main/login bundle.
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

interface DocxPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Storage path (documento_url) of the generated .docx in family-documents. */
  docPath: string | null;
  filename?: string;
  title?: string;
}

function base64ToUint8(base64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(base64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

type RenderState = "idle" | "rendering" | "done" | "error";

/**
 * Faithful preview of the generated informe. The server converts the real .docx
 * to PDF (LibreOffice) so the membrete and Espe's floating signature render
 * exactly; here pdf.js paints the PDF onto <canvas> pages. Canvas rendering is
 * plugin-independent, so the preview works everywhere — desktop Chrome/Safari,
 * the VSCode embedded browser, and low-end Android/iOS — where <iframe>/<object>
 * fail (blank + forced download, or "no plugin"). The .docx download is always
 * available as a fallback.
 */
export default function DocxPreviewModal({
  open,
  onOpenChange,
  docPath,
  filename = "informe-valoracion-social",
  title = "Informe de valoración social",
}: DocxPreviewModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [renderState, setRenderState] = useState<RenderState>("idle");

  const pdfQuery = trpc.families.getSocialReportPdf.useQuery(
    { path: docPath ?? "" },
    { enabled: open && !!docPath, retry: false, staleTime: 5 * 60 * 1000 },
  );

  const pdfBytes = useMemo(
    () => (pdfQuery.data?.pdfBase64 ? base64ToUint8(pdfQuery.data.pdfBase64) : null),
    [pdfQuery.data?.pdfBase64],
  );

  // Blob URL for the "Descargar PDF" link (Blob copies the bytes on construction,
  // so it survives pdf.js consuming its own copy below).
  const pdfUrl = useMemo(
    () => (pdfBytes ? URL.createObjectURL(new Blob([pdfBytes], { type: "application/pdf" })) : null),
    [pdfBytes],
  );
  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl]);

  // Render the PDF to canvas pages via pdf.js (plugin-independent).
  useEffect(() => {
    if (!open || !pdfBytes) return;
    let cancelled = false;
    setRenderState("rendering");
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
        // Pass a copy — getDocument may detach the buffer it's given.
        const pdf = await pdfjs.getDocument({ data: pdfBytes.slice() }).promise;
        if (cancelled) return;
        const container = containerRef.current;
        if (!container) return;
        container.innerHTML = "";
        for (let n = 1; n <= pdf.numPages; n++) {
          const page = await pdf.getPage(n);
          if (cancelled) return;
          const viewport = page.getViewport({ scale: 1.5 });
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.className = "mx-auto mb-3 w-full max-w-3xl rounded shadow";
          container.appendChild(canvas);
          await page.render({ canvasContext: ctx, viewport, canvas }).promise;
        }
        if (!cancelled) setRenderState("done");
      } catch {
        if (!cancelled) setRenderState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, pdfBytes]);

  const pdfUnavailable = pdfQuery.error?.data?.code === "PRECONDITION_FAILED";
  const busy = pdfQuery.isPending || renderState === "rendering";

  async function downloadDocx() {
    if (!docPath) return;
    const url = await getSignedDocUrl(docPath);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-4xl flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Vista previa fiel del documento (membrete y firma incluidos). Revisalo antes de descargar.
          </DialogDescription>
        </DialogHeader>

        <div className="relative h-[70vh] overflow-auto rounded border border-border bg-muted/30 p-2">
          {busy && (
            <div
              className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-muted/40 text-muted-foreground"
              role="status"
              aria-live="polite"
            >
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              Generando vista previa…
            </div>
          )}
          {(pdfQuery.isError || renderState === "error") && (
            <div
              className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center"
              role="alert"
            >
              <AlertTriangle className="h-6 w-6 text-amber-500" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">
                {pdfUnavailable
                  ? "La vista previa en PDF no está disponible en este servidor. Podés descargar el documento .docx (está completo)."
                  : "No se pudo mostrar la vista previa. Podés descargar el documento."}
              </p>
            </div>
          )}
          <div ref={containerRef} aria-label="Vista previa del informe" />
        </div>

        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
          <Button variant="outline" onClick={downloadDocx} disabled={!docPath}>
            <FileText className="mr-2 h-4 w-4" aria-hidden="true" />
            Descargar DOCX
          </Button>
          <Button asChild disabled={!pdfUrl}>
            <a href={pdfUrl ?? undefined} download={`${filename}.pdf`}>
              <Download className="mr-2 h-4 w-4" aria-hidden="true" />
              Descargar PDF
            </a>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
