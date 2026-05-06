/**
 * TrendChart — hand-rolled SVG bar chart for 4-week attendance trend.
 * Replaces recharts (~104 KB gz) with ~3 KB of SVG markup.
 * Mobile-first: 360px viewport, no horizontal scroll.
 */
import { useState } from "react";
import type { TrendPoint } from "../schemas";

interface TrendChartProps {
  data: TrendPoint[];
  isLoading?: boolean;
}

// McKinsey palette: single color, no gradient noise
const BAR_COLOR = "#b45309"; // amber-700 — matches Bocatas brand

const CHART_HEIGHT = 180;
const PADDING_TOP = 24; // room for top labels
const PADDING_BOTTOM = 24; // room for x-axis labels
const PADDING_LEFT = 36; // room for y-axis labels
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
      <div className="w-full h-[200px] rounded-lg border border-border bg-card flex items-end justify-around px-6 pb-6 gap-3 animate-pulse">
        {[40, 65, 55, 80].map((h, i) => (
          <div
            key={i}
            className="flex-1 rounded-t bg-muted"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
    );
  }

  const hasData = data.some((d) => d.count > 0);

  if (!hasData) {
    return (
      <div className="w-full rounded-lg border border-border bg-card p-4">
        <p className="text-[11px] font-semibold tracking-widest uppercase text-muted-foreground mb-3">
          Tendencia — últimas 4 semanas
        </p>
        <div className="h-[160px] flex items-center justify-center text-sm text-muted-foreground">
          Sin datos para el período seleccionado
        </div>
      </div>
    );
  }

  // SVG viewBox uses fixed coordinate system; ResponsiveContainer effect via preserveAspectRatio.
  const VIEW_W = 320;
  const VIEW_H = CHART_HEIGHT;
  const plotW = VIEW_W - PADDING_LEFT - PADDING_RIGHT;
  const plotH = VIEW_H - PADDING_TOP - PADDING_BOTTOM;
  const maxValue = niceMax(Math.max(...data.map((d) => d.count)));
  const yTicks = [0, maxValue / 2, maxValue];
  const slot = plotW / data.length;
  const barW = slot * (1 - BAR_GAP_RATIO);

  return (
    <div className="w-full rounded-lg border border-border bg-card p-4">
      <p className="text-[11px] font-semibold tracking-widest uppercase text-muted-foreground mb-3">
        Tendencia — últimas 4 semanas
      </p>
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
          const h = (d.count / maxValue) * plotH;
          const y = PADDING_TOP + plotH - h;
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
                height={h}
                rx={3}
                ry={3}
                fill={BAR_COLOR}
                tabIndex={0}
                aria-label={`${d.label}: ${d.count} personas`}
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
          className="mt-2 rounded border border-border bg-card px-3 py-1 text-sm inline-block"
        >
          <span className="font-semibold text-foreground">{data[hovered].label}: </span>
          <span className="font-bold text-foreground tabular-nums">
            {data[hovered].count.toLocaleString("es-ES")}
          </span>{" "}
          <span className="text-muted-foreground">personas</span>
        </div>
      )}
    </div>
  );
}
