/**
 * ProgramSelector.tsx — Dropdown to select the active program for check-in.
 * Loads programs from DB via tRPC, defaults to is_default=true program.
 * Renders icon + name per option (Job 4, AC1).
 * Role-filtered: voluntarios only see volunteer_can_access=true (enforced server-side).
 */
import { useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BookOpen } from "lucide-react";
import { trpc } from "@/lib/trpc";
import type { CheckinPrograma } from "../machine/checkinMachine";

interface ProgramSelectorProps {
  value: CheckinPrograma;
  onChange: (programa: CheckinPrograma) => void;
}

export function ProgramSelector({ value, onChange }: ProgramSelectorProps) {
  const { data: programs, isLoading } = trpc.checkin.getPrograms.useQuery(undefined, {
    staleTime: 5 * 60 * 1000, // 5 minutes — programs rarely change
  });

  // Default to is_default=true program on first load (Job 4, AC3)
  useEffect(() => {
    if (!value && programs && programs.length > 0) {
      const defaultProgram = programs.find((p) => p.is_default) ?? programs[0];
      if (defaultProgram) {
        onChange(defaultProgram.slug as CheckinPrograma);
      }
    }
  }, [programs, value, onChange]);

  const handleChange = (slug: string) => {
    onChange(slug as CheckinPrograma);
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
              {prog.icon ? `${prog.icon} ${prog.name}` : prog.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
