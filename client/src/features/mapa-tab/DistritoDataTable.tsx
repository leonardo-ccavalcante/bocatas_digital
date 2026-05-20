/**
 * DistritoDataTable — accessible (WCAG 2.1 AA) representation of the choropleth
 * data (TECH_DEBT C-06).
 *
 * The leaflet SVG map encodes values by FILL COLOR only and its polygons are
 * not keyboard/screen-reader reachable. This table is the accessible source of
 * truth, rendered ALWAYS (independent of the GeoJSON asset): values appear as
 * TEXT (never color-only), every distrito has a keyboard-actionable control
 * that mirrors a polygon click, and a legend documents the scale.
 *
 * No PII — only distrito names + aggregate counts (k-anon-suppressed where
 * count < floor).
 */

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DISTRITO_LABELS, type DistritoSlug } from "@shared/madrid/distritos";

import type { DistritoStatRow } from "../../../../server/routers/mapa";

interface DistritoDataTableProps {
  rows: readonly DistritoStatRow[];
  kAnonymityFloor: number;
  layer: "densidad" | "compliance";
  onDistritoClick: (slug: DistritoSlug) => void;
}

function labelFor(slug: string): string {
  return DISTRITO_LABELS[slug as DistritoSlug] ?? slug;
}

/** Value cell text — always TEXT, never color-only (C-06). */
function valueText(
  row: DistritoStatRow,
  layer: "densidad" | "compliance",
  floor: number,
): string {
  if (row.count === null) return `Menos de ${floor} familias`;
  if (layer === "compliance") {
    return row.compliance === undefined
      ? "—"
      : `${Math.round(row.compliance * 100)} %`;
  }
  return `${row.count} familia${row.count === 1 ? "" : "s"}`;
}

export function DistritoDataTable({
  rows,
  kAnonymityFloor,
  layer,
  onDistritoClick,
}: DistritoDataTableProps) {
  const valueHeader = layer === "compliance" ? "Cumplimiento" : "Familias";

  return (
    <div className="space-y-2">
      {/* Legend — documents the scale + the privacy marker, in text. */}
      <div
        data-testid="mapa-legend"
        className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground"
      >
        <span className="font-medium text-foreground">Leyenda:</span>
        <span className="flex items-center gap-1">
          <span
            className="inline-block h-3 w-6 rounded-sm"
            style={{
              background: "linear-gradient(to right, rgb(254,229,217), rgb(180,30,30))",
            }}
            aria-hidden="true"
          />
          {layer === "compliance"
            ? "Menor → mayor cumplimiento"
            : "Menos → más familias"}
        </span>
        <span className="flex items-center gap-1">
          <span
            className="inline-block h-3 w-3 rounded-sm border border-border bg-[#e5e7eb]"
            aria-hidden="true"
          />
          {`Menos de ${kAnonymityFloor} familias (dato protegido)`}
        </span>
      </div>

      <Table>
        <TableCaption className="sr-only">
          Familias atendidas por distrito de Madrid
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Distrito</TableHead>
            <TableHead scope="col">{valueHeader}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.distrito} data-distrito={row.distrito}>
              <TableHead scope="row" className="font-normal">
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-foreground"
                  onClick={() => onDistritoClick(row.distrito as DistritoSlug)}
                  aria-label={`Ver detalle de ${labelFor(row.distrito)}`}
                >
                  {labelFor(row.distrito)}
                </Button>
              </TableHead>
              <TableCell className="tabular-nums">
                {valueText(row, layer, kAnonymityFloor)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
