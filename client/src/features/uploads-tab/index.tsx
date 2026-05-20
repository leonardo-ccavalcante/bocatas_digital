import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
    <div className="space-y-5 p-4">
      {/* Toolbar — single primary action, ported from v4 UploadsView */}
      <div className="bocatas-card flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div>
          <h2 className="text-h3 text-foreground">Documentación</h2>
          <p className="text-body-sm text-muted-foreground">
            Sube, clasifica y consulta los documentos del programa.
          </p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
          Subir documento
        </Button>
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
    </div>
  );
}
