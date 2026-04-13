/**
 * Personas.tsx — Person directory page.
 *
 * Admin/superadmin: full directory with search, avatar, and links to ficha.
 * Voluntario: search-only mode (min 2 chars) to look up a person quickly.
 */
import { useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { useSearchPersons } from "@/features/persons/hooks/useSearchPersons";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, UserPlus, Users, ChevronRight } from "lucide-react";
import type { BocatasRole } from "@/components/layout/ProtectedRoute";

function getInitials(nombre: string, apellidos: string | null): string {
  return [nombre, apellidos ?? ""]
    .join(" ")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export default function Personas() {
  const { user } = useAuth();
  const [query, setQuery] = useState("");

  const VALID_BOCATAS_ROLES: BocatasRole[] = ["superadmin", "admin", "voluntario", "beneficiario"];
  const rawRole = user?.role as string | undefined;
  const role: BocatasRole = (rawRole && VALID_BOCATAS_ROLES.includes(rawRole as BocatasRole))
    ? (rawRole as BocatasRole)
    : "beneficiario";

  const isAdmin = role === "admin" || role === "superadmin";
  const isVoluntario = role === "voluntario";

  const { data: results, isLoading, isFetching } = useSearchPersons(query);

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-[#C41230]" />
          <h1 className="text-base font-semibold">Personas</h1>
        </div>
        {isAdmin && (
          <Link href="/personas/nueva">
            <Button size="sm" className="gap-1.5 bg-[#C41230] hover:bg-[#a00f28] text-white">
              <UserPlus className="h-4 w-4" />
              Nueva
            </Button>
          </Link>
        )}
      </div>

      {/* ── Search bar ─────────────────────────────────────────────────── */}
      <div className="px-4 pt-4 pb-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder={isAdmin ? "Buscar por nombre o apellidos…" : "Escribe al menos 2 caracteres para buscar…"}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus={isVoluntario}
          />
        </div>
        {query.length > 0 && query.trim().length < 2 && (
          <p className="text-xs text-muted-foreground mt-1.5 ml-1">Escribe al menos 2 caracteres.</p>
        )}
      </div>

      {/* ── Results ────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {/* Loading */}
        {(isLoading || isFetching) && query.trim().length >= 2 && (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Empty search prompt */}
        {!isLoading && !isFetching && query.trim().length < 2 && (
          <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
            <Users className="h-12 w-12 mb-3 opacity-30" />
            <p className="text-sm font-medium">Busca una persona</p>
            <p className="text-xs mt-1 opacity-70">Escribe nombre o apellidos para encontrar una ficha.</p>
          </div>
        )}

        {/* No results */}
        {!isLoading && !isFetching && query.trim().length >= 2 && results?.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
            <Search className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm font-medium">Sin resultados</p>
            <p className="text-xs mt-1 opacity-70">No se encontraron personas con ese nombre.</p>
            {isAdmin && (
              <Link href="/personas/nueva">
                <Button variant="outline" size="sm" className="mt-4 gap-1.5">
                  <UserPlus className="h-4 w-4" />
                  Registrar nueva persona
                </Button>
              </Link>
            )}
          </div>
        )}

        {/* Results list */}
        {!isLoading && results && results.length > 0 && (
          <ul className="divide-y divide-border rounded-xl border overflow-hidden mt-2">
            {results.map((person) => (
              <li key={person.id}>
                <Link href={`/personas/${person.id}`}>
                  <div className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors cursor-pointer">
                    <Avatar className="h-10 w-10 shrink-0">
                      {person.foto_perfil_url && (
                        <AvatarImage src={person.foto_perfil_url} alt={person.nombre} />
                      )}
                      <AvatarFallback className="bg-[#C41230]/10 text-[#C41230] text-sm font-semibold">
                        {getInitials(person.nombre, person.apellidos)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {person.nombre} {person.apellidos ?? ""}
                      </p>
                      {person.fase_itinerario && (
                        <Badge variant="secondary" className="text-xs mt-0.5">
                          {person.fase_itinerario}
                        </Badge>
                      )}
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
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
