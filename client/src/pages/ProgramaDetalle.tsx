/**
 * ProgramaDetalle.tsx — /programas/:slug
 * Tree-aware program detail page (ADR-0013).
 * - Breadcrumb from ancestor chain
 * - Children section for non-inscribible programs
 * - Enrollment table + funnel KPIs for inscribible programs
 * - Listado mensual for tipo='continuo' programs
 * - programa_familias slug delegates to ProgramTabs (unchanged)
 */
import { useState, useMemo } from "react";
import { useParams, Link } from "wouter";
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
import BackLink from "@/components/layout/BackLink";
import { EnrolledPersonsTable } from "@/features/programs/components/EnrolledPersonsTable";
import { EnrollPersonModal } from "@/features/programs/components/EnrollPersonModal";
import { ProgramForm } from "@/features/programs/components/ProgramForm";
import { ProgramTabs } from "@/features/programs/components/ProgramTabs";
import { ProgramGlyph } from "@/features/programs/components/ProgramGlyph";
import { ProgramInfoBox } from "@/features/programs/components/ProgramInfoBox";
import { ProgramCard } from "@/features/programs/components/ProgramCard";
import { KPICard, MetaCell } from "@/features/programs/components/ProgramDetailStats";
import { FunnelKpis } from "@/features/programs/components/FunnelKpis";
import { ListadoMensual } from "@/features/programs/components/ListadoMensual";
import { getAncestors, getChildren, suggestChildTipo } from "@/features/programs/lib/tree";
import type { ProgramFormValues, Program } from "@/features/programs/schemas";
import type { ProgramWithCounts } from "@/features/programs/schemas";
import type { TipoPrograma, EstadoInscripcion } from "@shared/programEstados";
import { Users, TrendingUp, UserMinus, GitBranch } from "lucide-react";

/* ── Page ────────────────────────────────────────────────────────────────── */

export default function ProgramaDetalle() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "superadmin";
  const [editOpen, setEditOpen] = useState(false);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [createChildOpen, setCreateChildOpen] = useState(false);

  const utils = trpc.useUtils();

  const { data: program, isLoading, error } = trpc.programs.getBySlug.useQuery(
    { slug: slug ?? "" },
    { enabled: !!slug }
  );

  // Flat list for breadcrumb + children (visible to all roles)
  const { data: allPrograms = [] } = trpc.programs.getAll.useQuery(undefined, {
    staleTime: 5 * 60_000,
  });

  // With counts (admin only) for subtree KPIs
  const { data: allWithCounts = [] } = trpc.programs.getAllWithCounts.useQuery(undefined, {
    staleTime: 2 * 60_000,
    enabled: isAdmin,
  });

  // KPI: active and completed counts
  const { data: activeEnrollments, isLoading: loadingActive } =
    trpc.programs.getEnrollments.useQuery(
      { programId: program?.id ?? "", estado: "activo", limit: 1, offset: 0 },
      { enabled: !!program?.id && program?.inscribible !== false }
    );

  const { data: completedEnrollments, isLoading: loadingCompleted } =
    trpc.programs.getEnrollments.useQuery(
      { programId: program?.id ?? "", estado: "completado", limit: 1, offset: 0 },
      { enabled: !!program?.id && program?.inscribible !== false }
    );

  const thisMonthStart = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  }, []);

  const { data: allActiveEnrollments, isLoading: loadingAllActive } =
    trpc.programs.getEnrollments.useQuery(
      { programId: program?.id ?? "", estado: "activo", limit: 100, offset: 0 },
      { enabled: !!program?.id && program?.inscribible !== false }
    );

  const newThisMonth = useMemo(() => {
    if (!allActiveEnrollments?.enrollments) return 0;
    return allActiveEnrollments.enrollments.filter(
      (e) => e.fecha_inicio && e.fecha_inicio >= thisMonthStart
    ).length;
  }, [allActiveEnrollments, thisMonthStart]);

  // Derived tree data
  const ancestors = useMemo(
    () => program ? getAncestors(allPrograms as Program[], program.id) : [],
    [allPrograms, program]
  );

  const children = useMemo(
    () => program ? getChildren(allPrograms as Program[], program.id) : [],
    [allPrograms, program]
  );

  const childrenWithCounts: ProgramWithCounts[] = useMemo(
    () => allWithCounts.filter((p) => p.parent_id === program?.id) as ProgramWithCounts[],
    [allWithCounts, program]
  );

  const parentName = useMemo(
    () => ancestors.length > 0 ? ancestors[ancestors.length - 1].name : undefined,
    [ancestors]
  );

  const updateProgram = trpc.programs.update.useMutation({
    onSuccess: () => {
      utils.programs.getBySlug.invalidate({ slug: slug ?? "" });
      utils.programs.getAllWithCounts.invalidate();
      utils.programs.getAll.invalidate();
      toast.success("Programa actualizado correctamente");
      setEditOpen(false);
    },
    onError: (error) => {
      toast.error("Error al actualizar programa", { description: error.message });
    },
  });

  const createChildProgram = trpc.programs.create.useMutation({
    onSuccess: () => {
      utils.programs.getAll.invalidate();
      utils.programs.getAllWithCounts.invalidate();
      toast.success("Subprograma creado correctamente");
      setCreateChildOpen(false);
    },
    onError: (error) => {
      toast.error("Error al crear subprograma", { description: error.message });
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
        <Skeleton className="h-32 w-full rounded-2xl" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}
        </div>
      </div>
    );
  }

  if (error || !program) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-16 text-center">
        <p className="text-h3 text-foreground">Programa no encontrado</p>
        <p className="text-body text-muted-foreground mt-1">
          El programa <strong>{slug}</strong> no existe o fue eliminado.
        </p>
        <BackLink href="/programas" label="Volver a programas" className="mt-4 mx-auto" />
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    volunteer_can_write: (program as any).volunteer_can_write ?? true,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    volunteer_visible_fields: (program as any).volunteer_visible_fields ?? [],
    requires_consents: (program.requires_consents as string[]) ?? [],
    fecha_inicio: program.fecha_inicio ?? undefined,
    fecha_fin: program.fecha_fin ?? undefined,
    config: (program.config as Record<string, unknown>) ?? {},
    responsable_id: program.responsable_id ?? undefined,
    parent_id: program.parent_id ?? null,
    tipo: (program.tipo as TipoPrograma) ?? "basico",
    inscribible: program.inscribible ?? true,
    estados_habilitados: ((program.estados_habilitados as string[]) ?? ["activo", "pausado", "baja", "terminado"]) as EstadoInscripcion[],
    etiquetas: (program.etiquetas as string[]) ?? [],
  };

  const childDefaultValues: Partial<ProgramFormValues> = {
    parent_id: program.id,
    tipo: suggestChildTipo(program.tipo),
  };

  const inactiveCount = completedEnrollments?.total ?? 0;
  const activeCount = activeEnrollments?.total ?? 0;
  const estadosHabilitados = (program.estados_habilitados as string[]) ?? [];
  const isContinuo = program.tipo === "continuo";
  const isInscribible = program.inscribible !== false;
  const hasChildren = children.length > 0 || (isAdmin && childrenWithCounts.length > 0);
  const showChildrenSection = !isInscribible || hasChildren;

  /* ── Header ──────────────────────────────────────────────────────────── */
  const headerContent = (
    <div className="border-b border-border bg-background/95 backdrop-blur sticky top-0 z-10">
      <div className="max-w-5xl mx-auto px-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <BackLink label="Programas" />
            {/* Breadcrumb ancestors */}
            {ancestors.map((anc) => (
              <span key={anc.id} className="flex items-center gap-1">
                <span className="text-muted-foreground text-sm" aria-hidden="true">/</span>
                <Link href={`/programas/${anc.slug}`} className="text-sm text-muted-foreground hover:underline truncate max-w-[120px]">
                  {anc.name}
                </Link>
              </span>
            ))}
            <span className="text-muted-foreground text-sm" aria-hidden="true">/</span>
            <div className="text-accent-foreground shrink-0">
              <ProgramGlyph slug={program.slug} className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-h2 text-foreground truncate">{program.name}</h1>
                {!program.is_active && <Badge variant="secondary" className="text-xs shrink-0">Inactivo</Badge>}
                {program.is_default && <Badge variant="outline" className="text-xs shrink-0 border-accent-foreground/20 text-accent-foreground">Por defecto</Badge>}
                {program.tipo && <Badge variant="outline" className="text-xs shrink-0 font-mono">{program.tipo}</Badge>}
              </div>
              <p className="text-body-sm text-muted-foreground font-mono">{program.slug}</p>
            </div>
          </div>

          {isAdmin && (
            <div className="flex items-center gap-2 shrink-0">
              <Dialog open={editOpen} onOpenChange={setEditOpen}>
                <DialogTrigger asChild>
                  <button className="bocatas-btn-outline text-sm px-3 py-1.5 min-h-[36px] rounded-xl">
                    Editar
                  </button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader><DialogTitle>Editar programa</DialogTitle></DialogHeader>
                  <ProgramForm
                    defaultValues={defaultValues}
                    isEditing
                    isLoading={updateProgram.isPending}
                    parentName={parentName}
                    onSubmit={(v: ProgramFormValues) => updateProgram.mutate({ id: program.id, data: v })}
                    onCancel={() => setEditOpen(false)}
                  />
                </DialogContent>
              </Dialog>
              {program.is_active && (
                <button
                  className="bocatas-btn-outline text-sm px-3 py-1.5 min-h-[36px] rounded-xl text-destructive hover:text-destructive border-destructive/20"
                  onClick={() => {
                    if (confirm(`¿Desactivar el programa "${program.name}"?`)) {
                      deactivateProgram.mutate({ id: program.id });
                    }
                  }}
                  disabled={deactivateProgram.isPending}
                  aria-label={`Desactivar programa ${program.name}`}
                >
                  Desactivar
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  /* ── programa_familias — keep ProgramTabs unchanged ─────────────────── */
  if (program.slug === "programa_familias") {
    return (
      <div className="min-h-screen bg-background">
        {headerContent}
        <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
          <ProgramInfoBox activeCount={activeCount} newCount={newThisMonth} completedCount={inactiveCount} enrollmentsCount={activeCount + inactiveCount}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {program.fecha_inicio && <MetaCell label="Inicio" value={program.fecha_inicio} />}
              <MetaCell label="Fin" value={program.fecha_fin ?? "Sin fecha de fin"} />
              <MetaCell label="Acceso voluntarios" value={program.volunteer_can_access ? "Sí" : "No"} />
              <MetaCell label="Orden" value={String(program.display_order)} />
            </div>
          </ProgramInfoBox>
          <ProgramTabs program={{ id: program.id, slug: program.slug, nombre: program.name }} />
        </div>
      </div>
    );
  }

  /* ── Standard tree-aware view ────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-background">
      {headerContent}

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {program.description && (
          <p className="text-body text-muted-foreground">{program.description}</p>
        )}

        {isInscribible && (
          <ProgramInfoBox activeCount={activeCount} newCount={newThisMonth} completedCount={inactiveCount} enrollmentsCount={activeCount + inactiveCount}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {program.fecha_inicio && <MetaCell label="Inicio" value={program.fecha_inicio} />}
              <MetaCell label="Fin" value={program.fecha_fin ?? "Sin fecha de fin"} />
              <MetaCell label="Acceso voluntarios" value={program.volunteer_can_access ? "Sí" : "No"} />
              <MetaCell label="Orden" value={String(program.display_order)} />
            </div>
          </ProgramInfoBox>
        )}

        {/* Non-inscribible: actividad info box */}
        {!isInscribible && program.tipo === "actividad" && (
          <div className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
            <strong>Actividad con conteo anónimo</strong> — las sesiones se registran desde Check-in.
            {children.length === 0 && " No hay subprogramas configurados."}
          </div>
        )}

        {/* KPI + funnel for inscribible programs */}
        {isInscribible && (
          <>
            <div>
              <h2 className="text-eyebrow text-muted-foreground mb-3">Estadísticas de inscripción</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <KPICard label="Inscritos activos" value={activeEnrollments?.total} isLoading={loadingActive} icon={<Users className="w-5 h-5" aria-hidden="true" />} accentClass="text-emerald-600" />
                <KPICard label="Nuevos este mes" value={newThisMonth} isLoading={loadingAllActive} icon={<TrendingUp className="w-5 h-5" aria-hidden="true" />} accentClass="text-blue-600" />
                <KPICard label="Completados / Rechazados" value={inactiveCount} isLoading={loadingCompleted} icon={<UserMinus className="w-5 h-5" aria-hidden="true" />} accentClass="text-muted-foreground" />
              </div>
            </div>
            {estadosHabilitados.length > 0 && (
              <FunnelKpis programId={program.id} estadosHabilitados={estadosHabilitados} />
            )}
          </>
        )}

        {/* Children section — for non-inscribible (contenedor/curso/actividad) or any with children */}
        {showChildrenSection && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-h3 text-foreground flex items-center gap-2">
                <GitBranch className="w-5 h-5 text-muted-foreground" aria-hidden="true" />
                Programas dentro
                {(childrenWithCounts.length > 0 || children.length > 0) && (
                  <span className="text-xs text-muted-foreground font-mono">
                    {childrenWithCounts.length || children.length}
                  </span>
                )}
              </h2>
              {isAdmin && (
                <Dialog open={createChildOpen} onOpenChange={setCreateChildOpen}>
                  <DialogTrigger asChild>
                    <button className="bocatas-btn-outline text-xs px-3 py-1.5 min-h-[36px] rounded-xl" aria-label="Crear subprograma">
                      + Nuevo programa dentro de este
                    </button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader><DialogTitle>Nuevo subprograma</DialogTitle></DialogHeader>
                    <ProgramForm
                      defaultValues={childDefaultValues}
                      isLoading={createChildProgram.isPending}
                      parentName={program.name}
                      onSubmit={(v: ProgramFormValues) => createChildProgram.mutate(v)}
                      onCancel={() => setCreateChildOpen(false)}
                    />
                  </DialogContent>
                </Dialog>
              )}
            </div>

            {/* Subtree KPIs for non-inscribible */}
            {!isInscribible && isAdmin && childrenWithCounts.length > 0 && (
              <div className="flex gap-4 p-3 rounded-xl bg-muted/40 text-sm">
                {childrenWithCounts[0].subtree_active_persons != null && (
                  <span><strong>{childrenWithCounts.reduce((s, c) => s + (c.subtree_active_persons ?? 0), 0)}</strong> personas únicas activas en el árbol</span>
                )}
              </div>
            )}

            {/* Children cards grid */}
            {(childrenWithCounts.length > 0 || children.length > 0) ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5">
                {(childrenWithCounts.length > 0 ? childrenWithCounts : children).map((child, i) => (
                  <ProgramCard key={child.id} program={child as ProgramWithCounts} isAdmin={isAdmin} index={i + 1} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-4">
                No hay subprogramas configurados todavía.
                {isAdmin && " Usa el botón de arriba para crear el primero."}
              </p>
            )}
          </div>
        )}

        {/* Enrollment table — only for inscribible programs */}
        {isInscribible && (
          <div className="bocatas-card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="text-h3 text-foreground">Personas inscritas</h2>
              {isAdmin && (
                <Dialog open={enrollOpen} onOpenChange={setEnrollOpen}>
                  <DialogTrigger asChild>
                    <button className="bocatas-btn-primary text-xs px-3 py-1.5 min-h-[36px]" aria-label="Inscribir persona en este programa">
                      + Inscribir persona
                    </button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-lg">
                    <DialogHeader><DialogTitle>Inscribir persona en {program.name}</DialogTitle></DialogHeader>
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
            <div className="px-5 py-4">
              <EnrolledPersonsTable
                programId={program.id}
                isAdmin={isAdmin}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                volunteerVisibleFields={(program as any).volunteer_visible_fields ?? []}
                estadosHabilitados={estadosHabilitados}
              />
            </div>
          </div>
        )}

        {/* Listado mensual for continuo programs */}
        {isContinuo && isAdmin && (
          <div className="bocatas-card overflow-hidden px-5 py-4">
            <ListadoMensual programId={program.id} programName={program.name} />
          </div>
        )}
      </div>
    </div>
  );
}
