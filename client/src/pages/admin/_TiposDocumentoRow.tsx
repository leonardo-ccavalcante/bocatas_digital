import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

import type { DocType } from "./_TiposDocumentoTypes";

export function ScopeLabel({ scope }: { scope: string }) {
  return scope === "familia" ? (
    <span>Por familia</span>
  ) : (
    <span>Por miembro</span>
  );
}

export function TypeRow({
  tipo,
  onToggleActive,
  onEdit,
  onUpload,
}: {
  tipo: DocType;
  onToggleActive: (id: string, newValue: boolean) => void;
  onEdit: (tipo: DocType) => void;
  onUpload: (tipo: DocType, kind: "template" | "guide") => void;
}) {
  return (
    <div
      className={`flex items-center gap-3 py-3 border-b last:border-0 ${!tipo.is_active ? "opacity-60" : ""}`}
      data-inactive={!tipo.is_active ? "true" : undefined}
    >
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm">{tipo.nombre}</p>
        <p className="text-xs text-muted-foreground font-mono">{tipo.slug}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-muted-foreground">
            <ScopeLabel scope={tipo.scope} />
          </span>
          {tipo.is_required && (
            <Badge variant="secondary" className="text-xs">Obligatorio</Badge>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <Switch
          checked={tipo.is_active}
          onCheckedChange={(val) => onToggleActive(tipo.id, val)}
          aria-label={`Activar/desactivar ${tipo.nombre}`}
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onEdit(tipo)}
          aria-label={`Editar ${tipo.nombre}`}
        >
          Editar
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onUpload(tipo, "template")}
          aria-label={`Subir plantilla de ${tipo.nombre}`}
        >
          Plantilla
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onUpload(tipo, "guide")}
          aria-label={`Subir guía de ${tipo.nombre}`}
        >
          Guía
        </Button>
      </div>
    </div>
  );
}
