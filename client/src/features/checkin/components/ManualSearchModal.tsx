/**
 * ManualSearchModal.tsx — Manual person search fallback for check-in.
 *
 * Searches persons by nombre/apellidos and allows selecting one for check-in.
 */
import { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, User, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import type { CheckinPerson } from "../machine/checkinMachine";
import { useDebounce } from "@/hooks/useDebounce";

interface ManualSearchModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (person: CheckinPerson) => void;
}

export function ManualSearchModal({ open, onClose, onSelect }: ManualSearchModalProps) {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 350);

  const { data: results, isLoading } = trpc.checkin.searchPersons.useQuery(
    { query: debouncedQuery },
    { enabled: debouncedQuery.length >= 3 }
  );

  const handleSelect = useCallback(
    (person: NonNullable<typeof results>[number]) => {
      onSelect({
        id: person.id ?? "",
        nombre: person.nombre,
        apellidos: person.apellidos,
        fecha_nacimiento: person.fecha_nacimiento ?? null,
        foto_perfil_url: person.foto_perfil_url ?? null,
        restricciones_alimentarias: person.restricciones_alimentarias ?? null,
      });
      onClose();
      setQuery("");
    },
    [onSelect, onClose]
  );

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Search className="w-5 h-5" />
            Búsqueda manual
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="Nombre o apellidos..."
              className="pl-9"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          {/* Loading */}
          {isLoading && (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Results */}
          {!isLoading && results && results.length > 0 && (
            <ul className="space-y-2 max-h-64 overflow-y-auto">
              {results.map((person) => (
                <li key={person.id}>
                  <button
                    className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-accent transition-colors text-left"
                    onClick={() => handleSelect(person)}
                  >
                    {person.foto_perfil_url ? (
                      <img
                        src={person.foto_perfil_url}
                        // QA-6 (F-W2G-02): name + photo together help screen-
                        // reader users disambiguate during rapid manual check-
                        // ins. alt="" was decorative-correct but loses parity
                        // with sighted scanning.
                        alt={`${person.nombre} ${person.apellidos ?? ""}`.trim()}
                        className="w-10 h-10 rounded-full object-cover shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <User className="w-5 h-5 text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-medium truncate">
                        {person.nombre} {person.apellidos}
                      </p>
                      {person.fecha_nacimiento && (
                        <p className="text-xs text-muted-foreground">
                          {new Date(person.fecha_nacimiento).toLocaleDateString("es-ES")}
                        </p>
                      )}
                      {person.restricciones_alimentarias && (
                        <p className="text-xs text-amber-600 font-medium">
                          ⚠️ {person.restricciones_alimentarias}
                        </p>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Empty state */}
          {!isLoading && results && results.length === 0 && debouncedQuery.length >= 3 && (
            <div className="text-center py-6 text-muted-foreground">
              <User className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No se encontraron resultados para "{debouncedQuery}"</p>
            </div>
          )}

          {/* Hint */}
          {debouncedQuery.length < 3 && (
            <p className="text-xs text-muted-foreground text-center">
              Escribe al menos 3 caracteres para buscar
            </p>
          )}

          <Button variant="outline" className="w-full" onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
