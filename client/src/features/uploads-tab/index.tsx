import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Upload, Download, FileUp, History } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { TiposCatalog } from "./TiposCatalog";
import { UploadModal } from "./UploadModal";
import { PendientesGrid } from "./PendientesGrid";
import { ArchiveExplorer } from "./ArchiveExplorer";
import { ClassifyModal } from "./ClassifyModal";
import { ExportFamiliesModal } from "@/components/ExportFamiliesModal";
import { ImportFamiliesModal } from "@/components/ImportFamiliesModal";
import { BulkImportFamiliasLegacyModal } from "@/components/BulkImportFamiliasLegacyModal";

interface UploadsTabProps {
  programaId: string;
}

export default function UploadsTab({ programaId }: UploadsTabProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [legacyImportOpen, setLegacyImportOpen] = useState(false);
  const [classify, setClassify] = useState<{
    docId: string | null;
    currentTipo: string | null;
  }>({ docId: null, currentTipo: null });

  return (
    <div className="space-y-4 p-4">
      {/* Toolbar: data tools (left) + primary action (right) */}
      <div className="flex flex-wrap gap-2 justify-between items-center">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setExportOpen(true)}>
            <Download className="w-4 h-4 mr-2" aria-hidden="true" />
            Exportar CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
            <FileUp className="w-4 h-4 mr-2" aria-hidden="true" />
            Importar CSV interno
          </Button>
          <Button variant="outline" size="sm" onClick={() => setLegacyImportOpen(true)}>
            <History className="w-4 h-4 mr-2" aria-hidden="true" />
            Importar CSV legacy
          </Button>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Upload className="w-4 h-4 mr-2" aria-hidden="true" />
          Subir documento
        </Button>
      </div>
      <Separator />

      <PendientesGrid programaId={programaId} />
      <TiposCatalog programaId={programaId} />
      <ArchiveExplorer
        programaId={programaId}
        onReclassify={(docId, currentTipo) => setClassify({ docId, currentTipo })}
      />

      <UploadModal
        programaId={programaId}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      />
      <ClassifyModal
        programaId={programaId}
        docId={classify.docId}
        currentTipo={classify.currentTipo}
        open={classify.docId !== null}
        onClose={() => setClassify({ docId: null, currentTipo: null })}
      />
      <ExportFamiliesModal open={exportOpen} onOpenChange={setExportOpen} />
      <ImportFamiliesModal open={importOpen} onOpenChange={setImportOpen} />
      <BulkImportFamiliasLegacyModal open={legacyImportOpen} onOpenChange={setLegacyImportOpen} />
    </div>
  );
}
