import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { FileStack, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { trpc } from "@/lib/trpc";

const CHUNK = 25;

/**
 * Bulk-generate the Informe de Valoración Social for every ready active family.
 * Dry-run preview (ready / skipped-with-reason) → chunked (≤25) client-driven
 * loop with a progress bar → generated/skipped/failed summary. Never sends file
 * bytes back; each chunk persists server-side and is idempotent to re-run.
 */
export function BulkInformeGenerator() {
  const utils = trpc.useUtils();
  const preview = trpc.families.bulkPreviewSocialReports.useQuery(undefined, { enabled: false });
  const genChunk = trpc.families.bulkGenerateChunk.useMutation();

  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<{ generated: number; skipped: number; failed: number } | null>(null);

  const p = preview.data;

  async function runAll() {
    if (!p?.ready.length) return;
    setRunning(true);
    setSummary(null);
    setDone(0);
    setTotal(p.ready.length);
    let generated = 0;
    let skipped = 0;
    let failed = 0;
    const ids = p.ready.map((r) => r.family_id);
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK);
      try {
        const res = await genChunk.mutateAsync({ family_ids: slice });
        for (const r of res.results) {
          if (r.outcome === "generated") generated++;
          else if (r.outcome === "skipped") skipped++;
          else failed++;
        }
      } catch {
        failed += slice.length;
      }
      setDone((prev) => prev + slice.length);
    }
    setSummary({ generated, skipped, failed });
    setRunning(false);
    utils.families.getInformesSociales.invalidate();
    toast.success(`Generados ${generated} · omitidos ${skipped} · fallidos ${failed}`);
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <FileStack className="h-4 w-4 text-primary" aria-hidden="true" />
          Generación masiva de informes
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => preview.refetch()}
            disabled={preview.isFetching || running}
          >
            {preview.isFetching ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" aria-hidden="true" /> : null}
            Previsualizar
          </Button>
          <Button
            size="sm"
            onClick={runAll}
            disabled={running || !p?.ready.length}
            aria-label="Generar y actualizar informes de todas las familias activas listas"
          >
            {running ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" aria-hidden="true" /> : null}
            Generar/actualizar todas ({p?.ready.length ?? 0})
          </Button>
        </div>

        {p && (
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge variant="outline" className="border-green-300 text-green-700">
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" aria-hidden="true" /> Listas: {p.counts.ready}
            </Badge>
            <Badge variant="outline" className="border-amber-300 text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5 mr-1" aria-hidden="true" /> A omitir: {p.counts.skipped}
            </Badge>
            <Badge variant="outline">Total: {p.counts.total}</Badge>
          </div>
        )}

        {running && (
          <div className="space-y-1" aria-live="polite">
            <Progress value={total ? Math.round((done / total) * 100) : 0} />
            <p className="text-xs text-muted-foreground">{done} / {total} procesadas…</p>
          </div>
        )}

        {summary && (
          <p className="text-sm" aria-live="polite">
            Resultado: <span className="text-green-700 font-medium">{summary.generated} generados</span>,{" "}
            <span className="text-amber-700">{summary.skipped} omitidos</span>,{" "}
            <span className="text-red-600">{summary.failed} fallidos</span>.
          </p>
        )}

        {p && p.skipped.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">
              Ver {p.skipped.length} familia(s) a omitir y su motivo
            </summary>
            <ul className="mt-2 space-y-1">
              {p.skipped.map((s) => (
                <li key={s.familia_numero} className="text-xs">
                  <span className="font-medium">#{s.familia_numero}</span> — {s.label}
                </li>
              ))}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
