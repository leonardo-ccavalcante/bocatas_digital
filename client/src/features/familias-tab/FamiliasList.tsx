import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, AlertTriangle } from "lucide-react";
import { useFamiliasFilters } from "./hooks/useFamiliasFilters";

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

export function FamiliasList({ onRowClick }: FamiliasListProps) {
  const { filters, setSearch, setEstado, setSinGuf, setSinInformeSocial } =
    useFamiliasFilters();
  const [searchInput, setSearchInput] = useState(filters.search ?? "");

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

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[280px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onBlur={() => setSearch(searchInput)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setSearch(searchInput);
            }}
            placeholder="Buscar nombre o número de familia..."
            className="pl-9"
            aria-label="Buscar familia"
          />
        </div>
        <Select
          value={filters.estado}
          onValueChange={(v) => setEstado(v as typeof filters.estado)}
        >
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
          onClick={() => setSinGuf(!filters.sinGuf)}
          aria-pressed={filters.sinGuf}
        >
          Sin GUF
        </Button>
        <Button
          variant={filters.sinInformeSocial ? "default" : "outline"}
          onClick={() => setSinInformeSocial(!filters.sinInformeSocial)}
          aria-pressed={filters.sinInformeSocial}
        >
          Sin informe social
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm" aria-label="Lista de familias">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-2 font-medium">N&ordm;</th>
                <th className="text-left p-2 font-medium">Titular</th>
                <th className="text-left p-2 font-medium">Miembros</th>
                <th className="text-left p-2 font-medium">Estado</th>
                <th className="text-left p-2 font-medium">Informe</th>
                <th
                  className="text-left p-2 font-medium w-8"
                  aria-label="Atención"
                ></th>
              </tr>
            </thead>
            <tbody>
              {((families ?? []) as FamilyRow[]).map((f) => {
                const titular = f.persons;
                const sinInforme = !f.informe_social;
                const sinGuf = !f.alta_en_guf;
                const totalMiembros =
                  (f.num_adultos ?? 0) + (f.num_menores_18 ?? 0);
                return (
                  <tr
                    key={f.id}
                    className="border-t hover:bg-muted/40 cursor-pointer focus:outline-none focus:bg-muted/40"
                    role="button"
                    tabIndex={0}
                    onClick={() => onRowClick(f.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onRowClick(f.id);
                      }
                    }}
                    aria-label={`Abrir detalle de familia #${f.familia_numero ?? ""}`}
                  >
                    <td className="p-2 font-mono">{f.familia_numero}</td>
                    <td className="p-2">
                      {titular
                        ? `${titular.nombre ?? ""} ${titular.apellidos ?? ""}`.trim()
                        : "—"}
                    </td>
                    <td className="p-2">{totalMiembros}</td>
                    <td className="p-2">
                      <Badge
                        variant={f.estado === "activa" ? "default" : "outline"}
                      >
                        {f.estado === "activa" ? "Activa" : "En baja"}
                      </Badge>
                    </td>
                    <td className="p-2">
                      {sinInforme ? (
                        <Badge variant="destructive">Pendiente</Badge>
                      ) : (
                        <Badge>Al día</Badge>
                      )}
                    </td>
                    <td className="p-2">
                      {(sinGuf || sinInforme) && (
                        <AlertTriangle
                          className="h-4 w-4 text-amber-500"
                          aria-label="Atención requerida"
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
              {(families ?? []).length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="p-8 text-center text-muted-foreground"
                  >
                    Sin resultados
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
