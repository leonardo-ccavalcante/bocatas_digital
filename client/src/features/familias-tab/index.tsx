interface FamiliasTabProps {
  programaId: string;
}

// Phase 1 Task 7+ fills this in. Keeping a minimal default export now so
// ProgramTabs (Task 5) and ProgramaDetalle (Task 6) can lazy-import it
// without hitting "module not found".
export default function FamiliasTab({ programaId }: FamiliasTabProps) {
  void programaId;
  return (
    <div className="p-8 text-center text-muted-foreground">
      Familias — próximamente
    </div>
  );
}
