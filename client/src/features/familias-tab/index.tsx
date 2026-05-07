import { useState } from "react";
import { FamiliasList } from "./FamiliasList";
import { FamiliaDrawer } from "./FamiliaDrawer";

interface FamiliasTabProps {
  programaId: string;
}

export default function FamiliasTab({ programaId }: FamiliasTabProps) {
  // programaId reserved for Phase 2+ (filtering by program).
  void programaId;

  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="space-y-3 p-4">
      <FamiliasList onRowClick={setOpenId} />
      <FamiliaDrawer familyId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}
