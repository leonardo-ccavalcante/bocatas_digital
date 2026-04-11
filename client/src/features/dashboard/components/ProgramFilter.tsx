/**
 * ProgramFilter — Dropdown to filter dashboard by program.
 * Loads programs from tRPC dashboard.getPrograms.
 * McKinsey style: clean select, no decorative elements.
 */
import { trpc } from "@/lib/trpc";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

interface ProgramFilterProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function ProgramFilter({ value, onChange, className }: ProgramFilterProps) {
  const { data: programs, isLoading } = trpc.dashboard.getPrograms.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return <Skeleton className={`h-9 w-40 ${className ?? ""}`} />;
  }

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        className={`h-9 text-sm ${className ?? ""}`}
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
