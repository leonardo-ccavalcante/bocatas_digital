import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, Download, FileUp, History } from "lucide-react";
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
    <div className="space-y-5 p-4">
      {/* Toolbar — v4 card header + data tools + primary action */}
      <div className="bocatas-card flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div>
          <h2 className="text-h3 text-foreground">Documentación</h2>
          <p className="text-body-sm text-muted-foreground">
            Sube, clasifica y consulta los documentos del programa.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
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
          <Button onClick={() => setModalOpen(true)}>
            <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
            Subir documento
          </Button>
        </div>
      </div>

      {/* Catálogo de tipos */}
      <TiposCatalog programaId={programaId} />

      {/* Cola y trazabilidad */}
      <Tabs defaultValue="pendientes">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="pendientes">Pendientes</TabsTrigger>
          <TabsTrigger value="archivo">Archivo</TabsTrigger>
        </TabsList>

        <TabsContent value="pendientes" className="mt-4">
          <PendientesGrid programaId={programaId} />
        </TabsContent>

        <TabsContent value="archivo" className="mt-4">
          <ArchiveExplorer
            programaId={programaId}
            onReclassify={(docId, currentTipo) =>
              setClassify({ docId, currentTipo })
            }
          />
        </TabsContent>
      </Tabs>

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
