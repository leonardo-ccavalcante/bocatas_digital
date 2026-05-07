import { TiposCatalog } from "./TiposCatalog";

interface UploadsTabProps {
  programaId: string;
}

export default function UploadsTab({ programaId }: UploadsTabProps) {
  return (
    <div className="space-y-3 p-4">
      <TiposCatalog programaId={programaId} />
      {/* UploadModal lands in Task 12, ArchiveExplorer + PendientesGrid in Task 13. */}
    </div>
  );
}
