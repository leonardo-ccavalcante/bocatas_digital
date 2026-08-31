import { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Loader2, Camera, CheckCircle, AlertCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import type { ConsentTemplate } from "../schemas";
import { TEMPLATE_LANGUAGES } from "./RegistrationWizard/_shared";
import { compressImage } from "../utils/imageUtils";
import { useSavedConsents, describeConsentSignature } from "../hooks/usePersonConsents";
import { CONSENT_PURPOSE_LABELS } from "../schemas";

interface ConsentModalProps {
  open: boolean;
  personId: string;
  templates: ConsentTemplate[];
  onClose: () => void;
  onSaved: () => void;
  /**
   * Phase B.5 — beneficiary's primary language (idioma). Used by tests + future
   * fallback flow to detect when no template matches and show the verbal-translation
   * banner. Optional: existing call sites pass undefined and behavior is unchanged.
   */
  personLanguage?: string;
}

interface ConsentState {
  granted: boolean;
  documentoFotoUrl?: string;
}

// TEMPLATE_LANGUAGES (consent_language enum) is the single source in
// ./RegistrationWizard/_shared. A non-Spanish person triggers the verbal-
// translation fallback banner when their language is outside that set OR the
// `templates` for their language are empty (active-but-empty lane) — never
// silently render Spanish (THE-04). RTL languages live here so the body wrapper
// can flip dir="rtl".
const RTL_LANGUAGES = new Set(["ar"]);

export function ConsentModal({ open, personId, templates, onClose, onSaved, personLanguage }: ConsentModalProps) {
  const needsVerbalFallback =
    !!personLanguage &&
    personLanguage !== "es" &&
    (!TEMPLATE_LANGUAGES.has(personLanguage) || templates.length === 0);
  const dir = personLanguage && RTL_LANGUAGES.has(personLanguage) ? "rtl" : "ltr";
  const { mutateAsync: uploadPhoto } = trpc.persons.uploadPhoto.useMutation();
  const { mutateAsync: saveConsents } = trpc.persons.saveConsents.useMutation();
  // Lo que YA consta firmado, de sólo lectura. `consents` sigue siendo lo
  // TOCADO en esta sesión: mezclarlos haría que "tocado" dejara de significar
  // nada y cada guardado re-sellara con la fecha de hoy registros que tienen
  // valor de firma manuscrita.
  const { firmados, isLoadingSaved, cargaFallida } = useSavedConsents(personId, open);
  const [consents, setConsents] = useState<Record<string, ConsentState>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [captureForPurpose, setCaptureForPurpose] = useState<string | null>(null);
  const fileInputRef = { current: null as HTMLInputElement | null };

  const toggleConsent = useCallback((purpose: string) => {
    setConsents((prev) => ({
      ...prev,
      [purpose]: {
        ...prev[purpose],
        granted: !(prev[purpose]?.granted ?? firmados[purpose]?.granted ?? false),
      },
    }));
  }, [firmados]);

  const handleDocumentCapture = useCallback(async (purpose: string, file: File) => {
    try {
      const base64 = await compressImage(file, 1200, 0.85);
      // Server-side upload (ADR-0002): returns the storage PATH in the private
      // documentos-consentimiento bucket — never a public URL (F078).
      const { path } = await uploadPhoto({ bucket: "documentos-consentimiento", base64 });
      setConsents((prev) => ({
        ...prev,
        [purpose]: { ...prev[purpose], documentoFotoUrl: path },
      }));
      toast.success("Documento de consentimiento subido");
    } catch {
      toast.error("Error al subir el documento de consentimiento");
    }
    setCaptureForPurpose(null);
  }, [uploadPhoto]);

  const handleSave = useCallback(async () => {
    // Send every TOUCHED purpose, with its final granted state — a purpose
    // toggled on and back off becomes an explicit granted:false (revocation).
    // Untouched purposes are omitted and stay unchanged in the DB.
    const touched = templates.filter((t) => consents[t.purpose] !== undefined);
    if (touched.length === 0) {
      toast.info("No hay cambios en los consentimientos");
      return;
    }

    setIsSaving(true);
    try {
      const rows = touched.map((t) => ({
        purpose: t.purpose,
        idioma: t.idioma,
        granted: consents[t.purpose]?.granted ?? firmados[t.purpose]?.granted ?? false,
        granted_at: new Date().toISOString(),
        consent_text: t.text_content,
        consent_version: t.version,
        documento_foto_url: consents[t.purpose]?.documentoFotoUrl ?? null,
      }));

      await saveConsents({ personId, consents: rows });

      toast.success(`${rows.length} consentimiento(s) guardado(s)`);
      onSaved();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      toast.error(`Error al guardar consentimientos: ${msg}`);
    } finally {
      setIsSaving(false);
    }
  }, [templates, consents, firmados, personId, saveConsents, onSaved, onClose]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="ph-no-capture max-w-[95vw] md:max-w-lg">
        <DialogHeader>
          <DialogTitle>Consentimientos RGPD</DialogTitle>
          <DialogDescription>
            Selecciona los consentimientos que la persona otorga. Puedes adjuntar una foto del documento firmado.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh] pr-2">
          <div data-testid="consent-body" className="space-y-4" dir={dir}>
            {needsVerbalFallback && (
              <div
                className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800"
                data-testid="verbal-translation-banner"
                role="status"
              >
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  Pide a Sole / a tu volunteer una traducción verbal antes de firmar.
                  El consentimiento debajo está en español.
                </span>
              </div>
            )}
            {isLoadingSaved && (
              <p className="text-xs text-muted-foreground">
                Consultando lo que ya consta firmado…
              </p>
            )}
            {cargaFallida && (
              <div
                role="alert"
                data-testid="consent-carga-fallida"
                className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:bg-amber-950"
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                No se han podido consultar los consentimientos ya firmados. Las
                casillas salen vacías: comprueba la ficha antes de volver a firmar.
              </div>
            )}
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
                      checked={state?.granted ?? firmados[t.purpose]?.granted ?? false}
                      onCheckedChange={() => toggleConsent(t.purpose)}
                      className="mt-0.5"
                    />
                    <div className="flex-1 space-y-1">
                      <Label htmlFor={`consent-${t.purpose}`} className="cursor-pointer font-medium">
                        {CONSENT_PURPOSE_LABELS[t.purpose] ?? t.purpose}
                      </Label>
                      <Badge variant="outline" className="text-xs">{t.idioma.toUpperCase()} · v{t.version}</Badge>
                      <p lang={t.idioma} className="text-xs text-muted-foreground line-clamp-3">{t.text_content}</p>
                      {/* Lo que YA consta: sin esto el escudo parecía decir que
                          la persona no había firmado nada. */}
                      {describeConsentSignature(firmados[t.purpose]) && (
                        <p
                          className="text-xs text-muted-foreground"
                          data-testid={`consent-firma-${t.purpose}`}
                        >
                          {describeConsentSignature(firmados[t.purpose])}
                        </p>
                      )}
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
