import { useState } from "react";
import { FamiliasList } from "./FamiliasList";

interface FamiliasTabProps {
  programaId: string;
}

export default function FamiliasTab({ programaId }: FamiliasTabProps) {
  // programaId is reserved for Phase 2+ (filtering by program).
  // For now the families list is global since families.getAll already
  // returns Programa-de-Familia rows by virtue of how the schema is shaped.
  void programaId;

  // Drawer wiring lands in Task 8. For now the click sets local state but
  // does not render anything — the row stays interactive but inert.
  const [, setOpenId] = useState<string | null>(null);

  return (
    <div className="space-y-3 p-4">
      <FamiliasList onRowClick={setOpenId} />
    </div>
  );
}
