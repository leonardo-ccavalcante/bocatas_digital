import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface ResumenSlot {
  key: string;
  weekday: string; // "Lunes"
  dayNum: number;
  turno: "manana" | "tarde";
  people: number;
  esFueraMadrid: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  nombre: string;
  total: number;
  slots: ResumenSlot[];
  /** null when valid; a reason string when creation is blocked */
  blockReason: string | null;
  isPending: boolean;
  onConfirm: () => void;
}

/** Read-only "así va a quedar" recap shown before the reparto is created:
 *  every slot with its weekday, turno and people. Lets the operator review the
 *  whole plan (and create from here) without leaving the form. */
export function RepartoResumenDialog({
  open,
  onOpenChange,
  nombre,
  total,
  slots,
  blockReason,
  isPending,
  onConfirm,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Vista previa del reparto</DialogTitle>
          <DialogDescription>
            {nombre ? `«${nombre}» · ` : ""}
            {total} personas en {slots.length} turno{slots.length !== 1 ? "s" : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-72 space-y-1.5 overflow-y-auto">
          {slots.map((s) => (
            <div
              key={s.key}
              className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
            >
              <span className="font-medium">
                {s.weekday} {s.dayNum} · {s.turno === "manana" ? "Mañana" : "Tarde"}
                {s.esFueraMadrid && (
                  <span className="ml-1 text-xs font-normal text-muted-foreground">· Fuera de Madrid</span>
                )}
              </span>
              <Badge variant="secondary">
                {s.people} pers.
              </Badge>
            </div>
          ))}
        </div>

        {blockReason && <p className="text-sm text-destructive">{blockReason}</p>}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Seguir editando
          </Button>
          <Button type="button" onClick={onConfirm} disabled={isPending || blockReason != null}>
            {isPending ? "Creando…" : "Crear reparto"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
