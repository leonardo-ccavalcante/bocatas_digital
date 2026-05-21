/**
 * InstitucionTypeahead — live search of the instituciones catalog.
 *
 * Renders a text input that fires trpc.instituciones.search when the user types
 * at least 2 characters. Selecting a result calls onChange with the picked item.
 * Clearing the text resets the selection.
 *
 * When no results are found a "+ Crear" button opens CrearInstitucionInlineModal,
 * which creates the institution and returns it already selected.
 */

import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useInstitucionSearch } from "./hooks/useInstituciones";
import {
  CrearInstitucionInlineModal,
  type InstitucionPickedItem,
} from "./CrearInstitucionInlineModal";

interface InstitucionTypeaheadProps {
  value: InstitucionPickedItem | null;
  onChange: (i: InstitucionPickedItem | null) => void;
  id?: string;
}

export function InstitucionTypeahead({
  value,
  onChange,
  id,
}: InstitucionTypeaheadProps) {
  const [q, setQ] = useState(value?.nombre ?? "");
  const [showCreate, setShowCreate] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const search = useInstitucionSearch(q, q.length >= 2 && !value);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setListOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const hasResults =
    search.data !== undefined && search.data.length > 0 && !value;
  const noResults =
    q.length >= 2 &&
    search.data !== undefined &&
    search.data.length === 0 &&
    !value;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQ(e.target.value);
    setListOpen(true);
    if (value) onChange(null);
  };

  const handlePick = (item: InstitucionPickedItem) => {
    onChange(item);
    setQ(item.nombre);
    setListOpen(false);
  };

  return (
    <div className="relative space-y-1" ref={containerRef}>
      <Input
        id={id}
        value={q}
        onChange={handleInputChange}
        onFocus={() => setListOpen(true)}
        placeholder="Buscar institución..."
        aria-label="Buscar institución"
        aria-autocomplete="list"
        aria-expanded={listOpen && hasResults}
        role="combobox"
        autoComplete="off"
      />

      {listOpen && hasResults && (
        <div
          className="absolute z-50 w-full border rounded bg-background shadow-md max-h-48 overflow-y-auto"
          role="listbox"
          aria-label="Resultados de búsqueda de instituciones"
        >
          {search.data!.map((inst) => (
            <button
              key={inst.id}
              type="button"
              role="option"
              aria-selected={false}
              className="w-full text-left p-2 hover:bg-muted text-sm focus:outline-none focus:bg-muted"
              onClick={() =>
                handlePick({
                  id: inst.id,
                  nombre: inst.nombre,
                  direccion: inst.direccion,
                  telefono: inst.telefono,
                  email: inst.email,
                  codigo_postal: inst.codigo_postal,
                })
              }
            >
              <div className="font-medium">{inst.nombre}</div>
              <div className="text-xs text-muted-foreground">
                {inst.tipo ?? "—"} · {(inst.areas ?? []).join(", ")}
              </div>
            </button>
          ))}
        </div>
      )}

      {noResults && (
        <Button
          variant="outline"
          size="sm"
          type="button"
          onClick={() => setShowCreate(true)}
          className="w-full justify-start"
        >
          <Plus className="h-3 w-3 mr-1" aria-hidden="true" />
          Crear &ldquo;{q}&rdquo;
        </Button>
      )}

      <CrearInstitucionInlineModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        prefillNombre={q}
        onCreated={(inst) => {
          handlePick(inst);
        }}
      />
    </div>
  );
}
