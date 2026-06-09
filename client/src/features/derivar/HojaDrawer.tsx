/**
 * HojaDrawer — Sheet panel displaying a full hoja with all its interventions.
 *
 * Features:
 * - Lists all interventions for the entity in this programa.
 * - "Generar Word" / "Generar PDF" open a preview modal that renders the PDF
 *   in an iframe before the user confirms the download.
 * - "Añadir intervención" delegates back to the parent via onAddIntervention.
 * - "Subir hoja firmada" is stubbed (disabled) pending v2 per-row signatures.
 * - "Cambiar plantilla" (gear icon) opens a template management modal.
 */

import { useState, useEffect, useRef } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, FileText, FileDown, Upload, Loader2, Settings, CheckCircle2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface HojaDrawerProps {
  hojaId: string | null;
  onClose: () => void;
  onAddIntervention: (hojaId: string) => void;
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

interface RawPersona {
  nombre?: string;
  apellidos?: string;
}

interface RawFamilia {
  familia_numero?: number | null;
  titular?: RawPersona | null;
}

interface RawPrograma {
  name?: string;
}

interface RawHoja {
  id: string;
  scope: string;
  fecha_apertura: string;
  profesional_nombre: string;
  persona?: RawPersona | null;
  familia?: RawFamilia | null;
  programa?: RawPrograma | null;
}

interface RawIntervencion {
  id: string;
  fecha: string;
  tipo_slug: string;
  descripcion: string;
  observaciones?: string | null;
  firmado_url?: string | null;
  institucion_snapshot?: { nombre?: string } | null;
}

export function HojaDrawer({
  hojaId,
  onClose,
  onAddIntervention,
}: HojaDrawerProps) {
  const enabled = !!hojaId;
  const result = trpc.derivar.getHoja.useQuery(
    { hojaId: hojaId ?? "" },
    { enabled },
  );
  const trpcCtx = trpc.useUtils();
  const [busy, setBusy] = useState<"docx" | "pdf" | null>(null);

  // Preview modal state
  const [previewKind, setPreviewKind] = useState<"docx" | "pdf" | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  // Use data: URL to avoid Chrome blocking blob: URLs in iframes
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);

  // Template management modal state
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Clear data URL when modal closes
  useEffect(() => {
    if (!previewKind) {
      setPreviewDataUrl(null);
    }
  }, [previewKind]);

  // Reset file selection when template modal closes
  useEffect(() => {
    if (!templateModalOpen) {
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }, [templateModalOpen]);

  // tRPC queries/mutations for template management
  const listTemplatesQuery = trpc.derivar.listTemplates.useQuery(undefined, {
    enabled: templateModalOpen,
  });
  const uploadTemplateMutation = trpc.derivar.uploadTemplate.useMutation({
    onSuccess: (data) => {
      toast.success(data.message ?? "Plantilla subida correctamente.");
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      void trpcCtx.derivar.listTemplates.invalidate();
    },
    onError: (err) => {
      toast.error(err.message ?? "Error al subir la plantilla.");
    },
  });

  if (!hojaId) return null;

  const rawData = result.data as
    | { hoja: RawHoja; intervenciones: RawIntervencion[] }
    | undefined;

  const hoja = rawData?.hoja;
  const intervenciones = rawData?.intervenciones ?? [];

  const isPersona = hoja?.scope === "persona";
  const titular = hoja?.familia?.titular;
  const nombre = isPersona
    ? `${hoja?.persona?.nombre ?? ""} ${hoja?.persona?.apellidos ?? ""}`.trim()
    : titular
      ? `${titular.nombre ?? ""} ${titular.apellidos ?? ""}`.trim()
      : `Familia #${hoja?.familia?.familia_numero ?? ""}`;

  /** Called when user clicks "Generar Word" or "Generar PDF" — shows preview modal with PDF. */
  const handleGenerateClick = async (kind: "docx" | "pdf") => {
    setPreviewKind(kind);
    setPreviewLoading(true);
    setPreviewDataUrl(null);

    try {
      // Always generate PDF preview (even for DOCX, to show visual representation)
      const preview = await trpcCtx.derivar.previewPdf.fetch({ hojaId });
      // Use data: URL — Chrome blocks blob: URLs in iframes in some security contexts
      const dataUrl = `data:application/pdf;base64,${preview.contentBase64}`;
      setPreviewDataUrl(dataUrl);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Error al generar la vista previa",
      );
      setPreviewKind(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  /** Called when user confirms in the preview modal. */
  const onConfirmGenerate = async () => {
    if (!previewKind) return;
    const kind = previewKind;
    setPreviewKind(null);
    setBusy(kind);
    try {
      const out =
        kind === "docx"
          ? await trpcCtx.derivar.generateDocx.fetch({ hojaId })
          : await trpcCtx.derivar.generatePdf.fetch({ hojaId });
      downloadBase64(out.contentBase64, out.filename, out.mime);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Error al generar el documento",
      );
    } finally {
      setBusy(null);
    }
  };

  const onCancelPreview = () => {
    setPreviewKind(null);
  };

  /** Handle file selection in template modal */
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
  };

  /** Upload the selected template file */
  const handleUploadTemplate = async () => {
    if (!selectedFile) return;
    const arrayBuffer = await selectedFile.arrayBuffer();
    const base64 = btoa(
      String.fromCharCode(...new Uint8Array(arrayBuffer)),
    );
    uploadTemplateMutation.mutate({
      fileBase64: base64,
      originalName: selectedFile.name,
    });
  };

  /** Format file size for display */
  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <>
      <Sheet open={enabled} onOpenChange={(open) => !open && onClose()}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-2xl overflow-y-auto"
          aria-label="Hoja de derivaciones"
        >
          <SheetHeader>
            <SheetTitle>
              {result.isLoading ? (
                <Skeleton className="h-6 w-64" />
              ) : (
                "Hoja de derivaciones"
              )}
            </SheetTitle>
          </SheetHeader>

          {result.isLoading ? (
            <div className="space-y-2 mt-6" aria-busy="true">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : hoja ? (
            <>
              <section className="mt-4 text-sm space-y-1" aria-label="Datos del expediente">
                <div>
                  <span className="text-muted-foreground">Programa: </span>
                  {hoja.programa?.name}
                </div>
                <div>
                  <span className="text-muted-foreground">Profesional: </span>
                  {hoja.profesional_nombre}
                </div>
                <div>
                  <span className="text-muted-foreground">Apertura: </span>
                  {new Date(hoja.fecha_apertura).toLocaleDateString("es-ES")}
                </div>
              </section>

              <section className="mt-6" aria-label="Intervenciones">
                <div className="text-sm font-medium mb-2">
                  Intervenciones ({intervenciones.length})
                </div>
                <ul className="space-y-2" aria-label="Lista de intervenciones">
                  {intervenciones.map((iv) => (
                    <li key={iv.id} className="border rounded p-2 text-sm">
                      <div className="font-medium">
                        {new Date(iv.fecha).toLocaleDateString("es-ES")}{" "}
                        · {iv.tipo_slug}
                        {iv.institucion_snapshot?.nombre
                          ? ` · ${iv.institucion_snapshot.nombre}`
                          : ""}
                      </div>
                      <div className="mt-1">{iv.descripcion}</div>
                      {iv.observaciones && (
                        <div className="mt-1 text-muted-foreground">
                          {iv.observaciones}
                        </div>
                      )}
                      <div className="mt-1 text-xs text-muted-foreground">
                        {iv.firmado_url ? "Firmada" : "Pendiente de firma"}
                      </div>
                    </li>
                  ))}
                  {intervenciones.length === 0 && (
                    <li className="text-sm text-muted-foreground">
                      Sin intervenciones todavía
                    </li>
                  )}
                </ul>
              </section>

              <div className="mt-6 flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={() => onAddIntervention(hojaId)}
                >
                  <Plus className="h-4 w-4 mr-1" aria-hidden="true" />
                  Añadir intervención
                </Button>
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => void handleGenerateClick("docx")}
                  disabled={busy !== null}
                  aria-busy={busy === "docx"}
                >
                  <FileText className="h-4 w-4 mr-1" aria-hidden="true" />
                  {busy === "docx" ? "Generando..." : "Generar Word"}
                </Button>
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => void handleGenerateClick("pdf")}
                  disabled={busy !== null}
                  aria-busy={busy === "pdf"}
                >
                  <FileDown className="h-4 w-4 mr-1" aria-hidden="true" />
                  {busy === "pdf" ? "Generando..." : "Generar PDF"}
                </Button>
                <Button
                  variant="outline"
                  type="button"
                  disabled
                  title="Subir hoja firmada — próximamente"
                >
                  <Upload className="h-4 w-4 mr-1" aria-hidden="true" />
                  Subir hoja firmada
                </Button>
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => setTemplateModalOpen(true)}
                  title="Gestionar plantilla DOCX"
                  aria-label="Cambiar plantilla"
                >
                  <Settings className="h-4 w-4 mr-1" aria-hidden="true" />
                  Cambiar plantilla
                </Button>
              </div>
            </>
          ) : (
            <div className="mt-6 text-muted-foreground">Hoja no encontrada.</div>
          )}
        </SheetContent>
      </Sheet>

      {/* Preview modal — shows PDF preview before download */}
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

          <div className="w-full" style={{ height: "60vh" }}>
            {previewLoading ? (
              <div
                className="flex items-center justify-center h-full"
                aria-label="Cargando vista previa"
              >
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <span className="ml-2 text-muted-foreground text-sm">
                  Generando vista previa…
                </span>
              </div>
            ) : previewDataUrl ? (
              <iframe
                src={previewDataUrl}
                title="Vista previa del documento"
                className="w-full h-full rounded border"
                aria-label="Vista previa PDF"
              />
            ) : null}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" type="button" onClick={onCancelPreview}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => void onConfirmGenerate()}
              disabled={previewLoading}
            >
              {previewKind === "docx" ? "Descargar Word" : "Descargar PDF"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Template management modal */}
      <Dialog
        open={templateModalOpen}
        onOpenChange={(open) => setTemplateModalOpen(open)}
      >
        <DialogContent
          className="max-w-xl w-full"
          aria-label="Gestión de plantillas"
        >
          <DialogHeader>
            <DialogTitle>Gestión de plantillas DOCX</DialogTitle>
            <DialogDescription>
              Sube una nueva plantilla DOCX para las hojas de derivaciones. La
              plantilla debe contener los marcadores de posición correctos
              (p.&nbsp;ej. {"{"}nombre{"}"}&#44; {"{"}fecha_apertura{"}"}&#44; etc.).
            </DialogDescription>
          </DialogHeader>

          {/* List of existing templates */}
          <div className="mt-2">
            <p className="text-sm font-medium mb-2">Plantillas disponibles</p>
            {listTemplatesQuery.isLoading ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : listTemplatesQuery.error ? (
              <p className="text-sm text-destructive">
                Error al cargar plantillas: {listTemplatesQuery.error.message}
              </p>
            ) : (listTemplatesQuery.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No hay plantillas disponibles.
              </p>
            ) : (
              <ul
                className="space-y-1 max-h-48 overflow-y-auto border rounded p-2"
                aria-label="Lista de plantillas"
              >
                {(listTemplatesQuery.data ?? []).map((tpl) => (
                  <li
                    key={tpl.name}
                    className="flex items-center justify-between text-sm py-1 px-1 rounded hover:bg-muted/50"
                  >
                    <span className="flex items-center gap-2 truncate">
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                      <span className="truncate" title={tpl.name}>
                        {tpl.name}
                      </span>
                    </span>
                    <span className="text-muted-foreground ml-2 shrink-0 text-xs">
                      {formatSize(tpl.size)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Upload new template */}
          <div className="mt-4 space-y-3">
            <p className="text-sm font-medium">Subir nueva plantilla</p>
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={handleFileChange}
                className="block text-sm text-muted-foreground file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer"
                aria-label="Seleccionar archivo DOCX"
                data-testid="template-file-input"
              />
            </div>
            {selectedFile && (
              <p className="text-xs text-muted-foreground">
                Archivo seleccionado:{" "}
                <span className="font-medium">{selectedFile.name}</span>{" "}
                ({formatSize(selectedFile.size)})
              </p>
            )}
            <Button
              type="button"
              onClick={() => void handleUploadTemplate()}
              disabled={!selectedFile || uploadTemplateMutation.isPending}
              aria-label="Subir plantilla"
              data-testid="upload-template-btn"
            >
              {uploadTemplateMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Subiendo…
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-1" />
                  Subir plantilla
                </>
              )}
            </Button>
          </div>

          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              type="button"
              onClick={() => setTemplateModalOpen(false)}
            >
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
