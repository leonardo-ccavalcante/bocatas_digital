import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Shield, ShieldCheck, ShieldOff, Calendar } from "lucide-react";
import { useUpdateGuf, useGufSystemDefault } from "../hooks/useFamilias";

interface GufPanelProps {
  familyId: string;
  altaEnGuf: boolean;
  fechaAltaGuf: string | null;
  gufCutoffDay: number | null;
  gufVerifiedAt: string | null;
}

export function GufPanel({
  familyId,
  altaEnGuf,
  fechaAltaGuf,
  gufCutoffDay,
  gufVerifiedAt,
}: GufPanelProps) {
  const [editing, setEditing] = useState(false);
  const [localAlta, setLocalAlta] = useState(altaEnGuf);
  const [localFecha, setLocalFecha] = useState(fechaAltaGuf ?? "");
  const [localCutoff, setLocalCutoff] = useState<number | "">(gufCutoffDay ?? "");

  const updateGuf = useUpdateGuf();
  const { data: systemDefault } = useGufSystemDefault();

  const handleSave = async () => {
    try {
      await updateGuf.mutateAsync({
        id: familyId,
        alta_en_guf: localAlta,
        fecha_alta_guf: localFecha || undefined,
        guf_cutoff_day: typeof localCutoff === "number" ? localCutoff : undefined,
      });
      toast.success("Datos GUF actualizados");
      setEditing(false);
    } catch {
      toast.error("Error al actualizar GUF");
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          {altaEnGuf ? (
            <ShieldCheck className="h-4 w-4 text-green-600" />
          ) : (
            <ShieldOff className="h-4 w-4 text-muted-foreground" />
          )}
          GUF — Gestión Unificada de Familias
        </CardTitle>
        {!editing && (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            Editar
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {!editing ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Estado:</span>
              <Badge variant={altaEnGuf ? "default" : "secondary"}>
                {altaEnGuf ? "Alta en GUF" : "Sin alta en GUF"}
              </Badge>
            </div>
            {altaEnGuf && (
              <>
                {fechaAltaGuf && (
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-3 w-3 text-muted-foreground" />
                    <span className="text-muted-foreground">Fecha alta:</span>
                    <span>{fechaAltaGuf}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm">
                  <Shield className="h-3 w-3 text-muted-foreground" />
                  <span className="text-muted-foreground">Día de corte:</span>
                  <span>
                    {gufCutoffDay ?? systemDefault?.cutoff_day ?? "—"} de cada mes
                  </span>
                </div>
                {gufVerifiedAt && (
                  <div className="flex items-center gap-2 text-sm">
                    <ShieldCheck className="h-3 w-3 text-green-600" />
                    <span className="text-muted-foreground">Verificado:</span>
                    <span>{new Date(gufVerifiedAt).toLocaleDateString("es-ES")}</span>
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Alta en GUF</Label>
              <Switch checked={localAlta} onCheckedChange={setLocalAlta} />
            </div>
            {localAlta && (
              <>
                <div>
                  <Label className="text-xs">Fecha de alta GUF</Label>
                  <Input
                    type="date"
                    value={localFecha}
                    onChange={(e) => setLocalFecha(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs">
                    Día de corte mensual (1-31)
                    {systemDefault?.cutoff_day && (
                      <span className="text-muted-foreground ml-1">
                        (defecto del sistema: {systemDefault.cutoff_day})
                      </span>
                    )}
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    max={31}
                    value={localCutoff}
                    onChange={(e) =>
                      setLocalCutoff(e.target.value ? parseInt(e.target.value) : "")
                    }
                    placeholder={String(systemDefault?.cutoff_day ?? 15)}
                  />
                </div>
              </>
            )}
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSave} disabled={updateGuf.isPending}>
                {updateGuf.isPending ? "Guardando..." : "Guardar"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
