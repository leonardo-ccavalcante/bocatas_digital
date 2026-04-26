import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AlertCircle, CheckCircle, Upload, Loader2, Download } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { DeliveryEditableTable } from './DeliveryEditableTable';
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
  const [step, setStep] = useState<'upload' | 'preview' | 'confirm'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [ocrText, setOcrText] = useState('');
  const [extractedData, setExtractedData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const extractMutation = trpc.entregas.extractFromOCR.useMutation();
  const saveMutation = trpc.entregas.saveBatch.useMutation();
  const { data: templateData } = trpc.entregas.downloadTemplate.useQuery();

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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setError(null);

    // TODO: In production, call Manus OCR API to extract text from image
    // For now, prompt user to paste OCR text
    setStep('preview');
  };

  const handleExtract = async () => {
    if (!ocrText.trim()) {
      setError('Por favor ingresa el texto OCR');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await extractMutation.mutateAsync({
        imageUrl: 'https://placeholder.com/image.jpg', // TODO: Upload to storage
        ocrText,
      });

      if (result.success && result.data) {
        setExtractedData(result.data);
        setStep('confirm');
      } else {
        setError(result.message || 'Error en extracción');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!extractedData) return;

    setLoading(true);
    setError(null);

    try {
      const result = await saveMutation.mutateAsync({
        header: extractedData.header,
        rows: extractedData.rows,
        documentImageUrl: 'https://placeholder.com/image.jpg', // TODO: Upload to storage
      });

      if (result.success) {
        onSuccess?.(result.batchId);
        // Reset form
        setStep('upload');
        setFile(null);
        setOcrText('');
        setExtractedData(null);
      } else {
        setError(result.message || 'Error al guardar');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto p-4">
      {/* Step 1: Upload */}
      {step === 'upload' && (
        <Card className="p-6">
          <h2 className="text-2xl font-bold mb-4">Cargar Documento de Entrega</h2>
          
          {/* Template Download Section */}
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h3 className="font-semibold text-blue-900 mb-2">¿Necesitas ayuda con el formato?</h3>
            <p className="text-sm text-blue-800 mb-3">
              Descarga la plantilla CSV con ejemplos y una guía completa para entender qué información necesitas incluir.
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
              onChange={handleFileUpload}
              className="hidden"
              id="file-upload"
            />
            <label htmlFor="file-upload">
              <Button asChild variant="outline">
                <span>Seleccionar Archivo</span>
              </Button>
            </label>
            {file && <p className="mt-4 text-sm text-green-600">✓ {file.name}</p>}
          </div>
        </Card>
      )}

      {/* Step 2: OCR Text Input */}
      {step === 'preview' && (
        <Card className="p-6">
          <h2 className="text-2xl font-bold mb-4">Ingresa Texto OCR</h2>
          
          {/* Template Download Section */}
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h3 className="font-semibold text-blue-900 mb-2">¿Necesitas ayuda con el formato?</h3>
            <p className="text-sm text-blue-800 mb-3">
              Descarga la plantilla CSV con ejemplos y una guía completa para entender qué información necesitas incluir.
            </p>
            <button
              onClick={handleDownloadTemplate}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              <Download className="w-4 h-4" />
              Descargar Plantilla CSV + Guía
            </button>
          </div>
          
          <p className="text-sm text-gray-600 mb-4">
            Pega el texto extraído del documento por OCR:
          </p>
          <textarea
            value={ocrText}
            onChange={(e) => setOcrText(e.target.value)}
            placeholder="Número de Albarán: ALB-2026-04-20-001..."
            className="w-full h-40 p-3 border border-gray-300 rounded-lg font-mono text-sm"
          />

          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <div className="mt-6 flex gap-3">
            <Button variant="outline" onClick={() => setStep('upload')}>
              Atrás
            </Button>
            <Button onClick={handleExtract} disabled={loading || !ocrText.trim()}>
              {loading ? (
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
      {step === 'confirm' && extractedData && (
        <Card className="p-6">
          <h2 className="text-2xl font-bold mb-4">Confirmar Extracción</h2>

          {/* Header Info */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <h3 className="font-semibold mb-3">Información del Lote</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-600">Albarán</p>
                <p className="font-mono">{extractedData.header.numero_albaran}</p>
              </div>
              <div>
                <p className="text-gray-600">Reparto</p>
                <p className="font-mono">{extractedData.header.numero_reparto}</p>
              </div>
              <div>
                <p className="text-gray-600">Fecha</p>
                <p>{extractedData.header.fecha_reparto}</p>
              </div>
              <div>
                <p className="text-gray-600">Personas</p>
                <p>{extractedData.header.total_personas_asistidas}</p>
              </div>
            </div>
            {extractedData.header.warnings.length > 0 && (
              <div className="mt-3 pt-3 border-t border-blue-200">
                <p className="text-xs text-blue-700">
                  ⚠️ {extractedData.header.warnings.join(', ')}
                </p>
              </div>
            )}
          </div>

          {/* Rows Preview & Edit */}
          <div className="mb-6">
            <h3 className="font-semibold mb-3">
              Entregas Detectadas ({extractedData.rows.length})
            </h3>
            <DeliveryEditableTable
              rows={extractedData.rows}
              onRowsChange={(updatedRows) => {
                setExtractedData((prev: any) => ({
                  ...prev,
                  rows: updatedRows,
                }));
              }}
            />
          </div>

          {error && (
            <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-lg flex gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep('preview')}>
              Atrás
            </Button>
            <Button onClick={handleSave} disabled={loading}>
              {loading ? (
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
    </div>
  );
};
