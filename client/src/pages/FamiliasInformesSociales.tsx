/**
 * FamiliasInformesSociales — Informes tab content.
 * Lists Programa de Familia families by informe-social status and hosts the
 * bulk generator. Status derives from the SINGLE source of truth
 * (informeDocStatus over informe_social_fecha) — never the informe_social
 * boolean, and never an ad-hoc day threshold.
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
import { informeDocStatus, type InformeDocStatus } from "@shared/informeFreshness";
import { useInformesSociales } from "@/features/families/hooks/useFamilias";
import { SocialReportPanel } from "@/features/families/components/SocialReportPanel";
import { BulkInformeGenerator } from "@/features/families/components/BulkInformeGenerator";
import { Link } from "wouter";

type FilterType = "all" | "pendientes" | "por_renovar" | "al_dia";

interface InformeFamily {
  id: string;
  familia_numero: number | string;
  estado?: string;
  informe_social: boolean;
  informe_social_fecha: string | null;
  persons?: { nombre?: string; apellidos?: string; telefono?: string } | null;
}

const FILTER_LABELS: Record<FilterType, string> = {
  all: "Todas",
  pendientes: "Sin informe",
  por_renovar: "Por renovar / vencidos",
  al_dia: "Al día",
};

const FILTER_ICONS: Record<FilterType, React.ReactNode> = {
  all: <FileText className="h-4 w-4" />,
  pendientes: <AlertTriangle className="h-4 w-4 text-red-500" />,
  por_renovar: <Clock className="h-4 w-4 text-amber-500" />,
  al_dia: <CheckCircle2 className="h-4 w-4 text-green-500" />,
};

// Visual + label per status (color + icon, never text-only — WCAG / low literacy).
const STATUS_META: Record<
  InformeDocStatus,
  { label: string; badgeClass: string; textClass: string; cardClass: string }
> = {
  sin_informe: {
    label: "Sin informe social",
    badgeClass: "border-red-300 text-red-700",
    textClass: "text-red-600 font-medium",
    cardClass: "border-red-200 bg-red-50/30",
  },
  vencido: {
    label: "Informe vencido",
    badgeClass: "border-red-300 text-red-700",
    textClass: "text-red-600 font-medium",
    cardClass: "border-red-200 bg-red-50/30",
  },
  por_renovar: {
    label: "Por renovar",
    badgeClass: "border-amber-300 text-amber-700",
    textClass: "text-amber-700",
    cardClass: "border-amber-200 bg-amber-50/30",
  },
  al_dia: {
    label: "Al día",
    badgeClass: "border-green-300 text-green-700",
    textClass: "text-green-700",
    cardClass: "border-green-200 bg-green-50/30",
  },
};

const statusOf = (f: InformeFamily): InformeDocStatus =>
  f.informe_social ? informeDocStatus(f.informe_social_fecha) : "sin_informe";

export default function FamiliasInformesSociales() {
  const [filter, setFilter] = useState<FilterType>("all");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading } = useInformesSociales(filter);
  const families = (data ?? []) as InformeFamily[];

  const filteredFamilies = families.filter((f) => {
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
    const headers = ["Nº Familia", "Titular", "Estado", "Informe Social", "Fecha Informe", "Estado informe"];
    const rows = filteredFamilies.map((f) => [
      f.familia_numero,
      `${f.persons?.nombre ?? ""} ${f.persons?.apellidos ?? ""}`.trim(),
      f.estado ?? "",
      f.informe_social ? "Sí" : "No",
      f.informe_social_fecha ?? "—",
      STATUS_META[statusOf(f)].label,
    ]);
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bocatas_informes_sociales_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const countBy = (pred: (s: InformeDocStatus) => boolean) =>
    families.filter((f) => pred(statusOf(f))).length;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-display-2 flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" />
            Informes sociales
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gestión de informes sociales de todas las familias activas. Se renuevan cada 6 meses
            (revisión recomendada a los 5).
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={!filteredFamilies.length}>
          <Download className="h-4 w-4 mr-2" />
          Exportar CSV
        </Button>
      </div>

      {/* Bulk generation */}
      <BulkInformeGenerator />

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre o nº familia…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
            aria-label="Buscar familias"
          />
        </div>
        <Select value={filter} onValueChange={(v) => setFilter(v as FilterType)}>
          <SelectTrigger className="w-56 h-9" aria-label="Filtrar por estado del informe">
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
          Sin informe / vencido: {countBy((s) => s === "sin_informe" || s === "vencido")}
        </Badge>
        <Badge variant="outline" className="border-amber-300 text-amber-700">
          <Clock className="h-3.5 w-3.5 mr-1" />
          Por renovar: {countBy((s) => s === "por_renovar")}
        </Badge>
        <Badge variant="outline" className="border-green-300 text-green-700">
          <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
          Al día: {countBy((s) => s === "al_dia")}
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
          {filteredFamilies.map((family) => {
            const isExpanded = expandedId === family.id;
            const status = statusOf(family);
            const meta = STATUS_META[status];

            return (
              <Card key={family.id} className={meta.cardClass}>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-sm font-medium truncate">
                        {family.persons?.nombre} {family.persons?.apellidos}
                        <span className="text-xs text-muted-foreground ml-2">
                          #{family.familia_numero}
                        </span>
                      </CardTitle>
                      <p className={`text-xs mt-0.5 ${meta.textClass}`}>{meta.label}</p>
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
                      informeSocialFecha={family.informe_social_fecha}
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
