/**
 * Controles compartidos por las secciones del formulario de edición.
 *
 * Las hojas de verdad (SelectField, SearchableSelect, DateField) se reutilizan
 * del alta. Lo que NO se reutiliza son sus PASOS: van sobre `register()` de
 * react-hook-form (no controlados) y el motor del diff necesita el valor
 * controlado en cada tecla; además su resolver valida una ficha ENTERA con
 * campos obligatorios, y un parche de edición es parcial por construcción, así
 * que bloquearía todos los guardados.
 */
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import type { EditableValues } from "./editableFields";

/** Contrato único de todas las secciones: añadir una es una línea en el padre. */
export interface SeccionProps {
  values: EditableValues;
  onChange: <K extends keyof EditableValues>(campo: K, valor: EditableValues[K]) => void;
  /** Campos de alto riesgo (situacion_legal, recorrido_migratorio, notas_privadas). */
  isAdmin: boolean;
}

export function Seccion({
  titulo,
  id,
  children,
}: {
  titulo: string;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="space-y-3 scroll-mt-4">
      <h3 className="text-eyebrow text-muted-foreground">{titulo}</h3>
      {children}
    </section>
  );
}

export function Texto({
  id,
  label,
  value,
  onChange,
  ...rest
}: {
  id: string;
  label: string;
  value: string | null | undefined;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  maxLength?: number;
  disabled?: boolean;
  inputMode?: "text" | "numeric" | "tel" | "email";
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value ?? ""} onChange={(e) => onChange(e.target.value)} {...rest} />
    </div>
  );
}

/** `maxLength` viene siempre puesto: mejor frenar en el widget que en un toast. */
export function AreaTexto({
  id,
  label,
  value,
  onChange,
  maxLength,
  rows = 3,
  ayuda,
}: {
  id: string;
  label: string;
  value: string | null | undefined;
  onChange: (v: string) => void;
  maxLength: number;
  rows?: number;
  ayuda?: string;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        rows={rows}
        maxLength={maxLength}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      />
      {ayuda && <p className="text-xs text-muted-foreground">{ayuda}</p>}
    </div>
  );
}

/**
 * Grupo de casillas para una columna de ARRAY (`idiomas`, `colectivos`).
 *
 * Emite en el orden de `opciones`, NO en el orden de clic. La columna es un
 * array ordenado: sin orden canónico, desmarcar y volver a marcar la misma
 * casilla produce un array "distinto", el diff lo ve como cambio y —en el caso
 * de `colectivos`— dispara la puerta Art. 9 sobre un no-cambio.
 */
export function GrupoCasillas({
  idPrefijo,
  label,
  opciones,
  valor,
  onChange,
  disabled,
  columnas = 2,
}: {
  idPrefijo: string;
  label: string;
  opciones: Record<string, string>;
  valor: readonly string[] | null | undefined;
  onChange: (siguiente: string[]) => void;
  disabled?: boolean;
  columnas?: 2 | 3;
}) {
  const marcados = new Set(valor ?? []);
  const alternar = (clave: string, activo: boolean) => {
    const siguiente = new Set(marcados);
    if (activo) siguiente.add(clave);
    else siguiente.delete(clave);
    onChange(Object.keys(opciones).filter((k) => siguiente.has(k)));
  };

  // <fieldset>/<legend>, no un <Label> suelto: un Label sin `htmlFor` no está
  // asociado a ningún control y un lector de pantalla anuncia las casillas
  // huérfanas, sin decir de qué grupo son. WCAG 2.1 AA no es negociable aquí.
  return (
    <fieldset className="space-y-1">
      <legend className="text-sm font-medium leading-none">{label}</legend>
      <div className={columnas === 3 ? "grid grid-cols-3 gap-2" : "grid grid-cols-2 gap-2"}>
        {Object.entries(opciones).map(([clave, texto]) => (
          <div key={clave} className="flex items-center gap-2">
            <Checkbox
              id={`${idPrefijo}-${clave}`}
              disabled={disabled}
              checked={marcados.has(clave)}
              onCheckedChange={(v) => alternar(clave, v === true)}
            />
            <Label htmlFor={`${idPrefijo}-${clave}`} className="cursor-pointer text-sm font-normal">
              {texto}
            </Label>
          </div>
        ))}
      </div>
    </fieldset>
  );
}
