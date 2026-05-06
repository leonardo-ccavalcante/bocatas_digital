import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { FamilyIntake } from "../../schemas";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function Step3Docs({ form }: { form: any }) {
  const fields: { key: keyof FamilyIntake; label: string }[] = [
    { key: "docs_identidad", label: "Documentos de identidad recibidos" },
    { key: "padron_recibido", label: "Padrón municipal recibido" },
    { key: "justificante_recibido", label: "Justificante de ingresos recibido" },
    { key: "informe_social", label: "Informe social recibido" },
    { key: "consent_bocatas", label: "Consentimiento Bocatas firmado" },
    { key: "consent_banco_alimentos", label: "Consentimiento Banco de Alimentos firmado" },
  ];

  return (
    <div className="space-y-3">
      {fields.map(({ key, label }) => (
        <div key={key} className="flex items-center justify-between p-3 border rounded-lg">
          <Label className="text-sm">{label}</Label>
          <Switch
            checked={!!form.watch(key)}
            onCheckedChange={(v) => form.setValue(key, v as never)}
          />
        </div>
      ))}
      {form.watch("informe_social") && (
        <div>
          <Label className="text-xs">Fecha del informe social</Label>
          <Input
            type="date"
            {...form.register("informe_social_fecha")}
          />
        </div>
      )}
    </div>
  );
}
