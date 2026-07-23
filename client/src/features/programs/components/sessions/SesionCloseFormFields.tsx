/**
 * SesionCloseFormFields.tsx — Dynamic close form fields driven by SessionCloseConfig.
 *
 * Renders each field by tipo using plain-language inputs:
 *   numero / kg           → number input
 *   contagem_personas     → integer input (≥0)
 *   texto                 → textarea
 *   lista_voluntarios     → multi-entry chip list
 *
 * The "tema" field (session topic) is rendered when tema_obligatorio=true.
 * Upload slots are shown as informational (file upload is a separate operation).
 *
 * Never renders raw tipo slugs in the UI.
 */
import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { X, Plus } from "lucide-react";
import type { SessionCloseConfig } from "@shared/sessionSchemas";
import { SessionDocumentUpload } from "./SessionDocumentUpload";
import { trpc } from "@/lib/trpc";

type SessionDataValues = Record<string, string | number | string[] | null>;

interface SesionCloseFormFieldsProps {
  config: SessionCloseConfig;
  values: SessionDataValues;
  onChange: (values: SessionDataValues) => void;
  /** sessionId enables the real document-upload component (required for uploads) */
  sessionId?: string;
  /** token present → public enlace path (uses token-gated endpoints) */
  token?: string;
}

function VolunteerListInput({
  slug, label, value, obligatorio, onChange,
}: {
  slug: string; label: string; value: string[]; obligatorio: boolean; onChange: (v: string[]) => void;
}) {
  const [entry, setEntry] = useState("");

  function addEntry() {
    const trimmed = entry.trim();
    if (!trimmed || value.includes(trimmed)) return;
    onChange([...value, trimmed]);
    setEntry("");
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={`field-${slug}`}>
        {label}
        {obligatorio && <span className="text-destructive ml-1" aria-hidden="true">*</span>}
        <span className="text-muted-foreground text-xs ml-1">(lista de nombres)</span>
      </Label>
      <div className="flex gap-2">
        <Input
          id={`field-${slug}`}
          value={entry}
          onChange={(e) => setEntry(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addEntry(); } }}
          placeholder="Nombre del voluntario"
          aria-label={`Añadir ${label}`}
        />
        <Button type="button" size="sm" variant="outline" onClick={addEntry} aria-label="Añadir">
          <Plus className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((v) => (
            <Badge key={v} variant="secondary" className="gap-1 pr-1">
              {v}
              <button
                type="button"
                onClick={() => onChange(value.filter((x) => x !== v))}
                className="hover:text-destructive"
                aria-label={`Eliminar ${v}`}
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

export function SesionCloseFormFields({
  config, values, onChange, sessionId, token,
}: SesionCloseFormFieldsProps) {
  // FIX 3: Seed the satisfied-upload set from the server on mount (staff path).
  // On the public enlace path (token present), getSessionDocuments is auth-gated
  // and unavailable — uploadedSlugs is local-state only (accumulated during the
  // current browser session). The invalidate() in SessionDocumentUpload now has
  // a subscriber so it triggers a meaningful refetch on the staff path.
  const serverDocs = trpc.programs.sessionDocuments.getSessionDocuments.useQuery(
    { sessionId: sessionId ?? "" },
    { enabled: !!sessionId && !token }
  );

  const [localUploadedSlugs, setLocalUploadedSlugs] = useState<string[]>([]);

  // Union of server-confirmed + locally-uploaded slugs for this session.
  const uploadedSlugs = useMemo(() => {
    const serverSlugs = serverDocs.data?.map((d) => d.tipo_slug) ?? [];
    return [...new Set([...serverSlugs, ...localUploadedSlugs])];
  }, [serverDocs.data, localUploadedSlugs]);

  if (!config.enabled) return null;

  function setField(slug: string, value: string | number | string[] | null) {
    onChange({ ...values, [slug]: value });
  }

  function handleUploaded(slug: string) {
    setLocalUploadedSlugs((prev) => prev.includes(slug) ? prev : [...prev, slug]);
  }

  return (
    <div className="space-y-4">
      {/* Tema field (topic of the session) */}
      {config.tema_obligatorio && (
        <div className="space-y-1.5">
          <Label htmlFor="field-tema">
            Tema de la sesión
            <span className="text-destructive ml-1" aria-hidden="true">*</span>
          </Label>
          <Input
            id="field-tema"
            value={(values["tema"] as string) ?? ""}
            onChange={(e) => setField("tema", e.target.value)}
            placeholder="Tema o contenido de la sesión de hoy"
            aria-required="true"
          />
        </div>
      )}

      {config.fields.map((field) => {
        if (field.tipo === "numero" || field.tipo === "kg") {
          const unit = field.tipo === "kg" ? " (kg)" : "";
          return (
            <div key={field.slug} className="space-y-1.5">
              <Label htmlFor={`field-${field.slug}`}>
                {field.label}{unit}
                {field.obligatorio && <span className="text-destructive ml-1" aria-hidden="true">*</span>}
              </Label>
              <Input
                id={`field-${field.slug}`}
                type="number"
                step={field.tipo === "kg" ? "0.1" : "1"}
                min="0"
                value={(values[field.slug] as number | "") ?? ""}
                onChange={(e) => setField(field.slug, e.target.value === "" ? null : Number(e.target.value))}
                aria-required={field.obligatorio}
              />
            </div>
          );
        }

        if (field.tipo === "contagem_personas") {
          return (
            <div key={field.slug} className="space-y-1.5">
              <Label htmlFor={`field-${field.slug}`}>
                {field.label}
                {field.obligatorio && <span className="text-destructive ml-1" aria-hidden="true">*</span>}
                <span className="text-muted-foreground text-xs ml-1">(número entero)</span>
              </Label>
              <Input
                id={`field-${field.slug}`}
                type="number"
                step="1"
                min="0"
                value={(values[field.slug] as number | "") ?? ""}
                onChange={(e) => setField(field.slug, e.target.value === "" ? null : Math.floor(Number(e.target.value)))}
                aria-required={field.obligatorio}
              />
            </div>
          );
        }

        if (field.tipo === "lista_voluntarios") {
          return (
            <VolunteerListInput
              key={field.slug}
              slug={field.slug}
              label={field.label}
              obligatorio={field.obligatorio}
              value={(values[field.slug] as string[]) ?? []}
              onChange={(v) => setField(field.slug, v)}
            />
          );
        }

        // tipo === "texto"
        return (
          <div key={field.slug} className="space-y-1.5">
            <Label htmlFor={`field-${field.slug}`}>
              {field.label}
              {field.obligatorio && <span className="text-destructive ml-1" aria-hidden="true">*</span>}
            </Label>
            <Textarea
              id={`field-${field.slug}`}
              rows={3}
              value={(values[field.slug] as string) ?? ""}
              onChange={(e) => setField(field.slug, e.target.value)}
              aria-required={field.obligatorio}
            />
          </div>
        );
      })}

      {/* Document uploads — real upload control (replaces static stub) */}
      {config.uploads.length > 0 && (
        <div className="space-y-2 pt-2 border-t">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Documentos requeridos
          </p>
          {config.uploads.map((upload) =>
            sessionId ? (
              <SessionDocumentUpload
                key={upload.slug}
                upload={upload}
                sessionId={sessionId}
                token={token}
                isUploaded={uploadedSlugs.includes(upload.slug)}
                onUploaded={() => handleUploaded(upload.slug)}
              />
            ) : (
              <div
                key={upload.slug}
                className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-2.5 text-sm text-muted-foreground"
              >
                <span>
                  {upload.label}
                  {upload.obligatorio && (
                    <span className="text-destructive ml-1 font-medium" aria-hidden="true">*</span>
                  )}
                </span>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
