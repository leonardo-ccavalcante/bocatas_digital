import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TabsContent } from "@/components/ui/tabs";
import { AlertCircle, CheckCircle, Loader2 } from "lucide-react";
import { DeliveryValidationTable } from "../DeliveryValidationTable";
import { PhotoUploadInput } from "../PhotoUploadInput";
import type { useOcrFlow } from "./_useOcrFlow";

interface OcrTabProps {
  flow: ReturnType<typeof useOcrFlow>;
}

export function OcrTab({ flow }: OcrTabProps) {
  const {
    ocrStep,
    setOcrStep,
    ocrLoading,
    ocrError,
    batch,
    handlePhotoUpload,
    handleOcrSave,
  } = flow;

  return (
    <TabsContent value="ocr" className="space-y-4">
      {/* Step 1: Photo Upload */}
      {ocrStep === "upload" && (
        <Card className="p-6">
          <h2 className="text-2xl font-bold mb-4">Captura de Documento</h2>
          <p className="text-sm text-gray-600 mb-4">
            Toma una foto del documento de entrega o selecciona una imagen del dispositivo.
          </p>

          <PhotoUploadInput
            onPhotoSelected={(photoData) => handlePhotoUpload(photoData.file, photoData.rotation)}
          />

          {ocrError && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <p className="text-sm text-red-700">{ocrError}</p>
            </div>
          )}

          {batch.errors.length > 0 && (
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm font-semibold text-yellow-800 mb-2">Errores en procesamiento:</p>
              <ul className="text-xs text-yellow-700 space-y-1">
                {batch.errors.map((error, idx) => (
                  <li key={idx}>• {error.message}</li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      {/* Step 2: Validation */}
      {ocrStep === "validation" && batch.records.length > 0 && (
        <Card className="p-6">
          <h2 className="text-2xl font-bold mb-4">Revisar Beneficiarios Extraídos</h2>

          <DeliveryValidationTable
            records={batch.records}
            onUpdate={(id, updates) => batch.updateRecord(id, updates)}
            onRemove={(id) => batch.removeRecord(id)}
          />

          {ocrError && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <p className="text-sm text-red-700">{ocrError}</p>
            </div>
          )}

          <div className="mt-6 flex gap-3">
            <Button variant="outline" onClick={() => setOcrStep("upload")}>
              Agregar Más Documentos
            </Button>
            <Button onClick={handleOcrSave} disabled={ocrLoading || batch.records.length === 0 || batch.records.some(r => !r.familia_id || !r.persona_recibio)} title={batch.records.some(r => !r.familia_id || !r.persona_recibio) ? "Completa los campos requeridos en todos los registros" : ""}>
              {ocrLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Guardar {batch.totalCount} Beneficiarios
                </>
              )}
            </Button>
          </div>
        </Card>
      )}
    </TabsContent>
  );
}
