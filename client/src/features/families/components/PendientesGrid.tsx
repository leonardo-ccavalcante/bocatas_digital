/**
 * PendientesGrid — E-D19 (Job 9: Layer B)
 * Per-member compliance table with 3 filters and CSV export.
 * Shows all families with pending items: missing consents, documents, GUF, informe social.
 */
import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download, Search, AlertTriangle, CheckCircle2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";

type FilterType = "all" | "sin_guf" | "sin_informe" | "sin_consentimiento";

interface PendienteRow {
  family_id: string;
  familia_numero: number;
  titular_nombre: string;
  titular_apellidos: string;
  estado: string;
  sin_guf: boolean;
  sin_informe_social: boolean;
  sin_consentimiento: boolean;
  miembros_pendientes: number;
}

export function PendientesGrid() {
  const [filter, setFilter] = useState<FilterType>("all");
  const [search, setSearch] = useState("");

  const { data: stats, isLoading } = trpc.families.getComplianceStats.useQuery(undefined, {
    staleTime: 60_000,
  });

  // Build rows from compliance stats detail
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawRows: PendienteRow[] = useMemo(() => {
    if (!stats) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((stats as any).detail ?? []) as PendienteRow[];
  }, [stats]);

  const filteredRows = useMemo(() => {
    let rows = rawRows;

    // Apply filter
    if (filter === "sin_guf") rows = rows.filter((r) => r.sin_guf);
    else if (filter === "sin_informe") rows = rows.filter((r) => r.sin_informe_social);
    else if (filter === "sin_consentimiento") rows = rows.filter((r) => r.sin_consentimiento);

    // Apply search
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.titular_nombre?.toLowerCase().includes(q) ||
          r.titular_apellidos?.toLowerCase().includes(q) ||
          String(r.familia_numero).includes(q)
      );
    }

    return rows;
  }, [rawRows, filter, search]);

  const handleExportCSV = () => {
    if (filteredRows.length === 0) return;
    const headers = [
      "Nº Familia",
      "Titular",
      "Estado",
      "Sin GUF",
      "Sin Informe Social",
      "Sin Consentimiento",
      "Miembros Pendientes",
    ];
    const rows = filteredRows.map((r) => [
      r.familia_numero,
      `${r.titular_nombre} ${r.titular_apellidos}`,
      r.estado,
      r.sin_guf ? "Sí" : "No",
      r.sin_informe_social ? "Sí" : "No",
      r.sin_consentimiento ? "Sí" : "No",
      r.miembros_pendientes,
    ]);
    const csv = [headers, ...rows].map((row) => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bocatas_familias_pendientes_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            Familias con pendientes
            {filteredRows.length > 0 && (
              <Badge variant="secondary" className="bg-amber-100 text-amber-800">
                {filteredRows.length}
              </Badge>
            )}
          </CardTitle>
          <Button size="sm" variant="outline" onClick={handleExportCSV} disabled={filteredRows.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            Exportar CSV
          </Button>
        </div>

        {/* Filters */}
        <div className="flex gap-3 flex-wrap mt-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre o nº familia…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          <Select value={filter} onValueChange={(v) => setFilter(v as FilterType)}>
            <SelectTrigger className="w-52 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los pendientes</SelectItem>
              <SelectItem value="sin_guf">Sin alta en GUF</SelectItem>
              <SelectItem value="sin_informe">Sin informe social</SelectItem>
              <SelectItem value="sin_consentimiento">Sin consentimiento</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Cargando…</div>
        ) : filteredRows.length === 0 ? (
          <div className="py-8 text-center">
            <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              {rawRows.length === 0
                ? "No hay familias con pendientes"
                : "No hay familias que coincidan con el filtro"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground uppercase tracking-wide">
                  <th className="text-left py-2 pr-4">Nº</th>
                  <th className="text-left py-2 pr-4">Titular</th>
                  <th className="text-left py-2 pr-4">Estado</th>
                  <th className="text-center py-2 pr-4">GUF</th>
                  <th className="text-center py-2 pr-4">Informe</th>
                  <th className="text-center py-2 pr-4">Consent.</th>
                  <th className="text-center py-2 pr-4">Miembros</th>
                  <th className="text-right py-2">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredRows.map((row) => (
                  <tr key={row.family_id} className="hover:bg-muted/30 transition-colors">
                    <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">
                      #{row.familia_numero}
                    </td>
                    <td className="py-2 pr-4 font-medium">
                      {row.titular_nombre} {row.titular_apellidos}
                    </td>
                    <td className="py-2 pr-4">
                      <Badge
                        variant="outline"
                        className={`text-xs ${
                          row.estado === "activa"
                            ? "border-green-300 text-green-700"
                            : "border-gray-300 text-gray-600"
                        }`}
                      >
                        {row.estado}
                      </Badge>
                    </td>
                    <td className="py-2 pr-4 text-center">
                      {row.sin_guf ? (
                        <AlertTriangle className="h-4 w-4 text-amber-500 mx-auto" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto" />
                      )}
                    </td>
                    <td className="py-2 pr-4 text-center">
                      {row.sin_informe_social ? (
                        <AlertTriangle className="h-4 w-4 text-amber-500 mx-auto" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto" />
                      )}
                    </td>
                    <td className="py-2 pr-4 text-center">
                      {row.sin_consentimiento ? (
                        <AlertTriangle className="h-4 w-4 text-amber-500 mx-auto" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto" />
                      )}
                    </td>
                    <td className="py-2 pr-4 text-center">
                      {row.miembros_pendientes > 0 ? (
                        <Badge variant="secondary" className="bg-amber-100 text-amber-800 text-xs">
                          {row.miembros_pendientes}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-2 text-right">
                      <Link href={`/familias/${row.family_id}`}>
                        <Button size="sm" variant="ghost" className="h-7 text-xs">
                          Ver
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
