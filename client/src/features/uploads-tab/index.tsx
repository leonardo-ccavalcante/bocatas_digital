import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import { TiposCatalog } from "./TiposCatalog";
import { UploadModal } from "./UploadModal";

interface UploadsTabProps {
  programaId: string;
}

export default function UploadsTab({ programaId }: UploadsTabProps) {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="space-y-3 p-4">
      <div className="flex justify-end">
        <Button onClick={() => setModalOpen(true)}>
          <Upload className="w-4 h-4 mr-2" aria-hidden="true" />
          Subir documento
        </Button>
      </div>
      <TiposCatalog programaId={programaId} />
      <UploadModal
        programaId={programaId}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
}
