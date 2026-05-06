import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { downloadFile } from "@/utils/downloadFile";
import { toast } from "sonner";

export type CsvStep = "upload" | "preview" | "confirm";

interface UseCsvFlowArgs {
  onSuccess?: (batchId: string) => void;
}

export function useCsvFlow({ onSuccess }: UseCsvFlowArgs) {
  const [csvStep, setCsvStep] = useState<CsvStep>("upload");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvOcrText, setCsvOcrText] = useState("");
  // CSV parser boundary — untyped row
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [csvExtractedData, setCsvExtractedData] = useState<any>(null);
  const [csvLoading, setCsvLoading] = useState(false);
  const [csvError, setCsvError] = useState<string | null>(null);

  const csvExtractMutation = trpc.entregas.extractFromOCR.useMutation();
  const saveMutation = trpc.entregas.saveBatch.useMutation();
  const { data: templateData } = trpc.entregas.downloadTemplate.useQuery();

  const resetCsv = () => {
    setCsvStep("upload");
    setCsvFile(null);
    setCsvOcrText("");
    setCsvExtractedData(null);
    setCsvError(null);
  };

  const handleDownloadTemplate = () => {
    if (!templateData) {
      toast.error("Plantilla no disponible");
      return;
    }

    try {
      const { csvContent, guideContent, fileName } = templateData;
      downloadFile(csvContent, fileName, "text/csv");
      const guideFileName = fileName.replace(".csv", "_GUIA.md");
      downloadFile(guideContent, guideFileName, "text/markdown");
      toast.success("Plantilla descargada exitosamente");
    } catch (error) {
      console.error("Error downloading template:", error);
      toast.error("Error al descargar la plantilla");
    }
  };

  const handleCsvFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setCsvFile(selectedFile);
    setCsvError(null);
    setCsvStep("preview");
  };

  const handleCsvExtract = async () => {
    if (!csvOcrText.trim()) {
      setCsvError("Por favor ingresa el texto OCR");
      return;
    }

    setCsvLoading(true);
    setCsvError(null);

    try {
      const result = await csvExtractMutation.mutateAsync({
        imageUrl: "https://placeholder.com/image.jpg",
        ocrText: csvOcrText,
      });

      if (result.success && result.data) {
        setCsvExtractedData(result.data);
        setCsvStep("confirm");
      } else {
        setCsvError(result.message || "Error en extracción");
      }
    } catch (err) {
      setCsvError(err instanceof Error ? err.message : "Error desconocido");
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
        documentImageUrl: "https://placeholder.com/image.jpg",
      });

      if (result.success) {
        onSuccess?.(result.batchId);
        setCsvStep("upload");
        setCsvFile(null);
        setCsvOcrText("");
        setCsvExtractedData(null);
        toast.success("Lote guardado exitosamente");
      } else {
        setCsvError(result.message || "Error al guardar");
      }
    } catch (err) {
      setCsvError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setCsvLoading(false);
    }
  };

  return {
    csvStep,
    setCsvStep,
    csvFile,
    csvOcrText,
    setCsvOcrText,
    csvExtractedData,
    setCsvExtractedData,
    csvLoading,
    csvError,
    resetCsv,
    handleDownloadTemplate,
    handleCsvFileUpload,
    handleCsvExtract,
    handleCsvSave,
  };
}
