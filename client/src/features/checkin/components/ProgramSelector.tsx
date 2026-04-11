/**
 * ProgramSelector.tsx — Dropdown to select the active program for check-in.
 */
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BookOpen } from "lucide-react";
import type { CheckinPrograma } from "../machine/checkinMachine";

const PROGRAMA_LABELS: Record<CheckinPrograma, string> = {
  comedor: "Comedor",
  familia: "Distribución Familias",
  formacion: "Formación",
  atencion_juridica: "Atención Jurídica",
  voluntariado: "Voluntariado",
  acompanamiento: "Acompañamiento",
};

interface ProgramSelectorProps {
  value: CheckinPrograma;
  onChange: (programa: CheckinPrograma) => void;
}

export function ProgramSelector({ value, onChange }: ProgramSelectorProps) {
  return (
    <div className="flex items-center gap-2">
      <BookOpen className="w-4 h-4 text-muted-foreground shrink-0" />
      <Select value={value} onValueChange={(v) => onChange(v as CheckinPrograma)}>
        <SelectTrigger className="min-w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.entries(PROGRAMA_LABELS) as [CheckinPrograma, string][]).map(([key, label]) => (
            <SelectItem key={key} value={key}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
