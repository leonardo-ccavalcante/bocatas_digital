import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { AlertTriangle, ArrowRight, ChevronRight } from "lucide-react";
import { useFamiliasFilters } from "./hooks/useFamiliasFilters";
import { FamiliasFilterBar } from "./FamiliasFilterBar";
import { FamiliaMembersExpand } from "./FamiliaMembersExpand";

interface FamiliasListProps {
  onRowClick: (familyId: string) => void;
}

// tRPC infers persons as a union that doesn't include the joined shape, so we
// widen once here. The cast is intentional and localised — do not re-cast
// inside the map body.
interface FamilyRow {
  id: string;
  familia_numero?: number | null;
  estado?: string | null;
  informe_social?: boolean | null;
  alta_en_guf?: boolean | null;
  num_adultos?: number | null;
  num_menores_18?: number | null;
  persons?: { nombre?: string | null; apellidos?: string | null } | null;
}

const TABLE_COLS = 8;

export function FamiliasList({ onRowClick }: FamiliasListProps) {
  const { filters, setSearch, setEstado, setSinGuf, setSinInformeSocial, reset } =
    useFamiliasFilters();
  const [searchInput, setSearchInput] = useState(filters.search ?? "");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Keep the input in sync if filters change externally (e.g. saved-view click,
  // back-button navigation). Trade-off: if the user is mid-typing when a saved
  // view applies, their un-committed text is overwritten. Acceptable at Phase 1
  // because saved views are infrequent and explicit. Do not "fix" by adding an
  // isFocused guard without checking the saved-view UX flow first.
  useEffect(() => {
    setSearchInput(filters.search ?? "");
  }, [filters.search]);

  const { data: families, isLoading } = trpc.families.getAll.useQuery({
    search: filters.search,
    estado: filters.estado,
    sin_alta_guf: filters.sinGuf || undefined,
    sin_informe_social: filters.sinInformeSocial || undefined,
  });

  const rows = (families ?? []) as FamilyRow[];

  return (
    <div className="space-y-4">
      <FamiliasFilterBar
        filters={filters}
        searchInput={searchInput}
        onSearchInputChange={setSearchInput}
        onCommitSearch={() => setSearch(searchInput)}
        onEstadoChange={setEstado}
        onToggleSinGuf={() => setSinGuf(!filters.sinGuf)}
        onToggleSinInforme={() => setSinInformeSocial(!filters.sinInformeSocial)}
        onClear={() => {
          setSearchInput("");
          reset();
        }}
        shownCount={rows.length}
      />

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <div className="bocatas-card overflow-hidden rounded-2xl p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" aria-label="Lista de familias">
              <thead className="bg-muted/60 text-eyebrow text-muted-foreground">
                <tr>
                  <th className="w-10 px-2 py-3" aria-label="Expandir"></th>
                  <th className="px-2 py-3 text-left">N&ordm;</th>
                  <th className="px-2 py-3 text-left">Titular</th>
                  <th className="px-2 py-3 text-left">Miembros</th>
                  <th className="px-2 py-3 text-left">Estado</th>
                  <th className="px-2 py-3 text-left">Informe</th>
                  <th className="w-12 px-2 py-3" aria-label="Atención"></th>
                  <th className="w-10 px-2 py-3" aria-label="Acciones"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((f) => {
                  const titular = f.persons;
                  const sinInforme = !f.informe_social;
                  const sinGuf = !f.alta_en_guf;
                  const totalMiembros =
                    (f.num_adultos ?? 0) + (f.num_menores_18 ?? 0);
                  const isOpen = expandedId === f.id;
                  const titularName = titular
                    ? `${titular.nombre ?? ""} ${titular.apellidos ?? ""}`.trim()
                    : "";
                  return (
                    <FamiliaRowGroup
                      key={f.id}
                      familyId={f.id}
                      familiaNumero={f.familia_numero}
                      titularName={titularName}
                      totalMiembros={totalMiembros}
                      estado={f.estado}
                      sinInforme={sinInforme}
                      sinGuf={sinGuf}
                      isOpen={isOpen}
                      onToggleExpand={() => setExpandedId(isOpen ? null : f.id)}
                      onRowClick={() => onRowClick(f.id)}
                    />
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={TABLE_COLS}
                      className="p-8 text-center text-muted-foreground"
                    >
                      Sin resultados
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {rows.length > 0 && (
            <div className="border-t border-border bg-muted/40 px-5 py-3 text-body-sm text-muted-foreground">
              {rows.length} {rows.length === 1 ? "familia" : "familias"} · clic para
              vista rápida · flecha para ficha completa
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface FamiliaRowGroupProps {
  familyId: string;
  familiaNumero?: number | null;
  titularName: string;
  totalMiembros: number;
  estado?: string | null;
  sinInforme: boolean;
  sinGuf: boolean;
  isOpen: boolean;
  onToggleExpand: () => void;
  onRowClick: () => void;
}

function FamiliaRowGroup({
  familyId,
  familiaNumero,
  titularName,
  totalMiembros,
  estado,
  sinInforme,
  sinGuf,
  isOpen,
  onToggleExpand,
  onRowClick,
}: FamiliaRowGroupProps) {
  return (
    <>
      {/* role="button" on <tr> preserves table semantics. Wrapping each <td> in
          a <button> would break <table>'s accessibility tree. */}
      <tr
        className="cursor-pointer border-t border-border hover:bg-muted/60 focus:bg-muted/60 focus:outline-none"
        role="button"
        tabIndex={0}
        onClick={onRowClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onRowClick();
          }
        }}
        aria-label={`Abrir detalle de familia${familiaNumero != null ? ` #${familiaNumero}` : ""}`}
      >
        <td className="px-2 py-3 text-center">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand();
            }}
            className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-transform hover:bg-muted hover:text-foreground"
            aria-label={isOpen ? "Ocultar miembros" : "Ver miembros"}
            aria-expanded={isOpen}
            aria-controls={`members-${familyId}`}
          >
            <ChevronRight
              className={`h-4 w-4 transition-transform ${isOpen ? "rotate-90" : ""}`}
              aria-hidden="true"
            />
          </button>
        </td>
        <td className="px-2 py-3 font-mono text-muted-foreground">
          {familiaNumero != null ? `#${familiaNumero}` : "—"}
        </td>
        <td className="px-2 py-3 font-semibold text-foreground">
          {titularName || "—"}
        </td>
        <td className="px-2 py-3 tabular-stat">{totalMiembros}</td>
        <td className="px-2 py-3">
          <Badge variant={estado === "activa" ? "default" : "outline"}>
            {estado === "activa" ? "Activa" : "En baja"}
          </Badge>
        </td>
        <td className="px-2 py-3">
          {sinInforme ? (
            <Badge variant="destructive">Pendiente</Badge>
          ) : (
            <Badge>Al día</Badge>
          )}
        </td>
        <td className="px-2 py-3 text-center">
          {(sinGuf || sinInforme) && (
            <AlertTriangle
              className="inline h-4 w-4 text-amber-500"
              aria-label="Atención requerida"
            />
          )}
        </td>
        <td className="px-2 py-3 text-right">
          <Link
            href={`/familias/${familyId}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex text-muted-foreground hover:text-primary"
            aria-label="Abrir ficha completa"
          >
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </td>
      </tr>
      {isOpen && <FamiliaMembersExpand familyId={familyId} colSpan={TABLE_COLS} />}
    </>
  );
}
