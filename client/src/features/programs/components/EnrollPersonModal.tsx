import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { useEnrollPerson } from "../hooks/useEnrollment";

interface EnrollPersonModalProps {
  programId: string;
  programName: string;
  trigger?: React.ReactNode;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function EnrollPersonModal({ programId, programName, trigger, onSuccess, onCancel }: EnrollPersonModalProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [notas, setNotas] = useState("");

  const { data: searchResults, isLoading: isSearching } = trpc.persons.search.useQuery(
    { query: search },
    { enabled: search.length >= 2, staleTime: 10_000 }
  );

  const enroll = useEnrollPerson(programId);

  const handleEnroll = () => {
    if (!selectedPersonId) return;
    enroll.mutate(
      { personId: selectedPersonId, programId, notas: notas || undefined },
      {
        onSuccess: () => {
          setOpen(false);
          setSearch("");
          setSelectedPersonId(null);
          setNotas("");
          onSuccess?.();
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? <Button size="sm">+ Inscribir persona</Button>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Inscribir en {programName}</DialogTitle>
          <DialogDescription>
            Busca a la persona por nombre o apellidos y confirma la inscripción.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Search */}
          <div className="space-y-2">
            <Label htmlFor="person-search">Buscar persona</Label>
            <Input
              id="person-search"
              placeholder="Nombre o apellidos..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setSelectedPersonId(null);
              }}
              autoFocus
            />
          </div>

          {/* Results */}
          {search.length >= 2 && (
            <div className="border rounded-md divide-y max-h-48 overflow-y-auto">
              {isSearching ? (
                <div className="p-3 text-sm text-muted-foreground text-center">Buscando...</div>
              ) : !searchResults?.length ? (
                <div className="p-3 text-sm text-muted-foreground text-center">
                  No se encontraron personas
                </div>
              ) : (
                searchResults.map((person) => (
                  <button
                    key={person.id}
                    type="button"
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors ${
                      selectedPersonId === person.id ? "bg-primary/10 font-medium" : ""
                    }`}
                    onClick={() => setSelectedPersonId(person.id)}
                  >
                    <span className="font-medium">
                      {person.apellidos}, {person.nombre}
                    </span>
                    {person.restricciones_alimentarias && (
                      <span className="ml-2 text-xs text-amber-600">
                        ⚠ {person.restricciones_alimentarias}
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
          )}

          {/* Notes */}
          {selectedPersonId && (
            <div className="space-y-2">
              <Label htmlFor="notas">Notas (opcional)</Label>
              <Textarea
                id="notas"
                placeholder="Observaciones sobre la inscripción..."
                rows={2}
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                maxLength={500}
              />
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleEnroll}
            disabled={!selectedPersonId || enroll.isPending}
          >
            {enroll.isPending ? "Inscribiendo..." : "Inscribir"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
