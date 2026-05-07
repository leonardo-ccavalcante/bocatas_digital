import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import { TiposCatalog } from "./TiposCatalog";
import { UploadModal } from "./UploadModal";
import { PendientesGrid } from "./PendientesGrid";
import { ArchiveExplorer } from "./ArchiveExplorer";
import { ClassifyModal } from "./ClassifyModal";

interface UploadsTabProps {
  programaId: string;
}

export default function UploadsTab({ programaId }: UploadsTabProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [classify, setClassify] = useState<{
    docId: string | null;
    currentTipo: string | null;
  }>({ docId: null, currentTipo: null });

  return (
    <div className="space-y-3 p-4">
      <div className="flex justify-end">
        <Button onClick={() => setModalOpen(true)}>
          <Upload className="w-4 h-4 mr-2" aria-hidden="true" />
          Subir documento
        </Button>
      </div>

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
    </div>
  );
}
