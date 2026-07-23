/**
 * SessionDocumentUpload.tsx — Upload control for a single session document.
 *
 * Replaces the static "Sube el archivo tras cerrar" stub in SesionCloseFormFields.
 * Used on BOTH the staff (SesionScreen) and public (EnlaceSessionView) paths.
 *
 * Two upload modes (Dialog with Tabs):
 *   Subir archivo  — file picker → base64 → upload mutation
 *   Foto → texto   — photo/capture → OCR → editable markdown textarea → save
 *
 * Auth routing:
 *   token absent  → authed mutations (uploadSessionDocument / extractLessonPlan)
 *   token present → public token-gated mutations (enlaceUploadSessionDocument / enlaceExtractLessonPlan)
 *
 * Mobile-first + WCAG AA: capture="environment" on the photo input, aria-live
 * for upload result, min 44×44px touch targets.
 */
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle2, FileUp, Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import type { CloseUpload } from "@shared/sessionSchemas";

interface SessionDocumentUploadProps {
  upload: CloseUpload;
  sessionId: string;
  token?: string;
  isUploaded: boolean;
  onUploaded: () => void;
}

function utf8ToBase64(text: string): string {
  return btoa(
    encodeURIComponent(text).replace(/%([0-9A-F]{2})/g, (_, p1: string) =>
      String.fromCharCode(parseInt(p1, 16))
    )
  );
}

/**
 * FIX 4: Infer MIME from filename extension when Android content providers
 * report '' or 'application/octet-stream' for known file types.
 * The server performs the same inference as defense-in-depth.
 */
function inferMime(type: string, name: string): string {
  if (type && type !== "application/octet-stream") return type;
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const MAP: Record<string, string> = {
    pdf: "application/pdf", png: "image/png", jpg: "image/jpeg",
    jpeg: "image/jpeg", webp: "image/webp", md: "text/markdown", txt: "text/plain",
  };
  return MAP[ext] ?? type;
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function SessionDocumentUpload({
  upload, sessionId, token, isUploaded, onUploaded,
}: SessionDocumentUploadProps) {
  const [open, setOpen] = useState(false);
  const [ocrText, setOcrText] = useState("");
  const [ocrDone, setOcrDone] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  function invalidateDocs() {
    void utils.programs.sessionDocuments.getSessionDocuments.invalidate({ sessionId });
  }

  function handleSuccess() {
    onUploaded();
    invalidateDocs();
    setOpen(false);
    toast.success("Documento subido correctamente");
  }

  function handleError(err: { message?: string }) {
    toast.error("Error al subir documento", { description: err.message });
  }

  const uploadAuth = trpc.programs.sessionDocuments.uploadSessionDocument.useMutation({
    onSuccess: handleSuccess,
    onError: handleError,
  });
  const uploadEnlace = trpc.programs.sessionDocuments.enlaceUploadSessionDocument.useMutation({
    onSuccess: handleSuccess,
    onError: handleError,
  });
  const ocrAuth = trpc.programs.sessionDocuments.extractLessonPlan.useMutation({
    onSuccess: (data) => {
      setOcrText(data.texto);
      setOcrDone(true);
    },
    onError: () => {
      toast.error("No se pudo extraer el texto. Puedes escribirlo manualmente.");
      setOcrDone(true);
    },
  });
  const ocrEnlace = trpc.programs.sessionDocuments.enlaceExtractLessonPlan.useMutation({
    onSuccess: (data) => {
      setOcrText(data.texto);
      setOcrDone(true);
    },
    onError: () => {
      toast.error("No se pudo extraer el texto. Puedes escribirlo manualmente.");
      setOcrDone(true);
    },
  });

  const isPending = uploadAuth.isPending || uploadEnlace.isPending
    || ocrAuth.isPending || ocrEnlace.isPending;

  function triggerUpload(base64File: string, mimeType: string, fileName: string) {
    if (token) {
      uploadEnlace.mutate({
        sessionId, token, tipoSlug: upload.slug, base64File, mimeType, fileName,
      });
    } else {
      uploadAuth.mutate({
        sessionId, tipoSlug: upload.slug, base64File, mimeType, fileName,
      });
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const base64 = await fileToBase64(file);
    // FIX 4: Infer MIME from extension when Android reports '' or octet-stream.
    const mimeType = inferMime(file.type, file.name);
    triggerUpload(base64, mimeType, file.name);
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const base64 = await fileToBase64(file);
    // FIX 4: Apply same inference for camera captures on Android.
    const mimeType = inferMime(file.type, file.name);
    if (token) {
      ocrEnlace.mutate({ sessionId, token, base64Image: base64, mimeType });
    } else {
      ocrAuth.mutate({ base64Image: base64, mimeType });
    }
  }

  function handleSaveText() {
    if (!ocrText.trim()) {
      toast.error("El texto está vacío");
      return;
    }
    const base64 = utf8ToBase64(ocrText);
    triggerUpload(base64, "text/markdown", `${upload.slug}.md`);
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-sm">
        <div className="flex items-center gap-2 min-w-0">
          {isUploaded ? (
            <CheckCircle2
              className="h-4 w-4 text-emerald-600 shrink-0"
              aria-hidden="true"
            />
          ) : (
            <FileUp className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
          )}
          <span className={isUploaded ? "text-emerald-700 dark:text-emerald-400 font-medium" : "text-muted-foreground"}>
            {upload.label}
            {upload.obligatorio && !isUploaded && (
              <span className="text-destructive ml-1 font-medium" aria-hidden="true">*</span>
            )}
          </span>
        </div>
        <Button
          type="button"
          size="sm"
          variant={isUploaded ? "ghost" : "outline"}
          className="text-xs shrink-0 min-h-[36px] min-w-[80px]"
          onClick={() => { setOcrText(""); setOcrDone(false); setOpen(true); }}
          aria-label={
            isUploaded
              ? `Resubir ${upload.label}`
              : `Subir ${upload.label}`
          }
        >
          {isUploaded ? "Resubir" : "Subir"}
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{upload.label}</DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="file">
            <TabsList className="w-full">
              <TabsTrigger value="file" className="flex-1">
                Subir archivo
              </TabsTrigger>
              <TabsTrigger value="photo" className="flex-1">
                Foto → texto
              </TabsTrigger>
            </TabsList>

            <TabsContent value="file" className="space-y-3 pt-2">
              <p className="text-xs text-muted-foreground">
                Selecciona un archivo PDF o imagen desde tu dispositivo.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,image/png,image/jpeg,image/webp"
                className="sr-only"
                aria-label={`Seleccionar archivo para ${upload.label}`}
                onChange={handleFileChange}
              />
              <Button
                type="button"
                className="w-full min-h-[44px]"
                disabled={isPending}
                onClick={() => fileInputRef.current?.click()}
                aria-label={`Seleccionar archivo para ${upload.label}`}
              >
                {isPending
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />Subiendo...</>
                  : <><FileUp className="h-4 w-4 mr-2" aria-hidden="true" />Elegir archivo</>
                }
              </Button>
            </TabsContent>

            <TabsContent value="photo" className="space-y-3 pt-2">
              <p className="text-xs text-muted-foreground">
                Saca una foto del plan escrito o impreso. El sistema extraerá el texto automáticamente.
              </p>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                aria-label={`Capturar foto para ${upload.label}`}
                onChange={handlePhotoChange}
              />
              {!ocrDone && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full min-h-[44px]"
                  disabled={isPending}
                  onClick={() => photoInputRef.current?.click()}
                  aria-label="Sacar o subir foto del plan"
                >
                  {ocrAuth.isPending || ocrEnlace.isPending
                    ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />Extrayendo texto...</>
                    : <><Camera className="h-4 w-4 mr-2" aria-hidden="true" />Sacar/subir foto</>
                  }
                </Button>
              )}
              {ocrDone && (
                <div className="space-y-2">
                  <Label htmlFor="ocr-text">Texto extraído (revisa y corrige)</Label>
                  <Textarea
                    id="ocr-text"
                    value={ocrText}
                    onChange={(e) => setOcrText(e.target.value)}
                    rows={6}
                    placeholder="Aquí aparecerá el texto del plan extraído..."
                    aria-label="Texto del plan de clase extraído"
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      disabled={isPending}
                      onClick={() => { setOcrDone(false); photoInputRef.current?.click(); }}
                    >
                      Nueva foto
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="flex-1 min-h-[36px]"
                      disabled={isPending || !ocrText.trim()}
                      onClick={handleSaveText}
                      aria-label="Guardar el texto del plan de clase"
                    >
                      {isPending ? "Guardando..." : "Guardar plan"}
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
}
