import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronRight, Search } from "lucide-react";
import type { FamiliasFilters } from "./hooks/useFamiliasFilters";

/**
 * Collapsible filter section for the familias list. Binds to the EXISTING
 * `useFamiliasFilters` URL-param state (search, estado, sinGuf,
 * sinInformeSocial) — it does not own state, the parent does.
 *
 * Accessibility contract (asserted by FamiliasList.test.tsx) is preserved:
 *  - search input  aria-label="Buscar familia"
 *  - estado Select aria-label="Filtrar por estado"
 *  - Sin GUF / Sin informe social buttons expose aria-pressed
 */

interface FamiliasFilterBarProps {
  filters: FamiliasFilters;
  searchInput: string;
  onSearchInputChange: (value: string) => void;
  onCommitSearch: () => void;
  onEstadoChange: (estado: FamiliasFilters["estado"]) => void;
  onToggleSinGuf: () => void;
  onToggleSinInforme: () => void;
  onClear: () => void;
  /** Count of currently-visible rows (after filtering). */
  shownCount: number;
}

function buildPills(filters: FamiliasFilters, searchInput: string): string[] {
  const pills: string[] = [];
  if (searchInput) pills.push(`"${searchInput}"`);
  // Only include the estado pill when it differs from the default ("activa").
  if (filters.estado !== "activa") {
    pills.push(filters.estado === "all" ? "todas" : "en baja");
  }
  if (filters.sinGuf) pills.push("sin GUF");
  if (filters.sinInformeSocial) pills.push("sin informe");
  return pills;
}

export function FamiliasFilterBar({
  filters,
  searchInput,
  onSearchInputChange,
  onCommitSearch,
  onEstadoChange,
  onToggleSinGuf,
  onToggleSinInforme,
  onClear,
  shownCount,
}: FamiliasFilterBarProps) {
  const [open, setOpen] = useState(true);
  const pills = buildPills(filters, searchInput);
  const isDirty =
    !!searchInput ||
    filters.sinGuf ||
    filters.sinInformeSocial ||
    filters.estado !== "activa";

  return (
    <div className="bocatas-card overflow-hidden rounded-2xl p-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls="familias-filter-panel"
        className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left transition hover:bg-muted/60"
      >
        <span className="flex min-w-0 items-center gap-3">
          <ChevronRight
            className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
            aria-hidden="true"
          />
          <span className="flex min-w-0 items-center gap-2">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="text-h3">Filtros</span>
            {!open && (
              <span className="flex min-w-0 flex-wrap items-center gap-1">
                {pills.map((p, i) => (
                  <Badge key={i} variant="outline" className="font-medium">
                    {p}
                  </Badge>
                ))}
              </span>
            )}
          </span>
        </span>
        <span className="shrink-0 text-body-sm tabular-stat text-muted-foreground">
          {shownCount} {shownCount === 1 ? "familia" : "familias"}
        </span>
      </button>

      {open && (
        <div id="familias-filter-panel" className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
          <div className="relative min-w-[260px] flex-1">
            <Search
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={searchInput}
              onChange={(e) => onSearchInputChange(e.target.value)}
              onBlur={onCommitSearch}
              onKeyDown={(e) => {
                if (e.key === "Enter") onCommitSearch();
              }}
              placeholder="Buscar nombre o número de familia..."
              className="pl-9"
              aria-label="Buscar familia"
            />
          </div>
          <Select value={filters.estado} onValueChange={(v) => onEstadoChange(v as FamiliasFilters["estado"])}>
            <SelectTrigger className="w-[140px]" aria-label="Filtrar por estado">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="activa">Activas</SelectItem>
              <SelectItem value="baja">En baja</SelectItem>
              <SelectItem value="all">Todas</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant={filters.sinGuf ? "default" : "outline"}
            onClick={onToggleSinGuf}
            aria-pressed={filters.sinGuf}
          >
            Sin GUF
          </Button>
          <Button
            variant={filters.sinInformeSocial ? "default" : "outline"}
            onClick={onToggleSinInforme}
            aria-pressed={filters.sinInformeSocial}
          >
            Sin informe social
          </Button>
          {isDirty && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClear}
              className="text-muted-foreground hover:text-primary"
            >
              Limpiar
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
