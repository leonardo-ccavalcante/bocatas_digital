/**
 * reports-tab/index.tsx — Tab composition: TemplatesGrid + 9 modals + CustomQueryBuilder + SavedQueriesList.
 *
 * State: which template modal is open (local useState — no Zustand).
 * Tabs: Plantillas | Constructor | Guardadas
 *
 * Notes:
 *  - DO NOT flip ENABLED_TABS for reports here — that is Leo's micro-PR.
 *  - Each modal is conditionally rendered (open prop gates the query via `enabled`).
 */

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TemplatesGrid, type TemplateKey } from "./TemplatesGrid";
import { CustomQueryBuilder } from "./CustomQueryBuilder";
import { SavedQueriesList } from "./SavedQueriesList";
import { FamiliasAtendidasModal } from "./templates/FamiliasAtendidasModal";
import { PadronPorVencerModal } from "./templates/PadronPorVencerModal";
import { InformesPorRenovarModal } from "./templates/InformesPorRenovarModal";
import { ComplianceSnapshotModal } from "./templates/ComplianceSnapshotModal";
import { FamiliasEnRiesgoModal } from "./templates/FamiliasEnRiesgoModal";
import { DocumentosFaltantesModal } from "./templates/DocumentosFaltantesModal";
import { ResumenTrimestralModal } from "./templates/ResumenTrimestralModal";
import { DistribucionPorDistritoModal } from "./templates/DistribucionPorDistritoModal";
import { EvolucionHistoricaModal } from "./templates/EvolucionHistoricaModal";
import { IrpfDemograficoModal } from "./templates/IrpfDemograficoModal";
import type { SavedQuerySpec } from "@shared/reports/savedQuerySpec";

interface ReportsTabProps {
  currentUserId: string;
  programaId?: string;
}

export default function ReportsTab({ currentUserId, programaId }: ReportsTabProps) {
  const [openTemplate, setOpenTemplate] = useState<TemplateKey | null>(null);
  const [savedSpec, setSavedSpec] = useState<SavedQuerySpec | undefined>();

  function closeModal() {
    setOpenTemplate(null);
  }

  function handleRunSaved(spec: SavedQuerySpec) {
    setSavedSpec(spec);
    // Switch to the constructor tab to show the loaded spec
  }

  return (
    <div className="space-y-4 p-4">
      <h2 className="font-display text-xl font-semibold">Informes</h2>

      <Tabs defaultValue="plantillas">
        <TabsList aria-label="Secciones de informes">
          <TabsTrigger value="plantillas">Plantillas</TabsTrigger>
          <TabsTrigger value="constructor">Constructor</TabsTrigger>
          <TabsTrigger value="guardadas">Guardadas</TabsTrigger>
        </TabsList>

        <TabsContent value="plantillas" className="pt-4">
          <TemplatesGrid onOpen={setOpenTemplate} />
        </TabsContent>

        <TabsContent value="constructor" className="pt-4">
          <CustomQueryBuilder initialSpec={savedSpec} />
        </TabsContent>

        <TabsContent value="guardadas" className="pt-4">
          <SavedQueriesList
            currentUserId={currentUserId}
            programaId={programaId}
            onRun={handleRunSaved}
          />
        </TabsContent>
      </Tabs>

      {/* 9 modals — mounted lazily via open prop */}
      <FamiliasAtendidasModal
        open={openTemplate === "familiasAtendidas"}
        onClose={closeModal}
      />
      <PadronPorVencerModal
        open={openTemplate === "padronPorVencer"}
        onClose={closeModal}
      />
      <InformesPorRenovarModal
        open={openTemplate === "informesPorRenovar"}
        onClose={closeModal}
      />
      <ComplianceSnapshotModal
        open={openTemplate === "complianceSnapshot"}
        onClose={closeModal}
      />
      <FamiliasEnRiesgoModal
        open={openTemplate === "familiasEnRiesgo"}
        onClose={closeModal}
      />
      <DocumentosFaltantesModal
        open={openTemplate === "documentosFaltantes"}
        onClose={closeModal}
        programaId={programaId}
      />
      <ResumenTrimestralModal
        open={openTemplate === "resumenTrimestral"}
        onClose={closeModal}
      />
      <DistribucionPorDistritoModal
        open={openTemplate === "distribucionPorDistrito"}
        onClose={closeModal}
      />
      <EvolucionHistoricaModal
        open={openTemplate === "evolucionHistorica"}
        onClose={closeModal}
      />
      <IrpfDemograficoModal
        open={openTemplate === "irpfDemografico"}
        onClose={closeModal}
      />
    </div>
  );
}
