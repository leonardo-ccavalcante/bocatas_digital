/**
 * TemplateManagementModal — manages DOCX templates and secondary logo
 * for hoja de derivaciones documents.
 *
 * Self-contained: owns its own file-selection state, tRPC queries/mutations,
 * and handlers. The parent only controls open/onOpenChange.
 */

import { useState, useEffect, useRef } from "react";
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
import { Upload, Loader2, CheckCircle2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export interface TemplateManagementModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function TemplateManagementModal({
  open,
  onOpenChange,
}: TemplateManagementModalProps) {
  const trpcCtx = trpc.useUtils();

  const [selectedTemplateFile, setSelectedTemplateFile] = useState<File | null>(null);
  const [selectedLogoFile, setSelectedLogoFile] = useState<File | null>(null);
  const templateFileInputRef = useRef<HTMLInputElement>(null);
  const logoFileInputRef = useRef<HTMLInputElement>(null);

  // Reset file selections when modal closes
  useEffect(() => {
    if (!open) {
      setSelectedTemplateFile(null);
      setSelectedLogoFile(null);
      if (templateFileInputRef.current) templateFileInputRef.current.value = "";
      if (logoFileInputRef.current) logoFileInputRef.current.value = "";
    }
  }, [open]);

  const listTemplatesQuery = trpc.derivar.listTemplates.useQuery(undefined, {
    enabled: open,
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

  const templates = listTemplatesQuery.data?.templates ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
            onClick={() => onOpenChange(false)}
          >
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
