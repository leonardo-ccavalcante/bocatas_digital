/**
 * SesionManualSearch.tsx — Manual person search chip for session attendance.
 * Searches enrolled persons by name and marks attendance by personId.
 * Used as the fallback when QR scanning is not possible.
 */
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Search, UserCheck } from "lucide-react";

interface SesionManualSearchProps {
  sessionId: string;
  programId: string;
  onSuccess: (personId: string, nombre: string) => void;
}

export function SesionManualSearch({ sessionId, programId, onSuccess }: SesionManualSearchProps) {
  const [query, setQuery] = useState("");

  const { data: persons = [], isLoading } = trpc.programs.getEnrollments.useQuery(
    { programId, limit: 20, offset: 0 },
    { enabled: !!programId, staleTime: 30_000 }
  );

  const utils = trpc.useUtils();
  const marcar = trpc.programs.enlace.marcarAsistenciaSesion.useMutation({
    onSuccess: (_data, variables) => {
      const found = filtered.find((p) => p.person_id === variables.personId);
      const nombre = found
        ? `${found.persons?.[0]?.nombre ?? ""} ${found.persons?.[0]?.apellidos ?? ""}`.trim()
        : "persona";
      toast.success(`Asistencia registrada: ${nombre}`);
      onSuccess(variables.personId, nombre);
      setQuery("");
      void utils.programs.sessions.listSesiones.invalidate({ programId });
    },
    onError: (err) => {
      toast.error("Error al registrar asistencia", { description: err.message });
    },
  });

  type EnrollmentRow = {
    person_id: string;
    persons?: { nombre: string | null; apellidos?: string | null }[] | null;
  };

  const allEnrollments = (persons as unknown as { enrollments: EnrollmentRow[] }).enrollments ?? [];

  const filtered = query.length >= 2
    ? allEnrollments.filter((e) => {
        const nombre = `${e.persons?.[0]?.nombre ?? ""} ${e.persons?.[0]?.apellidos ?? ""}`.toLowerCase();
        return nombre.includes(query.toLowerCase());
      })
    : [];

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <Input
          placeholder="Buscar persona inscrita (2+ caracteres)..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
          aria-label="Buscar persona inscrita para registrar asistencia"
        />
      </div>

      {isLoading && query.length >= 2 && (
        <div className="space-y-2">
          {[1, 2].map((i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
        </div>
      )}

      {query.length >= 2 && !isLoading && filtered.length === 0 && (
        <p className="text-sm text-muted-foreground py-2 text-center">
          No se encontró ninguna persona inscrita con ese nombre.
        </p>
      )}

      {filtered.map((enrollment) => {
        const nombre = `${enrollment.persons?.[0]?.nombre ?? ""} ${enrollment.persons?.[0]?.apellidos ?? ""}`.trim();
        return (
          <div
            key={enrollment.person_id}
            className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5"
          >
            <span className="text-sm font-medium">{nombre}</span>
            <Button
              size="sm"
              variant="outline"
              className="text-xs gap-1.5"
              disabled={marcar.isPending && marcar.variables?.personId === enrollment.person_id}
              onClick={() => marcar.mutate({ sessionId, personId: enrollment.person_id })}
              aria-label={`Marcar asistencia de ${nombre}`}
            >
              <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
              Marcar
            </Button>
          </div>
        );
      })}
    </div>
  );
}
