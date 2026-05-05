import type { Dispatch, RefObject, SetStateAction } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertCircle, Camera, ShieldCheck, ShieldX, Upload, X } from "lucide-react";
import type { ConsentTemplate } from "../../../schemas";
import { CONSENT_PURPOSE_LABELS } from "../_shared";

interface Step7ConsentProps {
  consentChoices: Record<string, boolean>;
  setConsentChoices: Dispatch<SetStateAction<Record<string, boolean>>>;
  groupAPurposes: string[];
  groupBPurposes: string[];
  groupCPurposes: string[];
  groupAAccepted: boolean;
  consentTemplatesEs: ConsentTemplate[];
  consentTemplatesLang: ConsentTemplate[];
  numeroSerie: string;
  setNumeroSerie: (v: string) => void;
  consentDocPreview: string | null;
  setConsentDocBase64: (v: string | null) => void;
  setConsentDocPreview: (v: string | null) => void;
  consentDocInputRef: RefObject<HTMLInputElement | null>;
  handleConsentDocFile: (file: File) => Promise<void>;
}

export function Step7Consent({
  consentChoices,
  setConsentChoices,
  groupAPurposes,
  groupBPurposes,
  groupCPurposes,
  groupAAccepted,
  consentTemplatesEs,
  consentTemplatesLang,
  numeroSerie,
  setNumeroSerie,
  consentDocPreview,
  setConsentDocBase64,
  setConsentDocPreview,
  consentDocInputRef,
  handleConsentDocFile,
}: Step7ConsentProps) {
  return (
    <div className="space-y-4 pb-16">
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
        <p className="text-sm font-medium text-blue-800">🔒 Protección de datos (RGPD Art. 7)</p>
        <p className="text-xs text-blue-700 mt-1">
          El Grupo A es obligatorio. Sin su aceptación no se puede completar el registro.
        </p>
      </div>

      {/* Group A — Required */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="font-semibold">Grupo A — Obligatorio</Label>
          <div className="flex gap-1">
            <Button type="button" size="sm" variant="outline" className="h-7 text-xs"
              onClick={() => {
                const all = { ...consentChoices };
                groupAPurposes.forEach((p) => { all[p] = true; });
                setConsentChoices(all);
              }}>
              <ShieldCheck className="mr-1 h-3 w-3 text-green-600" /> Aceptar todo
            </Button>
            <Button type="button" size="sm" variant="outline" className="h-7 text-xs"
              onClick={() => {
                const all = { ...consentChoices };
                groupAPurposes.forEach((p) => { all[p] = false; });
                setConsentChoices(all);
              }}>
              <ShieldX className="mr-1 h-3 w-3 text-destructive" /> Denegar todo
            </Button>
          </div>
        </div>

        <ScrollArea className="rounded-md border">
          <div className="p-3 space-y-3">
            {groupAPurposes.map((purpose) => {
              const templateEs = consentTemplatesEs.find((t) => t.purpose === purpose);
              const templateLang = consentTemplatesLang.find((t) => t.purpose === purpose);
              return (
                <div key={purpose} className="space-y-1">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id={`ca-${purpose}`}
                      checked={consentChoices[purpose] === true}
                      onCheckedChange={(v) =>
                        setConsentChoices((prev) => ({ ...prev, [purpose]: v === true }))
                      }
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0 space-y-1">
                      <Label htmlFor={`ca-${purpose}`} className="cursor-pointer font-medium text-sm">
                        {CONSENT_PURPOSE_LABELS[purpose]}
                      </Label>
                      <Badge variant="outline" className="text-xs">Requerido</Badge>
                      <div className={`grid gap-2 mt-1 ${templateLang && templateLang.idioma !== "es" ? "grid-cols-2" : "grid-cols-1"}`}>
                        {templateEs && (
                          <div className="rounded bg-muted p-2">
                            <p className="text-xs font-medium mb-1">🇪🇸 Español</p>
                            <p className="text-xs text-muted-foreground">{templateEs.text_content}</p>
                          </div>
                        )}
                        {templateLang && templateLang.idioma !== "es" && (
                          <div className="rounded bg-muted p-2">
                            <p className="text-xs font-medium mb-1">🌐 {templateLang.idioma.toUpperCase()}</p>
                            <p className="text-xs text-muted-foreground">{templateLang.text_content}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </div>

      {/* Group B — Banco de Alimentos (if comedor selected) */}
      {groupBPurposes.length > 0 && (
        <div className="space-y-2">
          <Label className="font-semibold">Grupo B — Banco de Alimentos</Label>
          {groupBPurposes.map((purpose) => {
            const templateEs = consentTemplatesEs.find((t) => t.purpose === purpose);
            return (
              <div key={purpose} className="rounded-lg border p-3 space-y-1">
                <div className="flex items-start gap-3">
                  <Checkbox
                    id={`cb-${purpose}`}
                    checked={consentChoices[purpose] === true}
                    onCheckedChange={(v) =>
                      setConsentChoices((prev) => ({ ...prev, [purpose]: v === true }))
                    }
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0 space-y-1">
                    <Label htmlFor={`cb-${purpose}`} className="cursor-pointer font-medium text-sm">
                      {CONSENT_PURPOSE_LABELS[purpose]}
                    </Label>
                    <Badge variant="secondary" className="text-xs">Requerido para Comedor Social</Badge>
                    {templateEs && (
                      <p className="text-xs text-muted-foreground">{templateEs.text_content}</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Group C — Familias (if familia selected) */}
      {groupCPurposes.length > 0 && (
        <div className="space-y-2">
          <Label className="font-semibold">Grupo C — Programa Familias</Label>
          {groupCPurposes.map((purpose) => {
            const templateEs = consentTemplatesEs.find((t) => t.purpose === purpose);
            return (
              <div key={purpose} className="rounded-lg border p-3 space-y-1">
                <div className="flex items-start gap-3">
                  <Checkbox
                    id={`cc-${purpose}`}
                    checked={consentChoices[purpose] === true}
                    onCheckedChange={(v) =>
                      setConsentChoices((prev) => ({ ...prev, [purpose]: v === true }))
                    }
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0 space-y-1">
                    <Label htmlFor={`cc-${purpose}`} className="cursor-pointer font-medium text-sm">
                      {CONSENT_PURPOSE_LABELS[purpose]}
                    </Label>
                    <Badge variant="secondary" className="text-xs">Opcional</Badge>
                    {templateEs && (
                      <p className="text-xs text-muted-foreground">{templateEs.text_content}</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Physical document (optional) */}
      {groupAAccepted && (
        <div className="rounded-lg border p-3 space-y-3">
          <p className="text-sm font-medium">📄 Documento firmado (opcional)</p>
          <div className="space-y-1">
            <Label htmlFor="numero_serie">Nº de serie del formulario</Label>
            <Input
              id="numero_serie"
              value={numeroSerie}
              onChange={(e) => setNumeroSerie(e.target.value)}
              placeholder="BCT-2026-00142"
            />
          </div>
          {consentDocPreview ? (
            <div className="space-y-2">
              <img src={consentDocPreview} alt="Documento" className="w-full rounded border object-cover max-h-32" />
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline"
                  onClick={() => { setConsentDocBase64(null); setConsentDocPreview(null); }}>
                  <X className="mr-1 h-3 w-3" /> Eliminar
                </Button>
                <Button type="button" size="sm" variant="outline"
                  onClick={() => consentDocInputRef.current?.click()}>
                  <Camera className="mr-1 h-3 w-3" /> Repetir
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" className="flex-1"
                onClick={() => {
                  if (consentDocInputRef.current) {
                    consentDocInputRef.current.setAttribute("capture", "environment");
                    consentDocInputRef.current.click();
                  }
                }}>
                <Camera className="mr-1 h-3 w-3" /> Cámara
              </Button>
              <Button type="button" size="sm" variant="outline" className="flex-1"
                onClick={() => {
                  if (consentDocInputRef.current) {
                    consentDocInputRef.current.removeAttribute("capture");
                    consentDocInputRef.current.click();
                  }
                }}>
                <Upload className="mr-1 h-3 w-3" /> Subir imagen
              </Button>
            </div>
          )}
          <input ref={consentDocInputRef} type="file" accept="image/*" capture="environment" className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleConsentDocFile(file);
              e.target.value = "";
            }} />
        </div>
      )}

      {/* Decline warning */}
      {!groupAAccepted && Object.keys(consentChoices).length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 mt-4">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          <p className="text-sm text-destructive">
            Sin aceptar el Grupo A no es posible completar el registro.
          </p>
        </div>
      )}
    </div>
  );
}
