/**
 * NumeroSerieInfo — ayuda de formato del "Nº de serie del formulario".
 *
 * Popover y no tooltip a propósito: el dispositivo objetivo es un Android de
 * gama baja y en pantalla táctil un tooltip de hover no se puede abrir. Como
 * botón real, se alcanza con teclado y lo anuncia el lector de pantalla.
 */
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Info } from "lucide-react";

const REGLAS: { caso: string; formato: string }[] = [
  { caso: "Familias", formato: "código familia_nombre y apellidos" },
  { caso: "Cursos", formato: "fecha americana_curso_nombre y apellidos" },
  { caso: "Otros", formato: "fecha americana_programa_nombre y apellidos" },
];

export function NumeroSerieInfo() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          aria-label="Formato del n.º de serie"
        >
          <Info className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="max-w-xs text-xs">
        <p className="font-medium mb-2">Cómo se compone el nº de serie</p>
        <dl className="space-y-2">
          {REGLAS.map(({ caso, formato }) => (
            <div key={caso}>
              <dt className="font-medium">{caso}</dt>
              <dd className="text-muted-foreground break-words">{formato}</dd>
            </div>
          ))}
        </dl>
      </PopoverContent>
    </Popover>
  );
}
