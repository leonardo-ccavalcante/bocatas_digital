/**
 * SearchableSelect — combobox con filtro de texto para listas largas.
 *
 * El `Select` de Radix no tiene campo de búsqueda: con ~100 países el equipo
 * tenía que recorrer la lista entera a mano, y el catálogo está ordenado por
 * frecuencia de uso, no alfabéticamente, así que ni siquiera se podía barrer
 * con la vista. Orden por frecuencia es útil en un desplegable corto y
 * desorienta en uno largo, así que aquí se ordena con `localeCompare("es")`
 * (la ñ y los acentos caen donde un hispanohablante los busca).
 *
 * `cmdk` ya está en el bundle (`components/ui/command.tsx`), así que esto no
 * añade peso al presupuesto de Lighthouse.
 *
 * La API es la misma que la de `SelectField` (_shared.tsx) a propósito: es un
 * reemplazo directo en los campos que lo necesitan, sin tocar los demás.
 */
import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface SearchableSelectProps {
  label: string;
  id: string;
  value: string;
  onChange: (v: string) => void;
  options: Record<string, string>;
  placeholder?: string;
  searchPlaceholder?: string;
  required?: boolean;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}

export function SearchableSelect({
  label,
  id,
  value,
  onChange,
  options,
  placeholder,
  searchPlaceholder,
  required,
  "aria-describedby": ariaDescribedby,
  "aria-invalid": ariaInvalid,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);

  const entries = useMemo(
    () =>
      Object.entries(options).sort((a, b) =>
        a[1].localeCompare(b[1], "es", { sensitivity: "base" })
      ),
    [options]
  );

  const selectedLabel = value ? options[value] : undefined;

  return (
    <div className="space-y-1">
      <Label htmlFor={id}>
        {label}
        {required && <span className="ml-1 text-destructive">*</span>}
      </Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-describedby={ariaDescribedby}
            aria-invalid={ariaInvalid}
            className="w-full justify-between font-normal"
          >
            <span className={cn("truncate", !selectedLabel && "text-muted-foreground")}>
              {selectedLabel ?? placeholder ?? "Seleccionar..."}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command
            // Sin esto cmdk ordena por su propia puntuación y la lista salta
            // mientras se escribe; el orden alfabético debe mantenerse estable.
            filter={(itemValue, search) =>
              itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
            }
          >
            <CommandInput placeholder={searchPlaceholder ?? "Escribe para buscar..."} />
            <CommandList>
              <CommandEmpty>Sin resultados.</CommandEmpty>
              <CommandGroup>
                {entries.map(([key, optionLabel]) => (
                  <CommandItem
                    key={key}
                    // El valor que filtra cmdk es la etiqueta visible: se busca
                    // "Marruecos", nunca "MA".
                    value={optionLabel}
                    onSelect={() => {
                      onChange(key === value ? "" : key);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === key ? "opacity-100" : "opacity-0"
                      )}
                      aria-hidden="true"
                    />
                    {optionLabel}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
