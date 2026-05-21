/**
 * PersonsEmptyState — shown in the admin directory when no rows match.
 *
 * Two cases:
 *   - Active filters → prompt to clear them.
 *   - No persons at all → link to create the first one.
 */
import { Link } from "wouter";
import { Search, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PersonsEmptyStateProps {
  onClear: () => void;
  hasFilters: boolean;
  isAdmin: boolean;
}

export function PersonsEmptyState({ onClear, hasFilters, isAdmin }: PersonsEmptyStateProps) {
  return (
    <div className="text-center py-16">
      <div className="mx-auto h-12 w-12 rounded-full flex items-center justify-center mb-4 bg-accent text-accent-foreground">
        <Search className="h-5 w-5" aria-hidden="true" />
      </div>
      <p className="text-body font-semibold text-foreground">Sin resultados</p>
      <p className="text-body-sm text-muted-foreground mt-1">
        {hasFilters
          ? "Prueba a ajustar los filtros."
          : "Aún no hay personas registradas."}
      </p>
      {hasFilters && (
        <button
          onClick={onClear}
          className="bocatas-btn-outline mt-4 px-4 py-2 min-h-[40px] text-body-sm"
        >
          Limpiar filtros
        </button>
      )}
      {!hasFilters && isAdmin && (
        <Link href="/personas/nueva">
          <Button variant="outline" size="sm" className="mt-4 gap-1.5">
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            Registrar nueva persona
          </Button>
        </Link>
      )}
    </div>
  );
}
