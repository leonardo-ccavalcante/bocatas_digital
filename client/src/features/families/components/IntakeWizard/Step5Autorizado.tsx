import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function Step5Autorizado({ form }: { form: any }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between p-3 border rounded-lg">
        <div>
          <Label className="text-sm font-medium">¿Tiene persona autorizada para recoger?</Label>
          <p className="text-xs text-muted-foreground">Persona distinta al titular</p>
        </div>
        <Switch
          checked={!!form.watch("autorizado")}
          onCheckedChange={(v) => form.setValue("autorizado", v)}
        />
      </div>
      {form.watch("autorizado") && (
        <div>
          <Label className="text-xs">Nombre de la persona autorizada</Label>
          <Input
            {...form.register("persona_recoge")}
            placeholder="Nombre completo"
          />
        </div>
      )}
    </div>
  );
}
