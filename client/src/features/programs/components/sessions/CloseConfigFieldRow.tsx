/**
 * CloseConfigFieldRow.tsx — A single editable field in the CloseConfigEditor.
 *
 * CRITICAL LANGUAGE RULE: never renders internal tipo slugs (numero, kg, etc.)
 * as visible text. Shows only domain descriptions.
 */
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Trash2, GripVertical } from "lucide-react";
import type { CloseField } from "@shared/sessionSchemas";

/** Domain descriptions for each tipo — never the raw slug. */
const TIPO_DOMAIN_DESCRIPTION: Record<string, string> = {
  numero: "se responde con un número",
  kg: "se responde con un peso en kg",
  contagem_personas: "se responde contando personas",
  texto: "se responde con texto libre",
  lista_voluntarios: "se responde con una lista de nombres",
};

interface CloseConfigFieldRowProps {
  field: CloseField;
  onToggleObligatorio: (slug: string, value: boolean) => void;
  onDelete: (slug: string) => void;
}

export function CloseConfigFieldRow({
  field,
  onToggleObligatorio,
  onDelete,
}: CloseConfigFieldRowProps) {
  const domainDesc = TIPO_DOMAIN_DESCRIPTION[field.tipo] ?? "campo personalizado";

  return (
    <div className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
      <GripVertical className="h-4 w-4 text-muted-foreground/50 shrink-0" aria-hidden="true" />

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{field.label}</p>
        <p className="text-xs text-muted-foreground">{domainDesc}</p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <Label
          htmlFor={`obligatorio-${field.slug}`}
          className="text-xs text-muted-foreground cursor-pointer select-none"
        >
          Obligatorio
        </Label>
        <Switch
          id={`obligatorio-${field.slug}`}
          checked={field.obligatorio}
          onCheckedChange={(v) => onToggleObligatorio(field.slug, v)}
          aria-label={`${field.label}: obligatorio`}
        />
      </div>

      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
        onClick={() => onDelete(field.slug)}
        aria-label={`Eliminar campo ${field.label}`}
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  );
}
