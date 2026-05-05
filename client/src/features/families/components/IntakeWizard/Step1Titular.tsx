import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle, ChevronRight, Search } from "lucide-react";
import { usePrograms } from "@/features/programs/hooks/usePrograms";

interface Step1TitularProps {
  titularId?: string;
  selectedTitular: { id: string; name: string } | null;
  programId: string;
  onSelectTitular: (id: string, name: string) => void;
  onSelectProgram: (id: string) => void;
}

export function Step1Titular({
  titularId,
  selectedTitular,
  programId,
  onSelectTitular,
  onSelectProgram,
}: Step1TitularProps) {
  const { programs, isLoading: programsLoading } = usePrograms();
  const [query, setQuery] = useState("");
  const { data: results, isLoading } = trpc.persons.search.useQuery(
    { query },
    { enabled: query.length >= 2, staleTime: 5_000 }
  );
  const { data: preloaded } = trpc.persons.getById.useQuery(
    { id: titularId! },
    { enabled: !!titularId }
  );

  // Programa selector — shown once a titular is chosen (or pre-loaded). Required before "Siguiente".
  const ProgramaSelector = (
    <div className="space-y-2">
      <Label className="text-sm font-medium">Programa</Label>
      <Select value={programId} onValueChange={onSelectProgram} disabled={programsLoading}>
        <SelectTrigger>
          <SelectValue placeholder={programsLoading ? "Cargando programas..." : "Seleccionar programa"} />
        </SelectTrigger>
        <SelectContent>
          {programs.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.icon} {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!programId && (
        <p className="text-xs text-muted-foreground">
          Programa requerido para registrar la familia.
        </p>
      )}
    </div>
  );

  if (titularId && preloaded) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 p-4 border rounded-lg bg-green-50 dark:bg-green-950">
          <CheckCircle className="h-5 w-5 text-green-600" />
          <div>
            <p className="font-medium">{preloaded.nombre} {preloaded.apellidos}</p>
            <p className="text-sm text-muted-foreground">
              {preloaded.tipo_documento && preloaded.numero_documento
                ? `${preloaded.tipo_documento}: ${preloaded.numero_documento}`
                : "Sin documento registrado"}
            </p>
          </div>
          <Badge variant="secondary" className="ml-auto">Ya registrado</Badge>
        </div>
        {!selectedTitular && (
          <Button onClick={() => onSelectTitular(preloaded.id, `${preloaded.nombre} ${preloaded.apellidos}`)}>
            Confirmar titular <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        )}
        {selectedTitular && ProgramaSelector}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!selectedTitular && (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar por nombre o apellidos..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {isLoading && <p className="text-sm text-muted-foreground">Buscando...</p>}
          {results && results.length > 0 && (
            <div className="space-y-2">
              {results.map((p) => (
                <button
                  key={p.id}
                  className="w-full text-left p-3 border rounded-lg hover:bg-accent transition-colors"
                  onClick={() => onSelectTitular(p.id, `${p.nombre} ${p.apellidos}`)}
                >
                  <p className="font-medium">{p.nombre} {p.apellidos}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.fecha_nacimiento ? `Nac: ${p.fecha_nacimiento}` : "Sin fecha de nacimiento"}
                  </p>
                </button>
              ))}
            </div>
          )}
          {results && results.length === 0 && query.length >= 2 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No se encontró ninguna persona con ese nombre. El titular debe estar registrado en el sistema.
            </p>
          )}
        </>
      )}
      {selectedTitular && (
        <>
          <div className="flex items-center gap-3 p-3 border rounded-lg bg-green-50 dark:bg-green-950">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <p className="font-medium text-sm">{selectedTitular.name}</p>
          </div>
          {ProgramaSelector}
        </>
      )}
    </div>
  );
}
