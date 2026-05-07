import { useState } from "react";
import { FamiliasList } from "./FamiliasList";
import { FamiliaDrawer } from "./FamiliaDrawer";
import { SavedViewsBar } from "./SavedViewsBar";

interface FamiliasTabProps {
  programaId: string;
}

export default function FamiliasTab({ programaId }: FamiliasTabProps) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="space-y-3 p-4">
      <SavedViewsBar programaId={programaId} />
      <FamiliasList onRowClick={setOpenId} />
      <FamiliaDrawer familyId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}
