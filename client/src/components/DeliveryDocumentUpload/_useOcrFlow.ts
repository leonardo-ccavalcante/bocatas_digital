import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useBatchAccumulator } from "@/hooks/useBatchAccumulator";
import { toast } from "sonner";

export type OcrStep = "upload" | "validation" | "confirm";

interface UseOcrFlowArgs {
  onSuccess?: (batchId: string) => void;
}

export function useOcrFlow({ onSuccess }: UseOcrFlowArgs) {
  const [ocrStep, setOcrStep] = useState<OcrStep>("upload");
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);

  const batch = useBatchAccumulator();

  const saveMutation = trpc.entregas.saveBatch.useMutation();
  const ocrExtractMutation = trpc.entregas.extractFromPhoto.useMutation();
  const uploadPhotoMutation = trpc.entregas.uploadPhotoToStorage.useMutation();

  const resetOcr = () => {
    setOcrStep("upload");
    setOcrError(null);
  };

  const handlePhotoUpload = async (photoFile: File, rotationDegrees: number) => {
    setOcrLoading(true);
    setOcrError(null);

    try {
      // Step 1: Convert File to base64
      const reader = new FileReader();
      const photoData = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          const base64 = result.split(",")[1]; // Remove data:image/jpeg;base64, prefix
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(photoFile);
      });

      // Step 2: Upload photo to S3 storage via tRPC
      const uploadResult = await uploadPhotoMutation.mutateAsync({
        photoData,
        rotation: rotationDegrees,
        fileName: photoFile.name,
      });

      const { photoUrl, photoKey, rotation } = uploadResult;

      // Step 3: Extract delivery data from photo
      const result = await ocrExtractMutation.mutateAsync({
        photoUrl: photoUrl,
        programaId: "default-programa",
      });

      if (result.success && result.beneficiaries) {
        const mappedRecords = result.beneficiaries.map((d: any) => ({
          id: d.id || `${Date.now()}-${Math.random()}`,
          // Required ExtractedBeneficiary fields
          nombre_beneficiario: d.beneficiaryName || d.nombre_beneficiario || "",
          cantidad_entregada: d.cantidad_entregada || 0,
          fecha_entrega: d.fecha || d.fecha_entrega || new Date().toISOString().split("T")[0],
          confidence: d.confidence || d.nameConfidence || 0,
          flagged: false,
          // Delivery record fields (pre-populated from OCR where available)
          familia_id: d.familia_id || "",
          fecha: d.fecha || new Date().toISOString().split("T")[0],
          persona_recibio: d.persona_recibio || d.beneficiaryName || "",
          frutas_hortalizas_cantidad: d.frutas_hortalizas_cantidad || 0,
          frutas_hortalizas_unidad: d.frutas_hortalizas_unidad || "kg",
          carne_cantidad: d.carne_cantidad || 0,
          carne_unidad: d.carne_unidad || "kg",
          notas: d.notas || "",
          warnings: d.warnings || [],
          // S3 metadata
          photoUrl,
          photoKey,
          rotationDegrees: rotation,
        }));
        batch.addRecords(mappedRecords);

        // Log any errors
        if (result.errors && result.errors.length > 0) {
          result.errors.forEach((error: string) => {
            batch.addError({
              photoId: photoKey,
              message: error,
              severity: "warning",
            });
          });
        }

        setOcrStep("validation");
        toast.success(`${mappedRecords.length} beneficiarios extraídos`);
      } else {
        const errorMsg = result.message || "Error en extracción OCR";
        setOcrError(errorMsg);
        batch.addError({
          photoId: photoKey,
          message: errorMsg,
          severity: "error",
        });
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Error desconocido";
      console.error("Error in handlePhotoUpload:", err);
      setOcrError(errorMsg);
      batch.addError({
        photoId: "unknown",
        message: `Error al procesar foto: ${errorMsg}`,
        severity: "error",
      });
    } finally {
      setOcrLoading(false);
    }
  };

  const handleOcrSave = async () => {
    if (batch.records.length === 0) {
      setOcrError("No hay beneficiarios para guardar");
      return;
    }

    setOcrLoading(true);
    setOcrError(null);

    try {
      const result = await saveMutation.mutateAsync({
        header: {
          numero_albaran: "OCR-" + Date.now(),
          numero_reparto: "1",
          numero_factura_carne: null,
          fecha_reparto: new Date().toISOString().split("T")[0],
          total_personas_asistidas: batch.records.length,
          confidence: 0.85,
          warnings: [],
        },
        rows: batch.records.map((r) => ({
          familia_id: r.familia_id ?? "",
          fecha: r.fecha ?? r.fecha_entrega,
          persona_recibio: r.persona_recibio ?? r.nombre_beneficiario,
          frutas_hortalizas_cantidad: r.frutas_hortalizas_cantidad ?? 0,
          frutas_hortalizas_unidad: r.frutas_hortalizas_unidad ?? "kg",
          carne_cantidad: r.carne_cantidad ?? 0,
          carne_unidad: r.carne_unidad ?? "kg",
          notas: r.notas ?? "",
          confidence: r.confidence,
          warnings: r.warnings ?? [],
        })),
        documentImageUrl: "https://placeholder.com/photo.jpg",
      });

      if (result.success) {
        onSuccess?.(result.batchId);
        batch.clear();
        setOcrStep("upload");
        toast.success("Lote guardado exitosamente");
      } else {
        setOcrError(result.message || "Error al guardar");
      }
    } catch (err) {
      setOcrError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setOcrLoading(false);
    }
  };

  return {
    ocrStep,
    setOcrStep,
    ocrLoading,
    ocrError,
    batch,
    resetOcr,
    handlePhotoUpload,
    handleOcrSave,
  };
}
