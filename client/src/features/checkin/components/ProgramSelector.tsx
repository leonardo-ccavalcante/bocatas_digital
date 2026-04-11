/**
 * ProgramSelector.tsx — Dropdown to select the active program for check-in.
 * Loads programs from DB via tRPC, defaults to is_default=true program.
 */
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BookOpen } from "lucide-react";
import { trpc } from "@/lib/trpc";
import type { CheckinPrograma } from "../machine/checkinMachine";

interface ProgramSelectorProps {
  value: CheckinPrograma;
  onChange: (programa: CheckinPrograma) => void;
}

export function ProgramSelector({ value, onChange }: ProgramSelectorProps) {
  const { data: programs, isLoading } = trpc.checkin.getPrograms.useQuery();

  // Map program slug to CheckinPrograma type
  const programaMap: Record<string, CheckinPrograma> = {
    comedor: "comedor",
    familia: "familia",
    formacion: "formacion",
    atencion_juridica: "atencion_juridica",
    voluntariado: "voluntariado",
    acompanamiento: "acompanamiento",
  };

  const handleChange = (slug: string) => {
    const programa = programaMap[slug] as CheckinPrograma;
    if (programa) onChange(programa);
  };

  return (
    <div className="flex items-center gap-2">
      <BookOpen className="w-4 h-4 text-muted-foreground shrink-0" />
      <Select
        value={value}
        onValueChange={handleChange}
        disabled={isLoading}
      >
        <SelectTrigger className="min-w-44">
          <SelectValue placeholder={isLoading ? "Cargando programas..." : "Seleccionar programa..."} />
        </SelectTrigger>
        <SelectContent>
          {(programs ?? []).map((prog) => (
            <SelectItem key={prog.id} value={prog.slug}>
              {prog.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
