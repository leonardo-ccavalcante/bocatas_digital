/**
 * ProgramFormTreeFields.tsx — tree-specific form fields extracted from ProgramForm.
 * Uses useFormContext so it can live inside <Form> without prop-drilling.
 *
 * Fields: tipo, inscribible, estados_habilitados, plazas, etiquetas, parent_id display.
 * Choosing a tipo pre-fills inscribible + estados_habilitados (still editable).
 */
import { useFormContext } from "react-hook-form";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TIPOS_PROGRAMA,
  TIPO_LABELS,
  TIPO_PRESETS,
  ESTADOS_INSCRIPCION,
  ESTADO_LABELS,
} from "@shared/programEstados";
import type { ProgramFormValues } from "../schemas";
import type { EstadoInscripcion } from "@shared/programEstados";

interface ProgramFormTreeFieldsProps {
  /** When set, shows "Dentro de: {parentName}" read-only line. */
  parentName?: string;
}

export function ProgramFormTreeFields({ parentName }: ProgramFormTreeFieldsProps) {
  const form = useFormContext<ProgramFormValues>();

  function handleTipoChange(tipo: string) {
    form.setValue("tipo", tipo as ProgramFormValues["tipo"]);
    const preset = TIPO_PRESETS[tipo as keyof typeof TIPO_PRESETS];
    if (preset) {
      form.setValue("inscribible", preset.inscribible);
      form.setValue("estados_habilitados", preset.estados as EstadoInscripcion[]);
    }
  }

  const estadosHabilitados = form.watch("estados_habilitados") ?? [];

  function toggleEstado(estado: EstadoInscripcion, checked: boolean) {
    const current = estadosHabilitados as string[];
    if (checked) {
      form.setValue("estados_habilitados", [...new Set([...current, estado])] as EstadoInscripcion[]);
    } else {
      form.setValue("estados_habilitados", current.filter((e) => e !== estado) as EstadoInscripcion[]);
    }
  }

  return (
    <div className="space-y-4 border-t pt-4">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        Árbol de programas
      </h3>

      {/* Parent context (read-only) */}
      {parentName && (
        <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          Dentro de: <strong>{parentName}</strong>
        </div>
      )}

      {/* Tipo */}
      <FormField
        control={form.control}
        name="tipo"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Tipo de programa</FormLabel>
            <FormControl>
              <Select
                value={field.value}
                onValueChange={handleTipoChange}
              >
                <SelectTrigger aria-label="Tipo de programa">
                  <SelectValue placeholder="Seleccionar tipo..." />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_PROGRAMA.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TIPO_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormControl>
            <FormDescription>
              Al cambiar el tipo se pre-rellenan los estados habilitados e inscribible.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Inscribible */}
      <FormField
        control={form.control}
        name="inscribible"
        render={({ field }) => (
          <FormItem className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <FormLabel className="text-sm font-medium">Admite inscripciones directas</FormLabel>
              <FormDescription className="text-xs">
                Desactívalo para contenedores y cursos con ediciones.
              </FormDescription>
            </div>
            <FormControl>
              <Switch checked={field.value} onCheckedChange={field.onChange} />
            </FormControl>
          </FormItem>
        )}
      />

      {/* Estados habilitados */}
      <FormField
        control={form.control}
        name="estados_habilitados"
        render={() => (
          <FormItem>
            <FormLabel>Estados habilitados</FormLabel>
            <FormDescription className="text-xs">
              Selecciona los estados del catálogo global que aplican a este programa.
            </FormDescription>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1">
              {ESTADOS_INSCRIPCION.map((estado) => (
                <div key={estado} className="flex items-center gap-2">
                  <Checkbox
                    id={`estado-${estado}`}
                    checked={estadosHabilitados.includes(estado)}
                    onCheckedChange={(checked) => toggleEstado(estado, !!checked)}
                  />
                  <Label htmlFor={`estado-${estado}`} className="text-sm cursor-pointer">
                    {ESTADO_LABELS[estado]}
                  </Label>
                </div>
              ))}
            </div>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Plazas */}
      <FormField
        control={form.control}
        name="plazas"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Plazas disponibles (opcional)</FormLabel>
            <FormControl>
              <Input
                type="number"
                min={1}
                placeholder="Sin límite"
                value={field.value ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  field.onChange(v === "" ? null : parseInt(v, 10));
                }}
              />
            </FormControl>
            <FormDescription className="text-xs">
              Se mostrará advertencia al inscribir si el cupo está lleno.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Etiquetas */}
      <FormField
        control={form.control}
        name="etiquetas"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Etiquetas (opcional)</FormLabel>
            <FormControl>
              <Input
                placeholder="espanol formacion basica"
                value={(field.value ?? []).join(" ")}
                onChange={(e) => {
                  const raw = e.target.value;
                  const slugs = raw
                    .split(/[\s,]+/)
                    .map((s) => s.toLowerCase().replace(/[^a-z_]/g, "").trim())
                    .filter(Boolean);
                  field.onChange(slugs);
                }}
              />
            </FormControl>
            <FormDescription className="text-xs">
              Separadas por espacio o coma. Solo letras minúsculas y guiones bajos.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
