/**
 * MapaChoropleth — Stage S2 thin-slice skeleton.
 *
 * In the thin slice, this renders the distritoStats result as a text list.
 * Stage S3 client-mapa Feature Agent replaces with react-leaflet choropleth +
 * GeoJSON polygons. The data shape and component contract stay the same; only
 * the visualization changes.
 */

import { DISTRITO_LABELS } from "@shared/madrid/distritos";

import type { DistritoStatRow } from "../../../../server/routers/mapa";

interface MapaChoroplethProps {
  rows: readonly DistritoStatRow[];
  kAnonymityFloor: number;
}

export function MapaChoropleth({ rows, kAnonymityFloor }: MapaChoroplethProps) {
  return (
    <ul
      className="space-y-2"
      data-testid="mapa-distrito-list"
      aria-label="Distritos de Madrid con número de familias atendidas"
    >
      {rows.map((row) => (
        <li
          key={row.distrito}
          className="flex items-baseline justify-between rounded-lg border border-border bg-card px-4 py-2"
          data-distrito={row.distrito}
        >
          <span className="font-medium">{DISTRITO_LABELS[row.distrito]}</span>
          {row.count === null ? (
            <span
              className="text-muted-foreground"
              title={`<${kAnonymityFloor} familias`}
            >
              &lt;{kAnonymityFloor} familias
            </span>
          ) : (
            <span className="tabular-nums">{row.count} familias</span>
          )}
        </li>
      ))}
    </ul>
  );
}
