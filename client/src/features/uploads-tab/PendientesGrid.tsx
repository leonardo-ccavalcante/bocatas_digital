interface PendientesGridProps {
  programaId: string;
}

/**
 * Phase 1: documento_tipo is NOT NULL in the schema, so "pending" rows
 * (where tipo_id IS NULL) cannot exist yet. Renders an empty state by design.
 * Task 14 adds the nullable tipo_id column; data will flow naturally then.
 */
// TODO(frontend-v4): wire real pendientes queue (Task 14 adds nullable tipo_id column)
export function PendientesGrid({ programaId: _ }: PendientesGridProps) {
  return (
    <div className="bocatas-card p-4">
      <div className="text-eyebrow mb-2 text-muted-foreground">
        Pendientes de clasificar
      </div>
      <p className="py-6 text-center text-body-sm text-muted-foreground">
        No hay documentos pendientes de clasificar.
      </p>
    </div>
  );
}
