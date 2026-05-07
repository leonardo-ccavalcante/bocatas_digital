/**
 * ProgramaDetalle.tsx — /programas/:slug
 * Job 2, AC1: 404 for unknown slugs
 * Job 2, AC2: KPI cards — total enrolled (activo), new this month, total inactive (completado + rechazado)
 * Job 2, AC3: Enrolled persons table — sortable, fuzzy search
 * Job 2, AC4: "Inscribir persona" button with consent warning
 * Job 2, AC5: Per-row unenroll
 */
import { useState, useMemo } from "react";
import { useParams, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { EnrolledPersonsTable } from "@/features/programs/components/EnrolledPersonsTable";
import { EnrollPersonModal } from "@/features/programs/components/EnrollPersonModal";
import { ProgramForm } from "@/features/programs/components/ProgramForm";
import { ProgramTabs } from "@/features/programs/components/ProgramTabs";
import type { ProgramFormValues } from "@/features/programs/schemas";
import { Users, UserCheck, UserMinus, TrendingUp } from "lucide-react";

interface KPICardProps {
  label: string;
  value: number | undefined;
  isLoading: boolean;
  icon: React.ReactNode;
  accent?: string;
}

function KPICard({ label, value, isLoading, icon, accent = "text-primary" }: KPICardProps) {
  return (
    <div className="bg-card border rounded-lg p-4 flex items-start gap-3">
      <div className={`mt-0.5 shrink-0 ${accent}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground uppercase tracking-wide truncate">{label}</p>
        {isLoading ? (
          <Skeleton className="h-7 w-12 mt-1" />
        ) : (
          <p className="text-2xl font-bold text-foreground mt-0.5">{value ?? 0}</p>
        )}
      </div>
    </div>
  );
}

export default function ProgramaDetalle() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "superadmin";
  const [editOpen, setEditOpen] = useState(false);
  const [enrollOpen, setEnrollOpen] = useState(false);

  const utils = trpc.useUtils();

  const { data: program, isLoading, error } = trpc.programs.getBySlug.useQuery(
    { slug: slug ?? "" },
    { enabled: !!slug }
  );

  // KPI: enrollments with estado=activo
  const { data: activeEnrollments, isLoading: loadingActive } = trpc.programs.getEnrollments.useQuery(
    { programId: program?.id ?? "", estado: "activo", limit: 1, offset: 0 },
    { enabled: !!program?.id }
  );

  // KPI: enrollments with estado=completado
  const { data: completedEnrollments, isLoading: loadingCompleted } = trpc.programs.getEnrollments.useQuery(
    { programId: program?.id ?? "", estado: "completado", limit: 1, offset: 0 },
    { enabled: !!program?.id }
  );

  // KPI: new this month — filter activo enrollments by fecha_inicio in current month
  const thisMonthStart = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  }, []);

  const { data: allActiveEnrollments, isLoading: loadingAllActive } = trpc.programs.getEnrollments.useQuery(
    { programId: program?.id ?? "", estado: "activo", limit: 100, offset: 0 },
    { enabled: !!program?.id }
  );

  const newThisMonth = useMemo(() => {
    if (!allActiveEnrollments?.enrollments) return 0;
    return allActiveEnrollments.enrollments.filter(
      (e) => e.fecha_inicio && e.fecha_inicio >= thisMonthStart
    ).length;
  }, [allActiveEnrollments, thisMonthStart]);

  const updateProgram = trpc.programs.update.useMutation({
    onSuccess: () => {
      utils.programs.getBySlug.invalidate({ slug: slug ?? "" });
      utils.programs.getAllWithCounts.invalidate();
      toast.success("Programa actualizado correctamente");
      setEditOpen(false);
    },
    onError: (error) => {
      toast.error("Error al actualizar programa", { description: error.message });
    },
  });

  const deactivateProgram = trpc.programs.deactivate.useMutation({
    onSuccess: () => {
      utils.programs.getBySlug.invalidate({ slug: slug ?? "" });
      utils.programs.getAllWithCounts.invalidate();
      toast.success("Programa desactivado");
    },
    onError: (error) => {
      toast.error("Error al desactivar programa", { description: error.message });
    },
  });

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full rounded-lg" />
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-20 rounded-lg" />
          <Skeleton className="h-20 rounded-lg" />
          <Skeleton className="h-20 rounded-lg" />
        </div>
      </div>
    );
  }

  if (error || !program) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-16 text-center">
        <p className="text-lg font-medium text-foreground">Programa no encontrado</p>
        <p className="text-sm text-muted-foreground mt-1">
          El programa <strong>{slug}</strong> no existe o fue eliminado.
        </p>
        <Link href="/programas">
          <Button variant="outline" className="mt-4">← Volver a programas</Button>
        </Link>
      </div>
    );
  }

  const defaultValues: ProgramFormValues = {
    slug: program.slug,
    name: program.name,
    description: program.description ?? undefined,
    icon: program.icon ?? "🏠",
    is_default: program.is_default,
    is_active: program.is_active,
    display_order: program.display_order,
    volunteer_can_access: program.volunteer_can_access,
    // Supabase SDK boundary — opaque join result
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    volunteer_can_write: (program as any).volunteer_can_write ?? true,
    // Supabase SDK boundary — opaque join result
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    volunteer_visible_fields: (program as any).volunteer_visible_fields ?? [],
    requires_consents: (program.requires_consents as string[]) ?? [],
    fecha_inicio: program.fecha_inicio ?? undefined,
    fecha_fin: program.fecha_fin ?? undefined,
    config: (program.config as Record<string, unknown>) ?? {},
    responsable_id: program.responsable_id ?? undefined,
  };

  const inactiveCount = (completedEnrollments?.total ?? 0);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-background/95 backdrop-blur sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <Link href="/programas">
                <button className="text-muted-foreground hover:text-foreground text-sm">← Programas</button>
              </Link>
              <span className="text-muted-foreground">/</span>
              <span className="text-2xl">{program.icon}</span>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold text-foreground">{program.name}</h1>
                  {!program.is_active && (
                    <Badge variant="secondary" className="text-xs">Inactivo</Badge>
                  )}
                  {program.is_default && (
                    <Badge className="text-xs bg-primary/10 text-primary border-primary/20">Por defecto</Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground font-mono">{program.slug}</p>
              </div>
            </div>
            {isAdmin && (
              <div className="flex items-center gap-2 shrink-0">
                <Dialog open={editOpen} onOpenChange={setEditOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm">Editar</Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Editar programa</DialogTitle>
                    </DialogHeader>
                    <ProgramForm
                      defaultValues={defaultValues}
                      isLoading={updateProgram.isPending}
                      onSubmit={(values: ProgramFormValues) =>
                        updateProgram.mutate({ id: program.id, data: values })
                      }
                      onCancel={() => setEditOpen(false)}
                    />
                  </DialogContent>
                </Dialog>
                {program.is_active && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => {
                      if (confirm(`¿Desactivar el programa "${program.name}"?`)) {
                        deactivateProgram.mutate({ id: program.id });
                      }
                    }}
                    disabled={deactivateProgram.isPending}
                  >
                    Desactivar
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      {program.slug === "programa_familias" ? (
        <div className="max-w-5xl mx-auto px-4 py-6">
          <ProgramTabs
            program={{ id: program.id, slug: program.slug, nombre: program.name }}
          />
        </div>
      ) : (
        <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
          {/* Program info */}
          {program.description && (
            <p className="text-muted-foreground">{program.description}</p>
          )}

          {/* Meta grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {program.fecha_inicio && (
              <div className="bg-muted/40 rounded-lg p-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Inicio</p>
                <p className="text-sm font-medium mt-0.5">{program.fecha_inicio}</p>
              </div>
            )}
            <div className="bg-muted/40 rounded-lg p-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Fin</p>
              <p className="text-sm font-medium mt-0.5">
                {program.fecha_fin ?? "Sin fecha de fin"}
              </p>
            </div>
            <div className="bg-muted/40 rounded-lg p-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Acceso voluntarios</p>
              <p className="text-sm font-medium mt-0.5">
                {program.volunteer_can_access ? "✅ Sí" : "❌ No"}
              </p>
            </div>
            <div className="bg-muted/40 rounded-lg p-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Orden</p>
              <p className="text-sm font-medium mt-0.5">{program.display_order}</p>
            </div>
          </div>

          {/* KPI Cards — Job 2, AC2 */}
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Estadísticas de inscripción
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <KPICard
                label="Inscritos activos"
                value={activeEnrollments?.total}
                isLoading={loadingActive}
                icon={<Users className="w-5 h-5" />}
                accent="text-emerald-600"
              />
              <KPICard
                label="Nuevos este mes"
                value={newThisMonth}
                isLoading={loadingAllActive}
                icon={<TrendingUp className="w-5 h-5" />}
                accent="text-blue-600"
              />
              <KPICard
                label="Completados / Rechazados"
                value={inactiveCount}
                isLoading={loadingCompleted}
                icon={<UserMinus className="w-5 h-5" />}
                accent="text-muted-foreground"
              />
            </div>
          </div>

          {/* Enrolled persons section */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-foreground">Personas inscritas</h2>
              {isAdmin && (
                <Dialog open={enrollOpen} onOpenChange={setEnrollOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm">+ Inscribir persona</Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                      <DialogTitle>Inscribir persona en {program.name}</DialogTitle>
                    </DialogHeader>
                    <EnrollPersonModal
                      programId={program.id}
                      programName={program.name}
                      onSuccess={() => {
                        setEnrollOpen(false);
                        utils.programs.getEnrollments.invalidate({ programId: program.id });
                      }}
                      onCancel={() => setEnrollOpen(false)}
                    />
                  </DialogContent>
                </Dialog>
              )}
            </div>
            <EnrolledPersonsTable
              programId={program.id}
              isAdmin={isAdmin}
              // Supabase SDK boundary — opaque join result
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              volunteerVisibleFields={(program as any).volunteer_visible_fields ?? []}
            />
          </div>
        </div>
      )}
    </div>
  );
}
