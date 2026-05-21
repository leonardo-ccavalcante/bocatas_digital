import { useState } from "react";
import { toast } from "sonner";
import { Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";

interface FollowUpsPanelProps {
  familyId: string;
}

const TODAY = new Date().toISOString().slice(0, 10);

export function FollowUpsPanel({ familyId }: FollowUpsPanelProps) {
  const [open, setOpen] = useState(false);
  const [fecha, setFecha] = useState("");
  const [notas, setNotas] = useState("");

  const utils = trpc.useUtils();

  const { data: followUps = [], isLoading } = trpc.families.listFollowUps.useQuery(
    { family_id: familyId, limit: 3 },
    { enabled: !!familyId, staleTime: 30_000 },
  );

  const create = trpc.families.createFollowUp.useMutation({
    onSuccess: () => {
      void utils.families.listFollowUps.invalidate({ family_id: familyId });
      void utils.families.getLatestFollowUp.invalidate({ family_id: familyId });
      void utils.families.getById.invalidate({ id: familyId });
      toast.success("Seguimiento registrado");
      setOpen(false);
      setFecha("");
      setNotas("");
    },
    onError: (e) => {
      toast.error(e.message);
    },
  });

  function handleSubmit() {
    if (!fecha) {
      toast.error("La fecha es obligatoria");
      return;
    }
    create.mutate({ family_id: familyId, fecha, notas: notas || undefined });
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setFecha("");
      setNotas("");
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" aria-hidden="true" />
            Seguimientos ({followUps.length})
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOpen(true)}
            aria-label="Añadir seguimiento"
          >
            Añadir seguimiento
          </Button>
        </CardHeader>

        <CardContent className="space-y-3">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : followUps.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin seguimientos registrados.</p>
          ) : (
            <ul className="space-y-3">
              {followUps.map((fu) => (
                <li key={fu.id} className="border-l-2 border-border pl-3 space-y-1">
                  <time
                    dateTime={fu.fecha}
                    className="text-xs font-medium text-muted-foreground"
                  >
                    {new Date(fu.fecha).toLocaleDateString("es-ES")}
                  </time>
                  {fu.notas && (
                    <p className="text-sm">{fu.notas}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Añadir seguimiento</DialogTitle>
            <DialogDescription>
              Registra una nueva anotación de seguimiento para esta familia.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label htmlFor="seguimiento-fecha">Fecha del seguimiento</Label>
              <Input
                id="seguimiento-fecha"
                type="date"
                max={TODAY}
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="seguimiento-notas">Notas (opcional)</Label>
              <Textarea
                id="seguimiento-notas"
                rows={3}
                maxLength={2000}
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Observaciones del seguimiento…"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={create.isPending || !fecha}
            >
              {create.isPending ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
