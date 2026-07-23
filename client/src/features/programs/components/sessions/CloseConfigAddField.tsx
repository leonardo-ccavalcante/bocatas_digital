/**
 * CloseConfigAddField.tsx — Dialog to add a new field to the close config.
 *
 * CRITICAL LANGUAGE RULE: uses plain-language descriptions for answer types,
 * never raw tipo slugs. Maps user selection to tipo internally.
 */
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CloseField, CloseFieldTipo } from "@shared/sessionSchemas";

/** Plain-language options mapped to internal tipo values.
 * The user NEVER sees the tipo slug. */
const RESPONSE_TYPE_OPTIONS: { label: string; description: string; tipo: CloseFieldTipo }[] = [
  { label: "Un número", description: "Cantidad entera o decimal (ej: 42, 3.5)", tipo: "numero" },
  { label: "Un peso (kg)", description: "Kilogramos con decimales (ej: 12.5 kg)", tipo: "kg" },
  { label: "Personas contadas", description: "Número de personas presentes", tipo: "contagem_personas" },
  { label: "Texto libre", description: "Respuesta larga, observaciones", tipo: "texto" },
  { label: "Lista de nombres", description: "Nombres de voluntarios u otras personas", tipo: "lista_voluntarios" },
];

/** Suggested domain-named presets to offer as quick picks. */
const SUGGESTED_FIELDS: { label: string; tipo: CloseFieldTipo; obligatorio: boolean }[] = [
  { label: "Material utilizado", tipo: "texto", obligatorio: false },
  { label: "Nº de asistentes externos", tipo: "contagem_personas", obligatorio: false },
  { label: "Incidencias destacadas", tipo: "texto", obligatorio: false },
  { label: "Kg de alimento distribuido", tipo: "kg", obligatorio: false },
];

interface CloseConfigAddFieldProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingSlugs: Set<string>;
  onAdd: (field: CloseField) => void;
}

function slugify(label: string): string {
  return label.toLowerCase()
    .replace(/á/g, "a").replace(/é/g, "e").replace(/í/g, "i").replace(/ó/g, "o").replace(/ú/g, "u")
    .replace(/ñ/g, "n").replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "").slice(0, 50);
}

export function CloseConfigAddField({
  open, onOpenChange, existingSlugs, onAdd,
}: CloseConfigAddFieldProps) {
  const [mode, setMode] = useState<"pick" | "custom">("pick");
  const [label, setLabel] = useState("");
  const [tipo, setTipo] = useState<CloseFieldTipo>("texto");
  const [obligatorio, setObligatorio] = useState(false);
  const [error, setError] = useState("");

  function reset() {
    setMode("pick");
    setLabel("");
    setTipo("texto");
    setObligatorio(false);
    setError("");
  }

  function handleClose(open: boolean) {
    if (!open) reset();
    onOpenChange(open);
  }

  function handleAddCustom() {
    if (!label.trim()) { setError("El nombre del campo es obligatorio."); return; }
    const slug = slugify(label);
    if (!slug) { setError("El nombre no genera un identificador válido."); return; }
    if (existingSlugs.has(slug)) { setError("Ya existe un campo con ese nombre."); return; }
    onAdd({ slug, label: label.trim(), tipo, obligatorio });
    handleClose(false);
  }

  function handleAddSuggested(suggestion: typeof SUGGESTED_FIELDS[number]) {
    const slug = slugify(suggestion.label);
    if (existingSlugs.has(slug)) { setError(`Ya existe "${suggestion.label}".`); return; }
    onAdd({ slug, label: suggestion.label, tipo: suggestion.tipo, obligatorio: suggestion.obligatorio });
    handleClose(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Añadir campo al cierre</DialogTitle>
          <DialogDescription>
            Elige un campo sugerido o crea uno personalizado.
          </DialogDescription>
        </DialogHeader>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {mode === "pick" && (
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Sugeridos</p>
            {SUGGESTED_FIELDS.map((s) => (
              <button
                key={s.label}
                type="button"
                className="w-full text-left rounded-lg border px-3 py-2.5 hover:bg-muted/50 transition-colors"
                onClick={() => handleAddSuggested(s)}
              >
                <span className="text-sm font-medium">{s.label}</span>
              </button>
            ))}
            <Button
              type="button"
              variant="outline"
              className="w-full text-sm"
              onClick={() => setMode("custom")}
            >
              + Crear campo personalizado
            </Button>
          </div>
        )}

        {mode === "custom" && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="add-field-label">
                Nombre del campo <span className="text-destructive" aria-hidden="true">*</span>
              </Label>
              <Input
                id="add-field-label"
                value={label}
                onChange={(e) => { setLabel(e.target.value); setError(""); }}
                placeholder="Ej: Observaciones del día"
                maxLength={100}
              />
            </div>

            <div className="space-y-1.5">
              <Label>¿Cómo se responde?</Label>
              <div className="space-y-2">
                {RESPONSE_TYPE_OPTIONS.map((opt) => (
                  <label
                    key={opt.tipo}
                    className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${
                      tipo === opt.tipo ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="response-type"
                      value={opt.tipo}
                      checked={tipo === opt.tipo}
                      onChange={() => setTipo(opt.tipo)}
                      className="mt-0.5"
                    />
                    <div>
                      <p className="text-sm font-medium">{opt.label}</p>
                      <p className="text-xs text-muted-foreground">{opt.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={obligatorio}
                onChange={(e) => setObligatorio(e.target.checked)}
              />
              <span className="text-sm">Campo obligatorio para cerrar la sesión</span>
            </label>
          </div>
        )}

        <DialogFooter className="gap-2">
          {mode === "custom" && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setMode("pick")}>
              Atrás
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => handleClose(false)}>
            Cancelar
          </Button>
          {mode === "custom" && (
            <Button type="button" onClick={handleAddCustom} disabled={!label.trim()}>
              Añadir campo
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
