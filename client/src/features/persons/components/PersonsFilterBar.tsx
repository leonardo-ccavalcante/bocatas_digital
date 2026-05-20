/**
 * PersonsFilterBar — sticky header with search input (⌘K / Ctrl-K focus),
 * filter pills (estado + fase), and result count bar.
 *
 * Filters are applied client-side: the tRPC search procedure only accepts
 * { query: string }, so estado/fase cannot be server-driven without changing
 * the contract. This component surfaces the filter state; the parent page
 * applies the actual filtering logic.
 */
import { useEffect, useRef } from "react";
import { Link } from "wouter";
import { Search, UserPlus, X } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export type EstadoFilter = "todas" | "Activa" | "Inactiva";
export type SortBy = "recent" | "name";

export interface PersonsFilterBarProps {
  query: string;
  onQueryChange: (q: string) => void;
  estadoFilter: EstadoFilter;
  onEstadoChange: (v: EstadoFilter) => void;
  faseFilter: string;
  onFaseChange: (v: string) => void;
  sortBy: SortBy;
  onSortChange: (v: SortBy) => void;
  counts: {
    total: number;
    filtered: number;
    byEstado: Record<EstadoFilter, number>;
    byFase: Record<string, number>;
    fases: string[];
  };
  showNewButton: boolean;
}

const FASE_SHORT: Record<string, string> = {
  acogida: "Acogida",
  estabilizacion: "Estabilización",
  formacion: "Formación",
  insercion_laboral: "Inserción",
  autonomia: "Autonomía",
};

export function PersonsFilterBar({
  query,
  onQueryChange,
  estadoFilter,
  onEstadoChange,
  faseFilter,
  onFaseChange,
  sortBy,
  onSortChange,
  counts,
  showNewButton,
}: PersonsFilterBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const filtersActive =
    query.length > 0 || estadoFilter !== "todas" || faseFilter !== "todas";

  // ⌘K / Ctrl-K shortcut to focus the search input
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const clearFilters = () => {
    onQueryChange("");
    onEstadoChange("todas");
    onFaseChange("todas");
  };

  return (
    <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border">
      <div className="max-w-5xl mx-auto px-4 sm:px-8 pt-5 pb-3">

        {/* Title row */}
        <div className="flex items-end justify-between gap-3 mb-4">
          <div className="min-w-0">
            <p className="text-eyebrow text-muted-foreground">Directorio</p>
            <h1 className="text-h2 mt-1 text-foreground">Personas</h1>
          </div>
          {showNewButton && (
            <Link href="/personas/nueva">
              <button className="bocatas-btn-primary shrink-0 px-4 py-2 min-h-[40px] text-sm gap-1.5 flex items-center">
                <UserPlus className="h-4 w-4" aria-hidden="true" />
                Nueva persona
              </button>
            </Link>
          )}
        </div>

        {/* Search input (44px hit target) */}
        <div className="relative">
          <Search
            className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none"
            aria-hidden="true"
          />
          <input
            ref={inputRef}
            data-testid="personas-search-input"
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Buscar por nombre, apellidos o ID…"
            aria-label="Buscar persona"
            className="
              w-full h-11 pl-10 pr-24 border border-border rounded-xl
              text-body bg-card text-foreground placeholder:text-muted-foreground
              focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40
              focus-visible:border-ring/60 transition
            "
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {query && (
              <button
                onClick={() => onQueryChange("")}
                aria-label="Limpiar búsqueda"
                className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-accent text-muted-foreground transition-colors"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
            <kbd className="hidden sm:inline-flex items-center gap-0.5 text-[10px] font-mono text-muted-foreground border border-border rounded px-1.5 py-0.5 bg-card">
              ⌘K
            </kbd>
          </div>
        </div>

        {/* Estado filter pills */}
        <div className="mt-3 flex items-center gap-1.5 overflow-x-auto -mx-1 px-1 pb-1">
          <ToggleGroup
            type="single"
            value={estadoFilter}
            onValueChange={(v) => {
              if (v) onEstadoChange(v as EstadoFilter);
            }}
            className="flex flex-wrap gap-1.5"
            aria-label="Filtrar por estado"
          >
            <FilterPill
              value="todas"
              label="Todas"
              count={counts.byEstado.todas}
            />
            <FilterPill
              value="Activa"
              label="Activas"
              count={counts.byEstado.Activa}
              dotColor="bg-green-600"
            />
            <FilterPill
              value="Inactiva"
              label="Inactivas"
              count={counts.byEstado.Inactiva}
              dotColor="bg-muted-foreground/40"
            />
          </ToggleGroup>

          {/* Divider */}
          {counts.fases.length > 0 && (
            <span className="mx-1 h-5 w-px bg-border shrink-0" aria-hidden="true" />
          )}

          {/* Fase filter pills */}
          {counts.fases.length > 0 && (
            <ToggleGroup
              type="single"
              value={faseFilter}
              onValueChange={(v) => {
                if (v) onFaseChange(v);
              }}
              className="flex flex-wrap gap-1.5"
              aria-label="Filtrar por fase de itinerario"
            >
              <FilterPill
                value="todas"
                label="Todas las fases"
                count={counts.byFase["todas"] ?? counts.total}
              />
              {counts.fases.map((f) => (
                <FilterPill
                  key={f}
                  value={f}
                  label={FASE_SHORT[f] ?? f}
                  count={counts.byFase[f] ?? 0}
                />
              ))}
            </ToggleGroup>
          )}
        </div>

        {/* Result count + sort + clear */}
        <div className="mt-3 flex items-center justify-between gap-3 text-body-sm">
          <p
            data-testid="personas-result-count"
            className="text-muted-foreground"
            aria-live="polite"
            aria-atomic="true"
          >
            <strong className="text-foreground tabular-stat">{counts.filtered}</strong>
            {" "}de{" "}
            <span className="tabular-stat">{counts.total}</span>
            {filtersActive && (
              <button
                onClick={clearFilters}
                className="ml-2 underline decoration-dotted hover:text-foreground transition-colors"
              >
                Limpiar filtros
              </button>
            )}
          </p>
          <SortSegmented value={sortBy} onChange={onSortChange} />
        </div>

      </div>
    </div>
  );
}

// ─── FilterPill — individual toggle pill ─────────────────────────────────────

interface FilterPillProps {
  value: string;
  label: string;
  count: number;
  dotColor?: string;
}

function FilterPill({ value, label, count, dotColor }: FilterPillProps) {
  return (
    <ToggleGroupItem
      value={value}
      aria-label={`${label} (${count})`}
      className={`
        shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-full
        text-[12px] font-medium transition-all border
        data-[state=on]:bg-foreground data-[state=on]:text-background data-[state=on]:border-foreground
        data-[state=off]:bg-card data-[state=off]:text-foreground data-[state=off]:border-border
        data-[state=off]:hover:bg-accent
      `}
    >
      {dotColor && (
        <span
          aria-hidden="true"
          className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotColor}`}
        />
      )}
      <span>{label}</span>
      <span className="text-[10px] tabular-stat opacity-70">{count}</span>
    </ToggleGroupItem>
  );
}

// ─── SortSegmented — compact sort control ────────────────────────────────────

const SORT_OPTIONS: Array<{ value: SortBy; label: string }> = [
  { value: "recent", label: "Reciente" },
  { value: "name", label: "Nombre" },
];

interface SortSegmentedProps {
  value: SortBy;
  onChange: (v: SortBy) => void;
}

function SortSegmented({ value, onChange }: SortSegmentedProps) {
  return (
    <div
      role="group"
      aria-label="Ordenar personas"
      className="inline-flex items-center bg-muted rounded-lg p-0.5 border border-border"
    >
      {SORT_OPTIONS.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`
            h-6 px-2.5 rounded-md text-[11px] font-medium transition-all
            ${value === o.value
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
            }
          `}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
