/**
 * PersonasSearchView — search-only person directory (voluntario / non-admin).
 *
 * Extracted from pages/Personas.tsx to keep that page under the 300-line budget
 * (eslint max-lines). Presentational: all data + query state live in the parent.
 */
import { Link } from "wouter";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, Users, ChevronRight } from "lucide-react";
import type { PersonRowData } from "@/features/persons/components/PersonRowDesktop";

function getInitials(nombre: string, apellidos: string | null): string {
  return [nombre, apellidos ?? ""]
    .join(" ")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

interface PersonasSearchViewProps {
  query: string;
  onQueryChange: (value: string) => void;
  /** Autofocus the search box (true for voluntario landing). */
  autoFocus: boolean;
  /** True while a search is loading/fetching. */
  isLoading: boolean;
  /** Matched persons (already normalised). */
  results: PersonRowData[];
}

export function PersonasSearchView({
  query,
  onQueryChange,
  autoFocus,
  isLoading,
  results,
}: PersonasSearchViewProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" aria-hidden="true" />
          <h1 className="text-h3">Personas</h1>
        </div>
      </div>

      <div className="px-4 pt-4 pb-2">
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            data-testid="personas-search-input"
            type="search"
            className="
              w-full h-11 pl-9 pr-4 border border-border rounded-xl
              text-body bg-card text-foreground placeholder:text-muted-foreground
              focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40
              transition
            "
            placeholder="Escribe al menos 2 caracteres para buscar…"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            autoFocus={autoFocus}
            aria-label="Buscar persona"
          />
        </div>
        {query.length > 0 && query.trim().length < 2 && (
          <p className="text-body-sm text-muted-foreground mt-1.5 ml-1">
            Escribe al menos 2 caracteres.
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : query.trim().length < 2 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
            <Users className="h-12 w-12 mb-3 opacity-30" aria-hidden="true" />
            <p className="text-body font-medium">Busca una persona</p>
            <p className="text-body-sm mt-1 opacity-70">
              Escribe nombre o apellidos para encontrar una ficha.
            </p>
          </div>
        ) : results.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
            <Search className="h-10 w-10 mb-3 opacity-30" aria-hidden="true" />
            <p className="text-body font-medium">Sin resultados</p>
            <p className="text-body-sm mt-1 opacity-70">
              No se encontraron personas con ese nombre.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border rounded-xl border overflow-hidden mt-2">
            {results.map((person) => (
              <li key={person.id}>
                <Link href={`/personas/${person.id}`}>
                  <div className="flex items-center gap-3 px-4 py-3 hover:bg-accent/50 transition-colors cursor-pointer">
                    <Avatar className="h-10 w-10 shrink-0">
                      {person.foto_perfil_url && (
                        <AvatarImage src={person.foto_perfil_url} alt={person.nombre} />
                      )}
                      <AvatarFallback className="bg-accent text-accent-foreground text-body font-semibold">
                        {getInitials(person.nombre, person.apellidos)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-body font-medium truncate">
                        {person.nombre} {person.apellidos ?? ""}
                      </p>
                      {person.fase_itinerario && (
                        <Badge variant="secondary" className="text-[11px] mt-0.5">
                          {person.fase_itinerario}
                        </Badge>
                      )}
                    </div>
                    <ChevronRight
                      className="h-4 w-4 text-muted-foreground shrink-0"
                      aria-hidden="true"
                    />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
