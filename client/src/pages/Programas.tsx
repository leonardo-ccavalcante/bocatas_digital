import { useState } from "react";
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
  // Include superadmin in admin check (task item 8)
  const isAdmin = user?.role === "admin" || user?.role === "superadmin";
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

  // Show only root programs (parent_id == null) — children visible in ProgramaDetalle
  const roots = (programs as ProgramWithCounts[]).filter(
    (p: ProgramWithCounts) => !p.parent_id
  );

  const filtered = roots.filter(
    (p: ProgramWithCounts) =>
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.slug.includes(search.toLowerCase())
  );

  const active = filtered.filter((p: ProgramWithCounts) => p.is_active);
  const inactive = filtered.filter((p: ProgramWithCounts) => !p.is_active);

  return (
    <div className="min-h-screen bg-background">
      {/* Sticky header — icon + title + total count + new-program CTA */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5 text-accent-foreground shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
            <h1 className="text-h2 truncate">Programas</h1>
            <span className="text-xs text-muted-foreground ml-1 shrink-0 tabular-stat">
              {roots.length}
            </span>
          </div>
          {isAdmin && (
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <button
                  className="bocatas-btn-primary text-sm px-4 py-2 min-h-[44px] shrink-0"
                  aria-label="Crear nuevo programa raíz"
                >
                  <span className="text-base leading-none" aria-hidden="true">+</span>
                  <span className="hidden sm:inline ml-1">Nuevo programa</span>
                  <span className="sm:hidden ml-1">Nuevo</span>
                </button>
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

        {/* Search bar — below title row */}
        <div className="max-w-6xl mx-auto px-4 sm:px-8 pb-3">
          <div className="relative">
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="6" />
              <path d="M20 20l-4-4" strokeLinecap="round" />
            </svg>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar programa…"
              aria-label="Buscar programa"
              className="text-sm border border-border rounded-xl pl-9 pr-3 py-2 bg-card w-full focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-6xl mx-auto px-4 sm:px-8 py-6 sm:py-10 space-y-10 sm:space-y-14">
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-48 rounded-2xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-h3">No se encontraron programas</p>
            {search && (
              <p className="text-body-sm mt-1">Intenta con otro término de búsqueda</p>
            )}
          </div>
        ) : (
          <>
            {/* Active programs section */}
            {active.length > 0 && (
              <section aria-labelledby="section-activos">
                <div className="flex items-end justify-between mb-5 sm:mb-7 gap-3">
                  <p
                    id="section-activos"
                    className="text-eyebrow text-foreground flex items-center gap-1.5"
                  >
                    <span className="text-accent-foreground" aria-hidden="true">●</span>
                    Activos · {String(active.length).padStart(2, "0")}
                  </p>
                  <div className="flex-1 h-px mx-3 sm:mx-5 bg-border" />
                  <p className="text-[10px] sm:text-[11px] font-mono text-muted-foreground shrink-0 tabular-stat" aria-hidden="true">
                    01 / {String(active.length).padStart(2, "0")}
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5">
                  {active.map((program: ProgramWithCounts, i: number) => (
                    <ProgramCard
                      key={program.id}
                      program={program}
                      isAdmin={isAdmin}
                      index={i + 1}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Archived programs section */}
            {inactive.length > 0 && (
              <section aria-labelledby="section-archivados">
                <div className="flex items-end justify-between mb-5 sm:mb-7 gap-3">
                  <p
                    id="section-archivados"
                    className="text-eyebrow text-muted-foreground flex items-center gap-1.5"
                  >
                    <span aria-hidden="true">○</span>
                    Archivados · {String(inactive.length).padStart(2, "0")}
                  </p>
                  <div className="flex-1 h-px mx-3 sm:mx-5 bg-border/60" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5 opacity-55">
                  {inactive.map((program: ProgramWithCounts, i: number) => (
                    <ProgramCard
                      key={program.id}
                      program={program}
                      isAdmin={isAdmin}
                      index={active.length + i + 1}
                    />
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
