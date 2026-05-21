import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";

import type { InstitucionRow } from "./_InstitucionTypes";

const TIPO_LABELS: Record<string, string> = {
  publica: "Pública",
  ong: "ONG",
  parroquia: "Parroquia",
  privada: "Privada",
  otro: "Otro",
};

export function InstitucionRowComponent({
  inst,
  isSuperadmin,
  onEdit,
  onDeactivate,
}: {
  inst: InstitucionRow;
  isSuperadmin: boolean;
  onEdit: (inst: InstitucionRow) => void;
  onDeactivate: (inst: InstitucionRow) => void;
}) {
  return (
    <TableRow
      data-inactive={!inst.is_active ? "true" : undefined}
      className={!inst.is_active ? "opacity-60" : undefined}
    >
      <TableCell className="font-medium">
        <span>{inst.nombre}</span>
        {!inst.is_active && (
          <Badge variant="outline" className="ml-2 text-xs">
            Inactiva
          </Badge>
        )}
      </TableCell>
      <TableCell>
        {inst.tipo ? (TIPO_LABELS[inst.tipo] ?? inst.tipo) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        {inst.distrito ?? <span className="text-muted-foreground">—</span>}
      </TableCell>
      <TableCell>
        {inst.areas.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {inst.areas.map((a) => (
              <Badge key={a} variant="secondary" className="text-xs">
                {a}
              </Badge>
            ))}
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onEdit(inst)}
            aria-label={`Editar ${inst.nombre}`}
          >
            Editar
          </Button>
          {isSuperadmin && inst.is_active && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDeactivate(inst)}
              aria-label={`Desactivar ${inst.nombre}`}
              className="text-destructive hover:text-destructive"
            >
              Desactivar
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
