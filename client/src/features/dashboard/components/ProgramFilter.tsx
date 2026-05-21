/**
 * ProgramFilter — v4 restyle: rounded-full pill select matching prototype.
 * Loads programs from tRPC dashboard.getPrograms.
 */
import { trpc } from "@/lib/trpc";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ProgramFilterProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function ProgramFilter({ value, onChange, className }: ProgramFilterProps) {
  const { data: programs, isLoading } = trpc.dashboard.getPrograms.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });

  return (
    <Select value={value} onValueChange={onChange} disabled={isLoading}>
      <SelectTrigger
        className={[
          "text-xs font-medium h-8 rounded-full border-border bg-card shrink-0 px-3 min-w-[160px]",
          className ?? "",
        ].join(" ")}
        aria-label="Filtrar por programa"
      >
        <SelectValue placeholder="Todos los programas" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Todos los programas</SelectItem>
        {(programs ?? []).map((prog) => (
          <SelectItem key={prog.id} value={prog.slug ?? prog.id}>
            {prog.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
