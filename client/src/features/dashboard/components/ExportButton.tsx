/**
 * ExportButton — triggers CSV export respecting active filters.
 * Toast on error. Filename: bocatas_asistencias_YYYY-MM.csv
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { downloadCSV } from "../utils/exportCSV";
import type { Period } from "../schemas";

interface ExportButtonProps {
  locationId: string;
  currentPeriod: Period;
}

function getPeriodDates(period: Period): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const today = now.toISOString().split("T")[0];

  if (period === "today") {
    return { dateFrom: today, dateTo: today };
  } else if (period === "week") {
    const day = now.getDay();
    const diff = day === 0 ? 6 : day - 1;
    const monday = new Date(now);
    monday.setDate(now.getDate() - diff);
    return { dateFrom: monday.toISOString().split("T")[0], dateTo: today };
  } else {
    const firstOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    return { dateFrom: firstOfMonth, dateTo: today };
  }
}

export function ExportButton({ locationId, currentPeriod }: ExportButtonProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const utils = trpc.useUtils();

  const handleExport = async () => {
    setIsExporting(true);
    setErrorMsg(null);
    const { dateFrom, dateTo } = getPeriodDates(currentPeriod);

    try {
      const result = await utils.dashboard.getCSVExport.fetch({
        dateFrom,
        dateTo,
        locationId,
      });

      if (!result.rows.length) {
        setErrorMsg("Sin datos para exportar en el período seleccionado.");
        return;
      }

      downloadCSV(result.rows, result.dateFrom);
    } catch (err) {
      setErrorMsg("Error al exportar. Inténtalo de nuevo.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <Button
        variant="outline"
        size="sm"
        onClick={handleExport}
        disabled={isExporting}
        className="w-full gap-2 text-sm font-medium"
      >
        {isExporting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        {isExporting ? "Exportando..." : "Exportar CSV"}
      </Button>
      {errorMsg && (
        <p className="text-xs text-destructive text-center">{errorMsg}</p>
      )}
    </div>
  );
}
