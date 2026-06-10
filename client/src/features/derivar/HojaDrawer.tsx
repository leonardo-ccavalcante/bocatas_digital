/**
 * HojaDrawer — Sheet panel displaying a full hoja with all its interventions.
 *
 * Batch 20 fixes:
 * - Preview: uses blob URL (object tag) instead of data: URL in iframe
 *   (Chrome blocks data: URLs in iframes in sandboxed contexts)
 * - Template modal: uses new listTemplates shape { templates, activeTemplate }
 * - Template modal: "Usar esta plantilla" button calls activateTemplate
 * - Template modal: "Logo secundario" section for uploading secondary logo
 * - "Subir hoja firmada" button is now enabled and functional
 * - "Excluir intervención" button on each intervention row
 * - Improved margins and spacing following UI/UX benchmarks
 * - "Añadir intervención" delegates to parent with hojaId
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
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Plus,
  FileText,
  FileDown,
  Upload,
  Loader2,
  Settings,
  CheckCircle2,
  Trash2,
  ExternalLink,
} from "lucide-react";
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
  firmado_url?: string | null;
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
  excluded_at?: string | null;
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
  // Blob URL for preview — avoids Chrome's data: URL blocking in iframes
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);

  // Template management modal state
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [selectedTemplateFile, setSelectedTemplateFile] = useState<File | null>(null);
  const [selectedLogoFile, setSelectedLogoFile] = useState<File | null>(null);
  const templateFileInputRef = useRef<HTMLInputElement>(null);
  const logoFileInputRef = useRef<HTMLInputElement>(null);

  // Exclude intervention modal state
  const [excludeIntervencionId, setExcludeIntervencionId] = useState<string | null>(null);
  const [excludeReason, setExcludeReason] = useState("");

  // Upload signed hoja modal state
  const [signedModalOpen, setSignedModalOpen] = useState(false);
  const [selectedSignedFile, setSelectedSignedFile] = useState<File | null>(null);
  const signedFileInputRef = useRef<HTMLInputElement>(null);

  // Revoke blob URL when preview modal closes
  useEffect(() => {
    if (!previewKind && previewBlobUrl) {
      URL.revokeObjectURL(previewBlobUrl);
      setPreviewBlobUrl(null);
    }
  }, [previewKind, previewBlobUrl]);

  // Reset file selections when modals close
  useEffect(() => {
    if (!templateModalOpen) {
      setSelectedTemplateFile(null);
      setSelectedLogoFile(null);
      if (templateFileInputRef.current) templateFileInputRef.current.value = "";
      if (logoFileInputRef.current) logoFileInputRef.current.value = "";
    }
  }, [templateModalOpen]);

  useEffect(() => {
    if (!signedModalOpen) {
      setSelectedSignedFile(null);
      if (signedFileInputRef.current) signedFileInputRef.current.value = "";
    }
  }, [signedModalOpen]);

  useEffect(() => {
    if (!excludeIntervencionId) {
      setExcludeReason("");
    }
  }, [excludeIntervencionId]);

  // tRPC queries/mutations for template management
  const listTemplatesQuery = trpc.derivar.listTemplates.useQuery(undefined, {
    enabled: templateModalOpen,
  });

  const uploadTemplateMutation = trpc.derivar.uploadTemplate.useMutation({
    onSuccess: (data) => {
      toast.success(data.message ?? "Plantilla subida correctamente.");
      setSelectedTemplateFile(null);
      if (templateFileInputRef.current) templateFileInputRef.current.value = "";
      void trpcCtx.derivar.listTemplates.invalidate();
    },
    onError: (err) => {
      toast.error(err.message ?? "Error al subir la plantilla.");
    },
  });

  const activateTemplateMutation = trpc.derivar.activateTemplate.useMutation({
    onSuccess: (data) => {
      toast.success(`Plantilla "${data.filename}" activada correctamente.`);
      void trpcCtx.derivar.listTemplates.invalidate();
    },
    onError: (err) => {
      toast.error(err.message ?? "Error al activar la plantilla.");
    },
  });

  const uploadSecondaryLogoMutation = trpc.derivar.uploadSecondaryLogo.useMutation({
    onSuccess: () => {
      toast.success("Logo secundario actualizado correctamente.");
      setSelectedLogoFile(null);
      if (logoFileInputRef.current) logoFileInputRef.current.value = "";
    },
    onError: (err) => {
      toast.error(err.message ?? "Error al subir el logo.");
    },
  });

  const excludeIntervencionMutation = trpc.derivar.excludeIntervention.useMutation({
    onSuccess: () => {
      toast.success("Intervención excluida correctamente.");
      setExcludeIntervencionId(null);
      void trpcCtx.derivar.getHoja.invalidate({ hojaId: hojaId ?? "" });
    },
    onError: (err) => {
      toast.error(err.message ?? "Error al excluir la intervención.");
    },
  });

  const uploadSignedHojaMutation = trpc.derivar.uploadSignedHoja.useMutation({
    onSuccess: () => {
      toast.success("Hoja firmada subida correctamente.");
      setSignedModalOpen(false);
      void trpcCtx.derivar.getHoja.invalidate({ hojaId: hojaId ?? "" });
    },
    onError: (err) => {
      toast.error(err.message ?? "Error al subir la hoja firmada.");
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

  // ── Preview ──────────────────────────────────────────────────────────────────

  const handleGenerateClick = async (kind: "docx" | "pdf") => {
    setPreviewKind(kind);
    setPreviewLoading(true);
    if (previewBlobUrl) {
      URL.revokeObjectURL(previewBlobUrl);
      setPreviewBlobUrl(null);
    }

    try {
      const preview = await trpcCtx.derivar.previewPdf.fetch({ hojaId });
      // Convert base64 to Blob, then create an object URL
      // This avoids Chrome's CSP blocking of data: URLs in iframes/objects
      const bytes = Uint8Array.from(atob(preview.contentBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      setPreviewBlobUrl(url);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Error al generar la vista previa",
      );
      setPreviewKind(null);
    } finally {
      setPreviewLoading(false);
    }
  };

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

  // ── Template management ───────────────────────────────────────────────────────

  const handleUploadTemplate = async () => {
    if (!selectedTemplateFile) return;
    const arrayBuffer = await selectedTemplateFile.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    uploadTemplateMutation.mutate({
      fileBase64: base64,
      originalName: selectedTemplateFile.name,
    });
  };

  const handleUploadSecondaryLogo = async () => {
    if (!selectedLogoFile) return;
    const arrayBuffer = await selectedLogoFile.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    const mime = selectedLogoFile.type as "image/png" | "image/jpeg";
    uploadSecondaryLogoMutation.mutate({
      fileBase64: base64,
      originalName: selectedLogoFile.name,
      mimeType: mime === "image/jpeg" ? "image/jpeg" : "image/png",
    });
  };

  // ── Signed hoja upload ────────────────────────────────────────────────────────

  const handleUploadSignedHoja = async () => {
    if (!selectedSignedFile || !hojaId) return;
    const arrayBuffer = await selectedSignedFile.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    uploadSignedHojaMutation.mutate({
      hojaId,
      fileBase64: base64,
      originalName: selectedSignedFile.name,
    });
  };

  // ── Exclude intervention ──────────────────────────────────────────────────────

  const handleExcludeConfirm = () => {
    if (!excludeIntervencionId || !excludeReason.trim()) return;
    excludeIntervencionMutation.mutate({
      intervencionId: excludeIntervencionId,
      reason: excludeReason.trim(),
    });
  };

  // ── Helpers ───────────────────────────────────────────────────────────────────

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const templates = listTemplatesQuery.data?.templates ?? [];
  const activeTemplate = listTemplatesQuery.data?.activeTemplate ?? null;

  return (
    <>
      <Sheet open={enabled} onOpenChange={(open) => !open && onClose()}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-2xl overflow-y-auto px-6 py-6"
          aria-label="Hoja de derivaciones"
        >
          <SheetHeader className="mb-6">
            <SheetTitle className="text-xl font-semibold">
              {result.isLoading ? (
                <Skeleton className="h-6 w-64" />
              ) : (
                "Hoja de derivaciones"
              )}
            </SheetTitle>
          </SheetHeader>

          {result.isLoading ? (
            <div className="space-y-3 mt-2" aria-busy="true">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : hoja ? (
            <>
              {/* Header info */}
              <section
                className="bg-muted/40 rounded-lg px-4 py-3 space-y-1.5 text-sm mb-6"
                aria-label="Datos del expediente"
              >
                <div className="font-semibold text-base mb-1">{nombre}</div>
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-muted-foreground">
                  <span>
                    <span className="font-medium text-foreground">Programa:</span>{" "}
                    {hoja.programa?.name}
                  </span>
                  <span>
                    <span className="font-medium text-foreground">Profesional:</span>{" "}
                    {hoja.profesional_nombre}
                  </span>
                  <span>
                    <span className="font-medium text-foreground">Apertura:</span>{" "}
                    {new Date(hoja.fecha_apertura).toLocaleDateString("es-ES")}
                  </span>
                </div>
                {hoja.firmado_url && (
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-green-700 border-green-300 bg-green-50">
                      Firmada
                    </Badge>
                    <a
                      href={hoja.firmado_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary flex items-center gap-1 hover:underline"
                    >
                      Ver hoja firmada <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}
              </section>

              {/* Interventions list */}
              <section className="mb-6" aria-label="Intervenciones">
                <div className="text-sm font-semibold mb-3 flex items-center gap-2">
                  Intervenciones
                  <Badge variant="secondary">{intervenciones.length}</Badge>
                </div>
                <ul className="space-y-2" aria-label="Lista de intervenciones">
                  {intervenciones.map((iv) => (
                    <li
                      key={iv.id}
                      className="border rounded-lg px-4 py-3 text-sm bg-card"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-xs text-muted-foreground mb-1">
                            {new Date(iv.fecha).toLocaleDateString("es-ES")}{" "}
                            · <span className="uppercase tracking-wide">{iv.tipo_slug}</span>
                            {iv.institucion_snapshot?.nombre
                              ? ` · ${iv.institucion_snapshot.nombre}`
                              : ""}
                          </div>
                          <div className="text-sm leading-snug">{iv.descripcion}</div>
                          {iv.observaciones && (
                            <div className="mt-1 text-xs text-muted-foreground">
                              {iv.observaciones}
                            </div>
                          )}
                          <div className="mt-1.5">
                            <Badge
                              variant={iv.firmado_url ? "outline" : "secondary"}
                              className={
                                iv.firmado_url
                                  ? "text-green-700 border-green-300 bg-green-50 text-xs"
                                  : "text-xs"
                              }
                            >
                              {iv.firmado_url ? "Firmada" : "Pendiente de firma"}
                            </Badge>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                          title="Excluir intervención"
                          aria-label="Excluir intervención"
                          onClick={() => setExcludeIntervencionId(iv.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </li>
                  ))}
                  {intervenciones.length === 0 && (
                    <li className="text-sm text-muted-foreground py-4 text-center border rounded-lg">
                      Sin intervenciones todavía
                    </li>
                  )}
                </ul>
              </section>

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2 pt-2 border-t">
                <Button
                  type="button"
                  onClick={() => onAddIntervention(hojaId)}
                  className="gap-1"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Añadir intervención
                </Button>
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => void handleGenerateClick("docx")}
                  disabled={busy !== null}
                  aria-busy={busy === "docx"}
                  className="gap-1"
                >
                  <FileText className="h-4 w-4" aria-hidden="true" />
                  {busy === "docx" ? "Generando..." : "Generar Word"}
                </Button>
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => void handleGenerateClick("pdf")}
                  disabled={busy !== null}
                  aria-busy={busy === "pdf"}
                  className="gap-1"
                >
                  <FileDown className="h-4 w-4" aria-hidden="true" />
                  {busy === "pdf" ? "Generando..." : "Generar PDF"}
                </Button>
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => setSignedModalOpen(true)}
                  className="gap-1"
                  title="Subir hoja firmada en PDF"
                >
                  <Upload className="h-4 w-4" aria-hidden="true" />
                  Subir hoja firmada
                </Button>
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => setTemplateModalOpen(true)}
                  title="Gestionar plantilla DOCX"
                  aria-label="Cambiar plantilla"
                  className="gap-1"
                >
                  <Settings className="h-4 w-4" aria-hidden="true" />
                  Cambiar plantilla
                </Button>
              </div>
            </>
          ) : (
            <div className="mt-6 text-muted-foreground text-center py-8">
              Hoja no encontrada.
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* ── Preview modal ─────────────────────────────────────────────────────── */}
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

      {/* ── Template management modal ─────────────────────────────────────────── */}
      <Dialog
        open={templateModalOpen}
        onOpenChange={(open) => setTemplateModalOpen(open)}
      >
        <DialogContent
          className="max-w-xl w-full max-h-[90vh] overflow-y-auto"
          aria-label="Gestión de plantillas"
        >
          <DialogHeader>
            <DialogTitle>Gestión de plantillas DOCX</DialogTitle>
            <DialogDescription>
              Gestiona la plantilla activa y el logo secundario para las hojas de derivaciones.
            </DialogDescription>
          </DialogHeader>

          {/* List of existing templates */}
          <div className="mt-2">
            <p className="text-sm font-semibold mb-2">Plantillas disponibles</p>
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
            ) : templates.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No hay plantillas disponibles.
              </p>
            ) : (
              <ul
                className="space-y-1 max-h-48 overflow-y-auto border rounded-lg p-2"
                aria-label="Lista de plantillas"
              >
                {templates.map((tpl) => (
                  <li
                    key={tpl.name}
                    className="flex items-center justify-between text-sm py-1.5 px-2 rounded hover:bg-muted/50"
                  >
                    <span className="flex items-center gap-2 truncate min-w-0">
                      {tpl.isActive ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                      ) : (
                        <div className="h-3.5 w-3.5 rounded-full border border-muted-foreground/30 shrink-0" />
                      )}
                      <span className="truncate" title={tpl.name}>
                        {tpl.name}
                      </span>
                      {tpl.isActive && (
                        <Badge variant="outline" className="text-green-700 border-green-300 bg-green-50 text-xs shrink-0">
                          Activa
                        </Badge>
                      )}
                    </span>
                    <div className="flex items-center gap-2 ml-2 shrink-0">
                      <span className="text-muted-foreground text-xs">
                        {formatSize(tpl.size)}
                      </span>
                      {!tpl.isActive && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 text-xs px-2"
                          onClick={() => activateTemplateMutation.mutate({ filename: tpl.name })}
                          disabled={activateTemplateMutation.isPending}
                          aria-label={`Usar plantilla ${tpl.name}`}
                        >
                          Usar esta
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Upload new template */}
          <div className="mt-4 space-y-2 border-t pt-4">
            <p className="text-sm font-semibold">Subir nueva plantilla (.docx)</p>
            <div className="flex items-center gap-2">
              <input
                ref={templateFileInputRef}
                type="file"
                accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(e) => setSelectedTemplateFile(e.target.files?.[0] ?? null)}
                className="block text-sm text-muted-foreground file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer"
                aria-label="Seleccionar archivo DOCX"
                data-testid="template-file-input"
              />
            </div>
            {selectedTemplateFile && (
              <p className="text-xs text-muted-foreground">
                Seleccionado:{" "}
                <span className="font-medium">{selectedTemplateFile.name}</span>{" "}
                ({formatSize(selectedTemplateFile.size)})
              </p>
            )}
            <Button
              type="button"
              size="sm"
              onClick={() => void handleUploadTemplate()}
              disabled={!selectedTemplateFile || uploadTemplateMutation.isPending}
              aria-label="Subir plantilla"
              data-testid="upload-template-btn"
            >
              {uploadTemplateMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Subiendo…</>
              ) : (
                <><Upload className="h-4 w-4 mr-1" />Subir plantilla</>
              )}
            </Button>
          </div>

          {/* Secondary logo upload */}
          <div className="mt-4 space-y-2 border-t pt-4">
            <p className="text-sm font-semibold">Logo secundario (Comunidad de Madrid)</p>
            <p className="text-xs text-muted-foreground">
              Sube una imagen PNG o JPEG que se usará como logo secundario en el documento.
            </p>
            <div className="flex items-center gap-2">
              <input
                ref={logoFileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg"
                onChange={(e) => setSelectedLogoFile(e.target.files?.[0] ?? null)}
                className="block text-sm text-muted-foreground file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer"
                aria-label="Seleccionar logo secundario"
                data-testid="logo-file-input"
              />
            </div>
            {selectedLogoFile && (
              <p className="text-xs text-muted-foreground">
                Seleccionado:{" "}
                <span className="font-medium">{selectedLogoFile.name}</span>{" "}
                ({formatSize(selectedLogoFile.size)})
              </p>
            )}
            <Button
              type="button"
              size="sm"
              onClick={() => void handleUploadSecondaryLogo()}
              disabled={!selectedLogoFile || uploadSecondaryLogoMutation.isPending}
              aria-label="Subir logo secundario"
              data-testid="upload-logo-btn"
            >
              {uploadSecondaryLogoMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Subiendo…</>
              ) : (
                <><Upload className="h-4 w-4 mr-1" />Subir logo</>
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

      {/* ── Upload signed hoja modal ──────────────────────────────────────────── */}
      <Dialog
        open={signedModalOpen}
        onOpenChange={(open) => setSignedModalOpen(open)}
      >
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
            <Button variant="outline" type="button" onClick={() => setSignedModalOpen(false)}>
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

      {/* ── Exclude intervention confirmation modal ───────────────────────────── */}
      <Dialog
        open={excludeIntervencionId !== null}
        onOpenChange={(open) => !open && setExcludeIntervencionId(null)}
      >
        <DialogContent className="max-w-md w-full" aria-label="Excluir intervención">
          <DialogHeader>
            <DialogTitle>Excluir intervención</DialogTitle>
            <DialogDescription>
              Esta acción excluirá la intervención del documento. Se guardará un registro de auditoría.
              Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-2 space-y-2">
            <Label htmlFor="exclude-reason">Motivo de exclusión *</Label>
            <Textarea
              id="exclude-reason"
              value={excludeReason}
              onChange={(e) => setExcludeReason(e.target.value)}
              placeholder="Indica el motivo por el que se excluye esta intervención..."
              rows={3}
              aria-required="true"
              data-testid="exclude-reason-input"
            />
          </div>

          <DialogFooter className="gap-2 mt-4">
            <Button
              variant="outline"
              type="button"
              onClick={() => setExcludeIntervencionId(null)}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              type="button"
              onClick={handleExcludeConfirm}
              disabled={!excludeReason.trim() || excludeIntervencionMutation.isPending}
              data-testid="confirm-exclude-btn"
            >
              {excludeIntervencionMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Excluyendo…</>
              ) : (
                "Confirmar exclusión"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
