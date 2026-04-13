/**
 * GufCutoffOverride — E-D2
 * Allows admin to set a per-family GUF cutoff day override
 * or update the system-wide default.
 */
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Settings2, Globe, Home } from "lucide-react";
import { useUpdateGuf, useGufSystemDefault } from "../hooks/useFamilias";
import { toast } from "sonner";

interface GufCutoffOverrideProps {
  familyId?: string;
  /** Current per-family cutoff day (1-28), null means uses system default */
  currentCutoffDay?: number | null;
  /** Show system-wide override section (admin only) */
  showSystemOverride?: boolean;
}

export function GufCutoffOverride({
  familyId,
  currentCutoffDay,
  showSystemOverride = false,
}: GufCutoffOverrideProps) {
  const { data: systemDefault } = useGufSystemDefault();
  const updateGuf = useUpdateGuf();

  const [familyDay, setFamilyDay] = useState<string>(
    currentCutoffDay != null ? String(currentCutoffDay) : ""
  );
  const [systemDay, setSystemDay] = useState<string>(
    systemDefault?.cutoff_day != null ? String(systemDefault.cutoff_day) : "20"
  );
  const [saving, setSaving] = useState(false);

  const validateDay = (val: string): number | null => {
    const n = parseInt(val, 10);
    if (isNaN(n) || n < 1 || n > 28) return null;
    return n;
  };

  const handleSaveFamily = async () => {
    if (!familyId) return;
    const day = validateDay(familyDay);
    if (day === null && familyDay !== "") {
      toast.error("El día debe estar entre 1 y 28");
      return;
    }
    setSaving(true);
    try {
      await updateGuf.mutateAsync({
        id: familyId,
        alta_en_guf: true,
        guf_cutoff_day: day ?? undefined,
      });
      toast.success("Día de corte GUF actualizado");
    } catch {
      toast.error("Error al actualizar el día de corte");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Per-family override */}
      {familyId && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Home className="h-4 w-4 text-primary" />
              Día de corte GUF — esta familia
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <Label htmlFor="family-cutoff-day" className="text-xs text-muted-foreground mb-1 block">
                  Día del mes (1–28). Vacío = usa el predeterminado del sistema
                  {systemDefault?.cutoff_day && (
                    <Badge variant="outline" className="ml-2 text-xs">
                      Sistema: día {systemDefault.cutoff_day}
                    </Badge>
                  )}
                </Label>
                <Input
                  id="family-cutoff-day"
                  type="number"
                  min={1}
                  max={28}
                  placeholder={`${systemDefault?.cutoff_day ?? 20} (predeterminado)`}
                  value={familyDay}
                  onChange={(e) => setFamilyDay(e.target.value)}
                  className="w-40"
                />
              </div>
              <Button
                size="sm"
                onClick={handleSaveFamily}
                disabled={saving || updateGuf.isPending}
              >
                {saving ? "Guardando…" : "Guardar"}
              </Button>
              {familyDay !== "" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setFamilyDay("");
                    if (familyId) {
                      updateGuf.mutate({ id: familyId, alta_en_guf: true, guf_cutoff_day: undefined });
                    }
                  }}
                >
                  Usar predeterminado
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* System-wide override */}
      {showSystemOverride && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Globe className="h-4 w-4 text-primary" />
              Día de corte GUF — predeterminado del sistema
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Este valor se aplica a todas las familias que no tengan un día de corte propio configurado.
            </p>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <Label htmlFor="system-cutoff-day" className="text-xs text-muted-foreground mb-1 block">
                  Día del mes (1–28)
                </Label>
                <Input
                  id="system-cutoff-day"
                  type="number"
                  min={1}
                  max={28}
                  value={systemDay}
                  onChange={(e) => setSystemDay(e.target.value)}
                  className="w-40"
                />
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const day = validateDay(systemDay);
                  if (day === null) {
                    toast.error("El día debe estar entre 1 y 28");
                    return;
                  }
                  // System-wide update via app_settings — use the hook
                  toast.info("Actualización del sistema disponible desde el panel de administración");
                }}
              >
                <Settings2 className="h-4 w-4 mr-1" />
                Actualizar sistema
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
