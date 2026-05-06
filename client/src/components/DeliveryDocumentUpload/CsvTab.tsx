import React from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TabsContent } from "@/components/ui/tabs";
import { AlertCircle, CheckCircle, Upload, Loader2, Download } from "lucide-react";
import { DeliveryEditableTable } from "../DeliveryEditableTable";
import type { useCsvFlow } from "./_useCsvFlow";

interface CsvTabProps {
  flow: ReturnType<typeof useCsvFlow>;
}

export function CsvTab({ flow }: CsvTabProps) {
  const {
    csvStep,
    setCsvStep,
    csvFile,
    csvOcrText,
    setCsvOcrText,
    csvExtractedData,
    setCsvExtractedData,
    csvLoading,
    csvError,
    handleDownloadTemplate,
    handleCsvFileUpload,
    handleCsvExtract,
    handleCsvSave,
  } = flow;

  return (
    <TabsContent value="csv" className="space-y-4">
      {/* Step 1: Upload */}
      {csvStep === "upload" && (
        <Card className="p-6">
          <h2 className="text-2xl font-bold mb-4">Cargar Documento de Entrega</h2>

          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h3 className="font-semibold text-blue-900 mb-2">¿Necesitas ayuda con el formato?</h3>
            <p className="text-sm text-blue-800 mb-3">
              Descarga la plantilla CSV con ejemplos y una guía completa.
            </p>
            <button
              onClick={handleDownloadTemplate}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              <Download className="w-4 h-4" />
              Descargar Plantilla CSV + Guía
            </button>
          </div>

          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
            <Upload className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            <p className="text-gray-600 mb-4">Arrastra tu documento aquí o haz clic para seleccionar</p>
            <input
              type="file"
              accept="image/*,.pdf"
              onChange={handleCsvFileUpload}
              className="hidden"
              id="csv-file-upload"
            />
            <label htmlFor="csv-file-upload">
              <Button asChild variant="outline">
                <span>Seleccionar Archivo</span>
              </Button>
            </label>
            {csvFile && <p className="mt-4 text-sm text-green-600">✓ {csvFile.name}</p>}
          </div>
        </Card>
      )}

      {/* Step 2: OCR Text Input */}
      {csvStep === "preview" && (
        <Card className="p-6">
          <h2 className="text-2xl font-bold mb-4">Ingresa Texto OCR</h2>

          <p className="text-sm text-gray-600 mb-4">Pega el texto extraído del documento por OCR:</p>
          <textarea
            value={csvOcrText}
            onChange={(e) => setCsvOcrText(e.target.value)}
            placeholder="Número de Albarán: ALB-2026-04-20-001..."
            className="w-full h-40 p-3 border border-gray-300 rounded-lg font-mono text-sm"
          />

          {csvError && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <p className="text-sm text-red-700">{csvError}</p>
            </div>
          )}

          <div className="mt-6 flex gap-3">
            <Button variant="outline" onClick={() => setCsvStep("upload")}>
              Atrás
            </Button>
            <Button onClick={handleCsvExtract} disabled={csvLoading || !csvOcrText.trim()}>
              {csvLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Extrayendo...
                </>
              ) : (
                "Extraer Datos"
              )}
            </Button>
          </div>
        </Card>
      )}

      {/* Step 3: Confirm & Save */}
      {csvStep === "confirm" && csvExtractedData && (
        <Card className="p-6">
          <h2 className="text-2xl font-bold mb-4">Confirmar Extracción</h2>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <h3 className="font-semibold mb-3">Información del Lote</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-600">Albarán</p>
                <p className="font-mono">{csvExtractedData.header.numero_albaran}</p>
              </div>
              <div>
                <p className="text-gray-600">Reparto</p>
                <p className="font-mono">{csvExtractedData.header.numero_reparto}</p>
              </div>
              <div>
                <p className="text-gray-600">Fecha</p>
                <p>{csvExtractedData.header.fecha_reparto}</p>
              </div>
              <div>
                <p className="text-gray-600">Personas</p>
                <p>{csvExtractedData.header.total_personas_asistidas}</p>
              </div>
            </div>
          </div>

          <div className="mb-6">
            <h3 className="font-semibold mb-3">
              Entregas Detectadas ({csvExtractedData.rows.length})
            </h3>
            <DeliveryEditableTable
              rows={csvExtractedData.rows}
              onRowsChange={(updatedRows) => {
                setCsvExtractedData((prev: any) => ({
                  ...prev,
                  rows: updatedRows,
                }));
              }}
            />
          </div>

          {csvError && (
            <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-lg flex gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <p className="text-sm text-red-700">{csvError}</p>
            </div>
          )}

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setCsvStep("preview")}>
              Atrás
            </Button>
            <Button onClick={handleCsvSave} disabled={csvLoading}>
              {csvLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Guardar Lote
                </>
              )}
            </Button>
          </div>
        </Card>
      )}
    </TabsContent>
  );
}
