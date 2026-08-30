/**
 * DateField — fecha tecleable en dd/mm/aaaa, con el calendario nativo detrás.
 *
 * `<input type="date">` no se puede teclear en Android: al tocarlo se abre el
 * diálogo nativo y hay que navegar año → mes → día, una vez por cada fecha de
 * nacimiento. Aquí se teclea con el teclado numérico y las barras se ponen
 * solas; quien prefiera el calendario lo abre con el botón, que dispara el
 * mismo control nativo sobre un input oculto.
 *
 * Hacia fuera el valor sigue siendo ISO (aaaa-mm-dd), que es lo que exige
 * PersonCreateSchema — el resto del wizard no se entera del cambio.
 */
import { useEffect, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isoToDisplay, maskDateInput, displayToIso } from "../utils/dateInput";

/** `showPicker` no está en todas las versiones de la lib DOM de TypeScript. */
type PickerInput = HTMLInputElement & { showPicker?: () => void };

interface DateFieldProps {
  label: string;
  id: string;
  /** Valor ISO aaaa-mm-dd, o "" / null si está vacío. */
  value: string | null | undefined;
  onChange: (iso: string) => void;
  required?: boolean;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}

export function DateField({
  label,
  id,
  value,
  onChange,
  required,
  "aria-describedby": ariaDescribedby,
  "aria-invalid": ariaInvalid,
}: DateFieldProps) {
  const [text, setText] = useState(() => isoToDisplay(value));
  const nativeRef = useRef<HTMLInputElement>(null);

  // El OCR rellena fecha_nacimiento desde fuera. Sin esto el campo se quedaría
  // mostrando lo que hubiera antes de escanear el documento.
  useEffect(() => {
    const iso = value ?? "";
    if (displayToIso(text) !== (iso || null)) {
      setText(isoToDisplay(iso));
    }
    // `text` se omite a propósito: sólo sincroniza cuando cambia el valor externo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const handleText = (raw: string) => {
    const masked = maskDateInput(raw);
    setText(masked);
    const iso = displayToIso(masked);
    // Vacío mientras la fecha esté a medias: que el Zod del esquema decida si
    // eso es un error, en lugar de inventar aquí una segunda validación.
    onChange(iso ?? "");
  };

  const incompleta = text.length > 0 && displayToIso(text) === null;
  const hintId = `${id}-hint`;

  return (
    <div className="space-y-1">
      <Label htmlFor={id}>
        {label}
        {required && <span className="ml-1 text-destructive">*</span>}
      </Label>
      <div className="flex gap-1">
        <Input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="dd/mm/aaaa"
          value={text}
          onChange={(e) => handleText(e.target.value)}
          aria-describedby={
            [ariaDescribedby, incompleta ? hintId : null].filter(Boolean).join(" ") ||
            undefined
          }
          aria-invalid={ariaInvalid || incompleta}
        />
        <button
          type="button"
          onClick={() => {
            const el = nativeRef.current as PickerInput | null;
            if (!el) return;
            if (typeof el.showPicker === "function") el.showPicker();
            else el.click();
          }}
          aria-label={`Abrir calendario para ${label}`}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-input text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <CalendarDays className="h-4 w-4" aria-hidden="true" />
        </button>
        {/* El calendario nativo sigue disponible; sólo deja de ser el único camino. */}
        <input
          ref={nativeRef}
          type="date"
          tabIndex={-1}
          aria-hidden="true"
          className="sr-only"
          value={value ?? ""}
          onChange={(e) => {
            setText(isoToDisplay(e.target.value));
            onChange(e.target.value);
          }}
        />
      </div>
      {incompleta && (
        <p id={hintId} role="alert" className="mt-0.5 text-xs text-destructive">
          Fecha incompleta. Escríbela como dd/mm/aaaa.
        </p>
      )}
    </div>
  );
}
