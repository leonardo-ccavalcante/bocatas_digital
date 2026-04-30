import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertCircle, CheckCircle, Upload, Loader2, Download } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { DeliveryEditableTable } from './DeliveryEditableTable';
import { DeliveryValidationTable } from './DeliveryValidationTable';
import { PhotoUploadInput } from './PhotoUploadInput';
import { useBatchAccumulator } from '@/hooks/useBatchAccumulator';
import { downloadFile } from '@/utils/downloadFile';
import { toast } from 'sonner';

interface DeliveryDocumentUploadProps {
  onSuccess?: (batchId: string) => void;
  onError?: (message: string) => void;
}

export const DeliveryDocumentUpload: React.FC<DeliveryDocumentUploadProps> = ({
  onSuccess,
  onError,
}) => {
  // CSV Tab State
  const [csvStep, setCsvStep] = useState<'upload' | 'preview' | 'confirm'>('upload');
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvOcrText, setCsvOcrText] = useState('');
  const [csvExtractedData, setCsvExtractedData] = useState<any>(null);
  const [csvLoading, setCsvLoading] = useState(false);
  const [csvError, setCsvError] = useState<string | null>(null);

  // OCR Tab State
  const [ocrStep, setOcrStep] = useState<'upload' | 'validation' | 'confirm'>('upload');
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'csv' | 'ocr'>('csv');

  // Batch Accumulator
  const batch = useBatchAccumulator();

  // tRPC Mutations
  const csvExtractMutation = trpc.entregas.extractFromOCR.useMutation();
  const saveMutation = trpc.entregas.saveBatch.useMutation();
  const { data: templateData } = trpc.entregas.downloadTemplate.useQuery();
  const ocrExtractMutation = trpc.entregas.extractFromPhoto.useMutation();

  // Handle Tab Switch - Clear State
  const handleTabChange = (tab: 'csv' | 'ocr') => {
    setActiveTab(tab);

    // Clear previous tab state
    if (tab === 'csv') {
      setCsvStep('upload');
      setCsvFile(null);
      setCsvOcrText('');
      setCsvExtractedData(null);
      setCsvError(null);
    } else {
      setOcrStep('upload');
      setOcrError(null);
    }
  };

  // CSV Tab Handlers
  const handleDownloadTemplate = () => {
    if (!templateData) {
      toast.error('Plantilla no disponible');
      return;
    }

    try {
      const { csvContent, guideContent, fileName } = templateData;
      downloadFile(csvContent, fileName, 'text/csv');
      const guideFileName = fileName.replace('.csv', '_GUIA.md');
      downloadFile(guideContent, guideFileName, 'text/markdown');
      toast.success('Plantilla descargada exitosamente');
    } catch (error) {
      console.error('Error downloading template:', error);
      toast.error('Error al descargar la plantilla');
    }
  };

  const handleCsvFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setCsvFile(selectedFile);
    setCsvError(null);
    setCsvStep('preview');
  };

  const handleCsvExtract = async () => {
    if (!csvOcrText.trim()) {
      setCsvError('Por favor ingresa el texto OCR');
      return;
    }

    setCsvLoading(true);
    setCsvError(null);

    try {
      const result = await csvExtractMutation.mutateAsync({
        imageUrl: 'https://placeholder.com/image.jpg',
        ocrText: csvOcrText,
      });

      if (result.success && result.data) {
        setCsvExtractedData(result.data);
        setCsvStep('confirm');
      } else {
        setCsvError(result.message || 'Error en extracción');
      }
    } catch (err) {
      setCsvError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setCsvLoading(false);
    }
  };

  const handleCsvSave = async () => {
    if (!csvExtractedData) return;

    setCsvLoading(true);
    setCsvError(null);

    try {
      const result = await saveMutation.mutateAsync({
        header: csvExtractedData.header,
        rows: csvExtractedData.rows,
        documentImageUrl: 'https://placeholder.com/image.jpg',
      });

      if (result.success) {
        onSuccess?.(result.batchId);
        setCsvStep('upload');
        setCsvFile(null);
        setCsvOcrText('');
        setCsvExtractedData(null);
        toast.success('Lote guardado exitosamente');
      } else {
        setCsvError(result.message || 'Error al guardar');
      }
    } catch (err) {
      setCsvError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setCsvLoading(false);
    }
  };

  // OCR Tab Handlers
  const handlePhotoSelected = async (photoData: { base64: string; file: File; rotation: number }) => {
    setOcrLoading(true);
    setOcrError(null);

    try {
      // TODO: Upload photo to storage and get URL
      const photoUrl = 'https://placeholder.com/photo.jpg';

      const result = await ocrExtractMutation.mutateAsync({
        photoUrl,
        programaId: '',
      });

      if (result.success && result.beneficiaries && result.beneficiaries.length > 0) {
        // Expand each beneficiary's deliveries array into individual ExtractedBeneficiary records
        const records = result.beneficiaries.flatMap((beneficiary) =>
          beneficiary.deliveries.map((delivery) => ({
            id: crypto.randomUUID(),
            nombre_beneficiario: beneficiary.beneficiaryName,
            cantidad_entregada: delivery.quantity,
            fecha_entrega: delivery.date,
            confidence: Math.min(beneficiary.nameConfidence, delivery.quantityConfidence),
            flagged: beneficiary.nameConfidence < 0.7 || delivery.quantityConfidence < 0.7,
            flagReason:
              beneficiary.nameConfidence < 0.7
                ? 'Nombre con baja confianza'
                : delivery.quantityConfidence < 0.7
                  ? 'Cantidad con baja confianza'
                  : undefined,
          }))
        );
        batch.addRecords(records);

        // Log any errors
        if (result.errors && result.errors.length > 0) {
          result.errors.forEach((error: string) => {
            batch.addError({
              photoId: photoUrl,
              message: error,
              severity: 'warning',
            });
          });
        }

        setOcrStep('validation');
        toast.success(`${result.beneficiaries.length} beneficiarios extraídos`);
      } else {
        const errorMsg = result.message || 'Error en extracción OCR';
        setOcrError(errorMsg);
        batch.addError({
          photoId: photoUrl,
          message: errorMsg,
          severity: 'error',
        });
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error desconocido';
      setOcrError(errorMsg);
      batch.addError({
        photoId: 'unknown',
        message: errorMsg,
        severity: 'error',
      });
    } finally {
      setOcrLoading(false);
    }
  };

  const handleOcrSave = async () => {
    if (batch.records.length === 0) {
      setOcrError('No hay beneficiarios para guardar');
      return;
    }

    setOcrLoading(true);
    setOcrError(null);

    try {
      const result = await saveMutation.mutateAsync({
        header: {
          numero_albaran: 'OCR-' + Date.now(),
          numero_reparto: '1',
          numero_factura_carne: null,
          fecha_reparto: new Date().toISOString().split('T')[0],
          total_personas_asistidas: batch.records.length,
          confidence: 0.85,
          warnings: [],
        },
        rows: batch.records.map((r) => ({
          familia_id: r.nombre_beneficiario, // placeholder: user must resolve in validation step
          fecha: r.fecha_entrega,
          persona_recibio: r.nombre_beneficiario,
          frutas_hortalizas_cantidad: r.cantidad_entregada,
          frutas_hortalizas_unidad: 'kg',
          carne_cantidad: 0,
          carne_unidad: 'kg',
          notas: r.flagReason ?? '',
          confidence: r.confidence * 100,
          warnings: r.flagged && r.flagReason ? [r.flagReason] : [],
        })),
        documentImageUrl: 'https://placeholder.com/photo.jpg',
      });

      if (result.success) {
        onSuccess?.(result.batchId);
        batch.clear();
        setOcrStep('upload');
        toast.success('Lote guardado exitosamente');
      } else {
        setOcrError(result.message || 'Error al guardar');
      }
    } catch (err) {
      setOcrError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setOcrLoading(false);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-4">
      <Tabs value={activeTab} onValueChange={(v) => handleTabChange(v as 'csv' | 'ocr')}>
        <TabsList className="grid w-full grid-cols-2 mb-6">
          <TabsTrigger value="csv">📄 Cargar CSV</TabsTrigger>
          <TabsTrigger value="ocr">
            📸 Escanear Documento
            {batch.totalCount > 0 && (
              <span className="ml-2 inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-red-600 rounded-full">
                {batch.totalCount}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* CSV Tab */}
        <TabsContent value="csv" className="space-y-4">
          {/* Step 1: Upload */}
          {csvStep === 'upload' && (
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
          {csvStep === 'preview' && (
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
                <Button variant="outline" onClick={() => setCsvStep('upload')}>
                  Atrás
                </Button>
                <Button onClick={handleCsvExtract} disabled={csvLoading || !csvOcrText.trim()}>
                  {csvLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Extrayendo...
                    </>
                  ) : (
                    'Extraer Datos'
                  )}
                </Button>
              </div>
            </Card>
          )}

          {/* Step 3: Confirm & Save */}
          {csvStep === 'confirm' && csvExtractedData && (
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
                <Button variant="outline" onClick={() => setCsvStep('preview')}>
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

        {/* OCR Tab */}
        <TabsContent value="ocr" className="space-y-4">
          {/* Step 1: Photo Upload */}
          {ocrStep === 'upload' && (
            <Card className="p-6">
              <h2 className="text-2xl font-bold mb-4">Captura de Documento</h2>
              <p className="text-sm text-gray-600 mb-4">
                Toma una foto del documento de entrega o selecciona una imagen del dispositivo.
              </p>

              <PhotoUploadInput
                onPhotoSelected={handlePhotoSelected}
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
          {ocrStep === 'validation' && batch.records.length > 0 && (
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
                <Button variant="outline" onClick={() => setOcrStep('upload')}>
                  Agregar Más Documentos
                </Button>
                <Button onClick={handleOcrSave} disabled={ocrLoading || batch.records.length === 0}>
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
      </Tabs>
    </div>
  );
};
