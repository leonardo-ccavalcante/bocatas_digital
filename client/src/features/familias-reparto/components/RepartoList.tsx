import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRepartos } from "../hooks/useReparto";

const ESTADO_VARIANT: Record<string, "secondary" | "default" | "outline"> = {
  borrador: "secondary",
  activa: "default",
  cerrada: "outline",
};

interface Props {
  programId: string;
  onSelect: (roundId: string) => void;
}

export function RepartoList({ programId, onSelect }: Props) {
  const { data, isLoading } = useRepartos(programId);

  if (isLoading) return <p className="text-sm text-muted-foreground">Cargando repartos…</p>;
  if (!data?.length) return <p className="text-sm text-muted-foreground">No hay repartos todavía.</p>;

  return (
    <ul className="space-y-2">
      {data.map((r) => (
        <li key={r.id} className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <p className="text-sm font-medium">{r.nombre}</p>
            <p className="text-xs text-muted-foreground">
              {r.fecha_inicio} · {r.dias_reparto} día{r.dias_reparto === 1 ? "" : "s"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={ESTADO_VARIANT[r.estado] ?? "secondary"}>{r.estado}</Badge>
            <Button variant="ghost" size="sm" onClick={() => onSelect(r.id)}>
              Abrir
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
