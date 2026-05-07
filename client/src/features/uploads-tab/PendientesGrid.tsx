import { Card, CardContent } from "@/components/ui/card";

interface PendientesGridProps {
  programaId: string;
}

/**
 * Phase 1: documento_tipo is NOT NULL in the schema, so "pending" rows
 * (where tipo_id IS NULL) cannot exist yet. Renders an empty state by design.
 * Task 14 adds the nullable tipo_id column; data will flow naturally then.
 */
export function PendientesGrid({ programaId: _ }: PendientesGridProps) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-sm font-medium text-muted-foreground mb-2">
          Pendientes de clasificar
        </div>
        <p className="text-sm text-muted-foreground text-center py-4">
          No hay documentos pendientes de clasificar.
        </p>
      </CardContent>
    </Card>
  );
}
