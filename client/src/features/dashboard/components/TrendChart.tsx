/**
 * TrendChart — McKinsey/Colenusbaumer bar chart for 4-week attendance trend.
 * Recharts tree-shaken: ONLY 6 named imports.
 * Mobile-first: 360px viewport, no horizontal scroll.
 */
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import type { TrendPoint } from "../schemas";

interface TrendChartProps {
  data: TrendPoint[];
  isLoading?: boolean;
}

// McKinsey palette: single color, no gradient noise
const BAR_COLOR = "#b45309"; // amber-700 — matches Bocatas brand

// Custom tooltip — clean, minimal
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded border border-border bg-card px-3 py-2 shadow-sm text-sm">
      <p className="font-semibold text-foreground">{label}</p>
      <p className="text-muted-foreground">
        <span className="font-bold text-foreground tabular-nums">
          {payload[0].value.toLocaleString("es-ES")}
        </span>{" "}
        personas
      </p>
    </div>
  );
}

export function TrendChart({ data, isLoading = false }: TrendChartProps) {
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

  return (
    <div className="w-full rounded-lg border border-border bg-card p-4">
      {/* McKinsey: section title left-aligned, small caps */}
      <p className="text-[11px] font-semibold tracking-widest uppercase text-muted-foreground mb-3">
        Tendencia — últimas 4 semanas
      </p>

      {!hasData ? (
        <div className="h-[160px] flex items-center justify-center text-sm text-muted-foreground">
          Sin datos para el período seleccionado
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <BarChart
            data={data}
            margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
            barCategoryGap="30%"
          >
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
              width={36}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "var(--muted)", opacity: 0.4 }} />
            <Bar
              dataKey="count"
              fill={BAR_COLOR}
              radius={[3, 3, 0, 0]}
              label={{
                position: "top",
                fontSize: 11,
                fill: "var(--muted-foreground)",
                formatter: (v: number) => (v > 0 ? v.toLocaleString("es-ES") : ""),
              }}
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
