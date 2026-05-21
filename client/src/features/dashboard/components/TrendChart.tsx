/**
 * TrendChart — v4 restyle: matches prototype bar chart style.
 * Hand-rolled SVG bars (no external chart lib). Last bar highlighted in primary.
 * Mobile-first: 360px viewport, no horizontal scroll.
 */
import { useState } from "react";
import type { TrendPoint } from "../schemas";

interface TrendChartProps {
  data: TrendPoint[];
  isLoading?: boolean;
}

const CHART_HEIGHT = 180;
const PADDING_TOP = 24;
const PADDING_BOTTOM = 24;
const PADDING_LEFT = 36;
const PADDING_RIGHT = 8;
const BAR_GAP_RATIO = 0.3;

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(value)));
  const norm = value / exp;
  if (norm <= 1) return exp;
  if (norm <= 2) return 2 * exp;
  if (norm <= 5) return 5 * exp;
  return 10 * exp;
}

export function TrendChart({ data, isLoading = false }: TrendChartProps) {
  const [hovered, setHovered] = useState<number | null>(null);

  if (isLoading) {
    return (
      <div className="bocatas-card p-4 sm:p-5">
        <div className="flex items-start justify-between mb-3 sm:mb-4 gap-2">
          <div className="space-y-1.5">
            <div className="h-2.5 w-36 rounded bg-muted animate-pulse" />
            <div className="h-2 w-28 rounded bg-muted animate-pulse" />
          </div>
          <div className="h-8 w-16 rounded bg-muted animate-pulse" />
        </div>
        <div className="flex items-end gap-2 h-32 sm:h-40 animate-pulse">
          {[40, 65, 55, 80].map((h, i) => (
            <div key={i} className="flex-1 rounded-t bg-muted" style={{ height: `${h}%` }} />
          ))}
        </div>
      </div>
    );
  }

  const hasData = data.some((d) => d.count > 0);
  const totalCount = data.reduce((sum, d) => sum + d.count, 0);
  const avgPerWeek = data.length > 0 ? Math.round(totalCount / data.length) : 0;

  if (!hasData) {
    return (
      <div className="bocatas-card p-4 sm:p-5">
        <p className="text-eyebrow text-muted-foreground mb-3">
          Tendencia — últimas 4 semanas
        </p>
        <div className="h-[160px] flex items-center justify-center text-body-sm text-muted-foreground">
          Sin datos para el período seleccionado
        </div>
      </div>
    );
  }

  const VIEW_W = 320;
  const VIEW_H = CHART_HEIGHT;
  const plotW = VIEW_W - PADDING_LEFT - PADDING_RIGHT;
  const plotH = VIEW_H - PADDING_TOP - PADDING_BOTTOM;
  const maxValue = niceMax(Math.max(...data.map((d) => d.count)));
  const yTicks = [0, maxValue / 2, maxValue];
  const slot = plotW / data.length;
  const barW = slot * (1 - BAR_GAP_RATIO);
  const lastIndex = data.length - 1;

  return (
    <div className="bocatas-card p-4 sm:p-5">
      <div className="flex items-start justify-between mb-3 sm:mb-4 gap-2 flex-wrap">
        <div>
          <p className="text-eyebrow text-muted-foreground">Tendencia &middot; últimas 4 semanas</p>
          <p className="text-[12px] text-muted-foreground mt-0.5">Personas atendidas / semana</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-muted-foreground">Promedio</p>
          <p className="text-body font-semibold tabular-stat">
            {avgPerWeek.toLocaleString("es-ES")}/sem
          </p>
        </div>
      </div>

      <svg
        width="100%"
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Tendencia de asistencia en las últimas 4 semanas"
      >
        {yTicks.map((v) => {
          const y = PADDING_TOP + plotH - (v / maxValue) * plotH;
          return (
            <text
              key={v}
              x={PADDING_LEFT - 6}
              y={y + 4}
              textAnchor="end"
              fontSize="11"
              fill="var(--muted-foreground)"
            >
              {Math.round(v)}
            </text>
          );
        })}

        {data.map((d, i) => {
          const x = PADDING_LEFT + i * slot + (slot - barW) / 2;
          const h = maxValue > 0 ? (d.count / maxValue) * plotH : 0;
          const y = PADDING_TOP + plotH - Math.max(h, 4);
          const isLast = i === lastIndex;
          const isHov = hovered === i;
          const barFill = isLast
            ? "var(--primary)"
            : isHov
            ? "var(--chart-2)"
            : "color-mix(in srgb, var(--chart-1) 30%, transparent)";

          return (
            <g
              key={i}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(i)}
              onBlur={() => setHovered(null)}
            >
              <rect
                x={x}
                y={y}
                width={barW}
                height={Math.max(h, 4)}
                rx={3}
                ry={3}
                fill={barFill}
                tabIndex={0}
                aria-label={`${d.label}: ${d.count} personas`}
                style={{ transition: "fill 0.15s" }}
              />
              {d.count > 0 && (
                <text
                  x={x + barW / 2}
                  y={y - 6}
                  textAnchor="middle"
                  fontSize="11"
                  fill="var(--muted-foreground)"
                >
                  {d.count.toLocaleString("es-ES")}
                </text>
              )}
              <text
                x={x + barW / 2}
                y={VIEW_H - 6}
                textAnchor="middle"
                fontSize="11"
                fill="var(--muted-foreground)"
              >
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>

      {hovered !== null && (
        <div
          role="status"
          aria-live="polite"
          className="mt-2 rounded border border-border bg-card px-3 py-1 text-body-sm inline-block"
        >
          <span className="font-semibold text-foreground">{data[hovered].label}: </span>
          <span className="font-bold text-foreground tabular-stat">
            {data[hovered].count.toLocaleString("es-ES")}
          </span>{" "}
          <span className="text-muted-foreground">personas</span>
        </div>
      )}
    </div>
  );
}
