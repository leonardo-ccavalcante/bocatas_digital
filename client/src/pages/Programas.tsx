import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAuth } from "@/_core/hooks/useAuth";
import { useProgramsWithCounts } from "@/features/programs/hooks/usePrograms";
import { ProgramCard } from "@/features/programs/components/ProgramCard";
import { ProgramForm } from "@/features/programs/components/ProgramForm";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import type { ProgramFormValues, ProgramWithCounts } from "@/features/programs/schemas";

export default function Programas() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const { programs, isLoading } = useProgramsWithCounts();
  const utils = trpc.useUtils();

  const createProgram = trpc.programs.create.useMutation({
    onSuccess: () => {
      utils.programs.getAllWithCounts.invalidate();
      utils.programs.getAll.invalidate();
      toast.success("Programa creado correctamente");
      setCreateOpen(false);
    },
    onError: (error) => {
      toast.error("Error al crear programa", { description: error.message });
    },
  });

  const filtered = (programs as ProgramWithCounts[]).filter(
    (p: ProgramWithCounts) =>
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.slug.includes(search.toLowerCase())
  );

  const active = filtered.filter((p: ProgramWithCounts) => p.is_active);
  const inactive = filtered.filter((p: ProgramWithCounts) => !p.is_active);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-background/95 backdrop-blur sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-foreground">Programas</h1>
            <p className="text-sm text-muted-foreground">
              {programs.length} programa{programs.length !== 1 ? "s" : ""} configurado{programs.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Input
              placeholder="Buscar programa..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-48 sm:w-64"
            />
            {isAdmin && (
              <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">+ Nuevo programa</Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Crear nuevo programa</DialogTitle>
                  </DialogHeader>
                  <ProgramForm
                    isLoading={createProgram.isPending}
                    onSubmit={(values: ProgramFormValues) => createProgram.mutate(values)}
                    onCancel={() => setCreateOpen(false)}
                  />
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-8">
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-32 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-lg font-medium">No se encontraron programas</p>
            {search && (
              <p className="text-sm mt-1">
                Intenta con otro término de búsqueda
              </p>
            )}
          </div>
        ) : (
          <>
            {/* Active programs */}
            {active.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
                  Activos ({active.length})
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {active.map((program: ProgramWithCounts) => (
                    <ProgramCard key={program.id} program={program} isAdmin={isAdmin} />
                  ))}
                </div>
              </section>
            )}

            {/* Inactive programs */}
            {inactive.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
                  Inactivos ({inactive.length})
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 opacity-60">
                  {inactive.map((program: ProgramWithCounts) => (
                    <ProgramCard key={program.id} program={program} isAdmin={isAdmin} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
