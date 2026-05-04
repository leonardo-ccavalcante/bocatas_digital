import { useRef, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Upload, Download, Calendar, User } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getSignedDocUrl } from "@/features/families/utils/signedUrl";
import {
  useUploadFamilyDocument,
  useFamilyLevelDocuments,
  useMemberLevelDocuments,
  useAllFamilyDocuments,
  useDeleteFamilyDocument,
} from "@/features/families/hooks/useFamilias";
import { FAMILIA_DOCS_CONFIG } from "@/features/families/constants";
import type { FamilyDocType } from "@shared/familyDocuments";

// ─── Props ────────────────────────────────────────────────────────────────────

interface DocumentUploadModalProps {
  familyId: string;
  documentoTipo: FamilyDocType;
  memberIndex: number; // -1 for family-level; 0+ for per-member
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function labelFor(tipo: FamilyDocType): string {
  return FAMILIA_DOCS_CONFIG.find((d) => d.key === tipo)?.label ?? tipo;
}

function extFromFile(file: File): string {
  const fromName = file.name.split(".").pop();
  if (fromName) return fromName.toLowerCase();
  if (file.type === "application/pdf") return "pdf";
  if (file.type.startsWith("image/")) return file.type.split("/")[1] ?? "jpg";
  return "bin";
}

/**
 * Compress an image file to reduce upload size.
 * Returns a Blob with JPEG compression at 0.8 quality.
 * Inlined from DocumentPhotoCapture.tsx (not exported from that module).
 */
async function compressImage(file: File, maxDimension = 1920): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      let { width, height } = img;
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas context unavailable"));
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error("Compression failed"));
          resolve(blob);
        },
        "image/jpeg",
        0.8
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image load failed"));
    };
    img.src = url;
  });
}

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const STORAGE_BUCKET = "family-documents";

// ─── Component ────────────────────────────────────────────────────────────────

export function DocumentUploadModal({
  familyId,
  documentoTipo,
  memberIndex,
  open,
  onOpenChange,
}: DocumentUploadModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const { user } = useAuth();

  // ── Queries ──────────────────────────────────────────────────────────────
  const familyLevelQuery = useFamilyLevelDocuments(familyId);
  const memberLevelQuery = useMemberLevelDocuments(familyId, memberIndex);
  const allDocsQuery = useAllFamilyDocuments(familyId);

  // ── Mutations ─────────────────────────────────────────────────────────────
  const uploadMutation = useUploadFamilyDocument();
  const deleteMutation = useDeleteFamilyDocument(familyId);

  // ── Derived state ─────────────────────────────────────────────────────────
  const docRows = memberIndex === -1
    ? (familyLevelQuery.data ?? [])
    : (memberLevelQuery.data ?? []);

  const currentDoc = docRows.find(
    (d) => d.documento_tipo === documentoTipo && d.is_current
  );

  const allRows = allDocsQuery.data ?? [];
  const historyRows = allRows.filter(
    (d) =>
      d.documento_tipo === documentoTipo &&
      d.member_index === memberIndex &&
      !d.is_current
  );

  // ── Upload handler ────────────────────────────────────────────────────────
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_FILE_BYTES) {
      toast.error("Archivo supera el límite de 10 MB");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setIsUploading(true);

    try {
      const isImage = file.type.startsWith("image/");
      let blob: Blob;
      let contentType: string;

      if (isImage) {
        blob = await compressImage(file, 1920);
        contentType = "image/jpeg";
      } else {
        blob = file;
        contentType = file.type || "application/pdf";
      }

      const ext = isImage ? "jpg" : extFromFile(file);
      const storagePath = `${familyId}/${memberIndex}/${documentoTipo}/${Date.now()}.${ext}`;

      // The family-documents bucket is private. We store the storage PATH (not a URL)
      // so we can re-sign on demand at view time via getSignedDocUrl.
      const supabase = createClient();

      // 1. DB row first — if this fails nothing hits Storage, no orphan PII.
      const insertedDoc = await uploadMutation.mutateAsync({
        family_id: familyId,
        member_index: memberIndex,
        documento_tipo: documentoTipo,
        documento_url: storagePath,
        // verified_by is set server-side from ctx.user
      });

      // 2. Storage upload — if this fails, await the soft-delete to roll back.
      const { error: storageError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, blob, { contentType, upsert: false });

      if (storageError) {
        try {
          await deleteMutation.mutateAsync({ id: insertedDoc.id });
        } catch {
          toast.error(
            `Error al subir archivo y al limpiar el registro. Contacta al admin con ID: ${insertedDoc.id}`
          );
          return;
        }
        toast.error(storageError.message || "Error al subir el archivo");
        return;
      }

      toast.success("Documento subido");
      onOpenChange(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error inesperado";
      toast.error(msg);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleReplace = () => {
    fileInputRef.current?.click();
  };

  const handleDelete = (id: string) => {
    deleteMutation.mutate({ id });
  };

  const isBusy = isUploading || uploadMutation.isPending || deleteMutation.isPending;
  const title = `Gestionar documento: ${labelFor(documentoTipo)}`;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Upload Area */}
          <div className="border-2 border-dashed rounded-lg p-6 text-center hover:bg-muted/50 transition">
            <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" aria-hidden="true" />
            <Label className="cursor-pointer">
              <span className="text-sm font-medium">Haz clic para cargar un archivo</span>
              <Input
                ref={fileInputRef}
                type="file"
                accept="application/pdf, image/*"
                className="hidden"
                onChange={handleFileChange}
                disabled={isBusy}
                aria-label={`Cargar archivo para ${labelFor(documentoTipo)}`}
              />
            </Label>
            <p className="text-xs text-muted-foreground mt-2">PDF, JPG, PNG (máx 10 MB)</p>
            {isBusy && (
              <p className="text-xs text-muted-foreground mt-1 animate-pulse">Subiendo...</p>
            )}
          </div>

          {/* Current Document */}
          {currentDoc?.documento_url && (
            <div className="p-4 border rounded-lg bg-green-50 dark:bg-green-950">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-sm text-green-900 dark:text-green-100">
                    Documento actual
                  </p>
                  <p className="text-xs text-green-700 dark:text-green-300 mt-1 truncate">
                    {currentDoc.documento_url.split("/").pop()}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    className="text-green-600 hover:text-green-700 dark:text-green-400"
                    aria-label="Ver documento actual"
                    onClick={async () => {
                      const url = await getSignedDocUrl(currentDoc.documento_url);
                      if (url) window.open(url, "_blank", "noopener,noreferrer");
                      else toast.error("No se pudo generar el enlace");
                    }}
                  >
                    <Download className="w-4 h-4" />
                  </button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleReplace}
                    disabled={isBusy}
                  >
                    Reemplazar
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDelete(currentDoc.id)}
                    disabled={isBusy}
                  >
                    Eliminar
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Audit History — previous versions */}
          {historyRows.length > 0 && (
            <div>
              <h3 className="font-semibold text-sm mb-3">Versiones anteriores</h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {historyRows.map((record) => (
                  <div
                    key={record.id}
                    className="p-3 border rounded-lg hover:bg-muted/50 transition"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                          {record.fecha_upload && (
                            <div className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" aria-hidden="true" />
                              {new Date(record.fecha_upload).toLocaleString("es-ES")}
                            </div>
                          )}
                          {record.verified_by && (
                            <div className="flex items-center gap-1">
                              <User className="w-3 h-3" aria-hidden="true" />
                              {record.verified_by}
                            </div>
                          )}
                        </div>
                        {record.documento_url && (
                          <button
                            type="button"
                            className="text-xs text-primary hover:underline mt-2 inline-block"
                            onClick={async () => {
                              const url = await getSignedDocUrl(record.documento_url);
                              if (url) window.open(url, "_blank", "noopener,noreferrer");
                              else toast.error("No se pudo generar el enlace");
                            }}
                          >
                            Ver →
                          </button>
                        )}
                      </div>
                      <Badge variant="outline" className="ml-2 shrink-0">
                        Versión anterior
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
