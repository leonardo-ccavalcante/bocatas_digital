/**
 * FamiliasInformesSociales — E-E7
 * Batch social report view: lists families grouped by informe social status.
 * Admin/trabajador_social can update informe social dates in bulk.
 */
import { useState } from "react";
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
import { FileText, Search, AlertTriangle, CheckCircle2, Clock, Download } from "lucide-react";
import { useInformesSociales } from "@/features/families/hooks/useFamilias";
import { SocialReportPanel } from "@/features/families/components/SocialReportPanel";
import { Link } from "wouter";

type FilterType = "all" | "pendientes" | "por_renovar" | "al_dia";

const FILTER_LABELS: Record<FilterType, string> = {
  all: "Todas",
  pendientes: "Sin informe",
  por_renovar: "Por renovar (≤30 días)",
  al_dia: "Al día",
};

const FILTER_ICONS: Record<FilterType, React.ReactNode> = {
  all: <FileText className="h-4 w-4" />,
  pendientes: <AlertTriangle className="h-4 w-4 text-red-500" />,
  por_renovar: <Clock className="h-4 w-4 text-amber-500" />,
  al_dia: <CheckCircle2 className="h-4 w-4 text-green-500" />,
};

export default function FamiliasInformesSociales() {
  const [filter, setFilter] = useState<FilterType>("all");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: families, isLoading } = useInformesSociales(filter);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filteredFamilies = ((families as any[]) ?? []).filter((f: any) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      f.persons?.nombre?.toLowerCase().includes(q) ||
      f.persons?.apellidos?.toLowerCase().includes(q) ||
      String(f.familia_numero).includes(q)
    );
  });

  const handleExportCSV = () => {
    if (!filteredFamilies.length) return;
    const headers = ["Nº Familia", "Titular", "Estado", "Informe Social", "Fecha Informe", "Días para Renovar"];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = filteredFamilies.map((f: any) => {
      const daysLeft = f.informe_social
        ? Math.ceil(
            (new Date(f.informe_social).getTime() + 330 * 86400000 - Date.now()) / 86400000
          )
        : null;
      return [
        f.familia_numero,
        `${f.persons?.nombre ?? ""} ${f.persons?.apellidos ?? ""}`.trim(),
        f.estado,
        f.informe_social ? "Sí" : "No",
        f.informe_social ?? "—",
        daysLeft !== null ? daysLeft : "—",
      ];
    });
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bocatas_informes_sociales_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" />
            Informes sociales
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gestión de informes sociales de todas las familias activas.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={!filteredFamilies.length}>
          <Download className="h-4 w-4 mr-2" />
          Exportar CSV
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
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
            {(Object.keys(FILTER_LABELS) as FilterType[]).map((key) => (
              <SelectItem key={key} value={key}>
                <span className="flex items-center gap-2">
                  {FILTER_ICONS[key]}
                  {FILTER_LABELS[key]}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Summary badges */}
      <div className="flex gap-3 flex-wrap text-sm">
        <Badge variant="outline" className="border-red-300 text-red-700">
          <AlertTriangle className="h-3.5 w-3.5 mr-1" />
          Sin informe: {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {((families as any[]) ?? []).filter((f: any) => !f.informe_social).length}
        </Badge>
        <Badge variant="outline" className="border-amber-300 text-amber-700">
          <Clock className="h-3.5 w-3.5 mr-1" />
          Por renovar: {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {((families as any[]) ?? []).filter((f: any) => {
            if (!f.informe_social) return false;
            const daysLeft = Math.ceil(
              (new Date(f.informe_social).getTime() + 330 * 86400000 - Date.now()) / 86400000
            );
            return daysLeft >= 0 && daysLeft <= 30;
          }).length}
        </Badge>
        <Badge variant="outline" className="border-green-300 text-green-700">
          <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
          Al día: {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {((families as any[]) ?? []).filter((f: any) => {
            if (!f.informe_social) return false;
            const daysLeft = Math.ceil(
              (new Date(f.informe_social).getTime() + 330 * 86400000 - Date.now()) / 86400000
            );
            return daysLeft > 30;
          }).length}
        </Badge>
      </div>

      {/* Family list */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground text-center py-8">Cargando…</p>
      ) : filteredFamilies.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          No hay familias que coincidan con el filtro.
        </p>
      ) : (
        <div className="space-y-3">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {filteredFamilies.map((family: any) => {
            const isExpanded = expandedId === family.id;
            const daysLeft = family.informe_social
              ? Math.ceil(
                  (new Date(family.informe_social).getTime() + 330 * 86400000 - Date.now()) / 86400000
                )
              : null;

            const statusColor =
              !family.informe_social
                ? "border-red-200 bg-red-50/30"
                : daysLeft !== null && daysLeft <= 30
                ? "border-amber-200 bg-amber-50/30"
                : "border-green-200 bg-green-50/30";

            return (
              <Card key={family.id} className={statusColor}>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-sm font-medium truncate">
                        {family.persons?.nombre} {family.persons?.apellidos}
                        <span className="text-xs text-muted-foreground ml-2">
                          #{family.familia_numero}
                        </span>
                      </CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {!family.informe_social ? (
                          <span className="text-red-600 font-medium">Sin informe social</span>
                        ) : daysLeft !== null && daysLeft <= 0 ? (
                          <span className="text-red-600 font-medium">Informe vencido</span>
                        ) : daysLeft !== null && daysLeft <= 30 ? (
                          <span className="text-amber-700">Vence en {daysLeft} días</span>
                        ) : (
                          <span className="text-green-700">
                            Al día · vence en {daysLeft} días
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Link href={`/familias/${family.id}`}>
                        <Button size="sm" variant="ghost" className="h-7 text-xs">
                          Ver ficha
                        </Button>
                      </Link>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => setExpandedId(isExpanded ? null : family.id)}
                      >
                        {isExpanded ? "Cerrar" : "Actualizar"}
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                {isExpanded && (
                  <CardContent className="pt-0">
                    <SocialReportPanel
                      familyId={family.id}
                      informeSocial={family.informe_social}
                      informeSocialFecha={family.informe_social}
                    />
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
