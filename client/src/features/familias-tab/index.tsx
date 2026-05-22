import { useState } from "react";
import { useLocation } from "wouter";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { FamiliasList } from "./FamiliasList";
import { FamiliaDrawer } from "./FamiliaDrawer";
import { SavedViewsBar } from "./SavedViewsBar";
import { RepartoTab } from "@/features/familias-reparto/components/RepartoTab";

interface FamiliasTabProps {
  programaId: string;
}

export default function FamiliasTab({ programaId }: FamiliasTabProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [, navigate] = useLocation();

  return (
    <div className="space-y-3 p-4">
      <Tabs defaultValue="familias">
        <TabsList>
          <TabsTrigger value="familias">Familias</TabsTrigger>
          <TabsTrigger value="repartos">Repartos</TabsTrigger>
        </TabsList>
        <TabsContent value="familias" className="space-y-3">
          <SavedViewsBar programaId={programaId} />
          <FamiliasList
            onRowClick={setOpenId}
            onDeepDive={(id) => navigate(`/familias/${id}`)}
          />
          <FamiliaDrawer familyId={openId} onClose={() => setOpenId(null)} />
        </TabsContent>
        <TabsContent value="repartos">
          <RepartoTab programId={programaId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
