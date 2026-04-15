import { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Loader2, Camera, CheckCircle, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import type { ConsentTemplate } from "../schemas";
import { compressImage, base64ToBlob } from "../utils/imageUtils";

const CONSENT_PURPOSE_LABELS: Record<string, string> = {
  tratamiento_datos_bocatas: "Tratamiento de datos — Bocatas",
  tratamiento_datos_banco_alimentos: "Tratamiento de datos — Banco de Alimentos",
  compartir_datos_red: "Compartir datos en red",
  comunicaciones_whatsapp: "Comunicaciones por WhatsApp",
  fotografia: "Uso de fotografía",
};

interface ConsentModalProps {
  open: boolean;
  personId: string;
  templates: ConsentTemplate[];
  onClose: () => void;
  onSaved: () => void;
}

interface ConsentState {
  granted: boolean;
  documentoFotoUrl?: string;
}

export function ConsentModal({ open, personId, templates, onClose, onSaved }: ConsentModalProps) {
  const supabase = createClient();
  const [consents, setConsents] = useState<Record<string, ConsentState>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [captureForPurpose, setCaptureForPurpose] = useState<string | null>(null);
  const fileInputRef = { current: null as HTMLInputElement | null };

  const toggleConsent = useCallback((purpose: string) => {
    setConsents((prev) => ({
      ...prev,
      [purpose]: { ...prev[purpose], granted: !(prev[purpose]?.granted ?? false) },
    }));
  }, []);

  const handleDocumentCapture = useCallback(async (purpose: string, file: File) => {
    try {
      const base64 = await compressImage(file, 1200, 0.85);
      const blob = base64ToBlob(base64);
      const path = `${personId}/${purpose}-${Date.now()}.jpg`;
      const { data, error } = await supabase.storage
        .from("documentos-consentimiento")
        .upload(path, blob, { contentType: "image/jpeg", upsert: true });

      if (error || !data) throw error ?? new Error("Upload failed");

      const { data: urlData } = supabase.storage
        .from("documentos-consentimiento")
        .getPublicUrl(data.path);

      setConsents((prev) => ({
        ...prev,
        [purpose]: { ...prev[purpose], documentoFotoUrl: urlData.publicUrl },
      }));
      toast.success("Documento de consentimiento subido");
    } catch {
      toast.error("Error al subir el documento de consentimiento");
    }
    setCaptureForPurpose(null);
  }, [personId, supabase]);

  const handleSave = useCallback(async () => {
    const grantedTemplates = templates.filter((t) => consents[t.purpose]?.granted);
    if (grantedTemplates.length === 0) {
      toast.info("No hay consentimientos seleccionados");
      return;
    }

    setIsSaving(true);
    try {
      const rows = grantedTemplates.map((t) => ({
        person_id: personId,
        purpose: t.purpose,
        idioma: t.idioma,
        granted: true,
        granted_at: new Date().toISOString(),
        consent_text: t.text_content,
        consent_version: t.version,
        documento_foto_url: consents[t.purpose]?.documentoFotoUrl ?? null,
      }));

      const { error } = await supabase
        .from("consents")
        .upsert(rows, { onConflict: "person_id,purpose" });

      if (error) throw error;

      toast.success(`${grantedTemplates.length} consentimiento(s) guardado(s)`);
      onSaved();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      toast.error(`Error al guardar consentimientos: ${msg}`);
    } finally {
      setIsSaving(false);
    }
  }, [templates, consents, personId, supabase, onSaved, onClose]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-[95vw] md:max-w-lg">
        <DialogHeader>
          <DialogTitle>Consentimientos RGPD</DialogTitle>
          <DialogDescription>
            Selecciona los consentimientos que la persona otorga. Puedes adjuntar una foto del documento firmado.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh] pr-2">
          <div className="space-y-4">
            {templates.length === 0 && (
              <div className="flex items-center gap-2 rounded-md bg-muted p-3 text-sm text-muted-foreground">
                <AlertCircle className="h-4 w-4 shrink-0" />
                No hay plantillas de consentimiento activas para este idioma.
              </div>
            )}
            {templates.map((t) => {
              const state = consents[t.purpose];
              return (
                <div key={t.purpose} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id={`consent-${t.purpose}`}
                      checked={state?.granted ?? false}
                      onCheckedChange={() => toggleConsent(t.purpose)}
                      className="mt-0.5"
                    />
                    <div className="flex-1 space-y-1">
                      <Label htmlFor={`consent-${t.purpose}`} className="cursor-pointer font-medium">
                        {CONSENT_PURPOSE_LABELS[t.purpose] ?? t.purpose}
                      </Label>
                      <Badge variant="outline" className="text-xs">{t.idioma.toUpperCase()} · v{t.version}</Badge>
                      <p className="text-xs text-muted-foreground line-clamp-3">{t.text_content}</p>
                    </div>
                  </div>

                  {/* Document capture for this consent */}
                  {state?.granted && (
                    <div className="ml-7 flex items-center gap-2">
                      {state.documentoFotoUrl ? (
                        <div className="flex items-center gap-2 text-xs text-green-600">
                          <CheckCircle className="h-3.5 w-3.5" />
                          Documento adjunto
                        </div>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => setCaptureForPurpose(t.purpose)}
                        >
                          <Camera className="mr-1 h-3 w-3" />
                          Adjuntar documento firmado
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>

        {/* Hidden file input for document capture */}
        <input
          ref={(el) => { fileInputRef.current = el; }}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file && captureForPurpose) {
              await handleDocumentCapture(captureForPurpose, file);
            }
            if (fileInputRef.current) fileInputRef.current.value = "";
          }}
        />

        {/* Trigger file input when captureForPurpose is set */}
        {captureForPurpose && (
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={() => fileInputRef.current?.click()}
            >
              <Camera className="mr-1 h-4 w-4" />
              Seleccionar imagen
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setCaptureForPurpose(null)}
            >
              Cancelar
            </Button>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Guardando...</>
            ) : (
              "Guardar consentimientos"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
