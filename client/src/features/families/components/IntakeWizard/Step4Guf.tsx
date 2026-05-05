import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function Step4Guf({ form }: { form: any }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between p-3 border rounded-lg">
        <div>
          <Label className="text-sm font-medium">Alta en GUF</Label>
          <p className="text-xs text-muted-foreground">Gestión Unificada de Familias</p>
        </div>
        <Switch
          checked={!!form.watch("alta_en_guf")}
          onCheckedChange={(v) => form.setValue("alta_en_guf", v)}
        />
      </div>
      {form.watch("alta_en_guf") && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Fecha de alta GUF</Label>
            <Input type="date" {...form.register("fecha_alta_guf")} />
          </div>
          <div>
            <Label className="text-xs">Día de corte mensual (1-31)</Label>
            <Input
              type="number"
              min={1}
              max={31}
              {...form.register("guf_cutoff_day", { valueAsNumber: true })}
              placeholder="Ej: 15"
            />
          </div>
        </div>
      )}
    </div>
  );
}
