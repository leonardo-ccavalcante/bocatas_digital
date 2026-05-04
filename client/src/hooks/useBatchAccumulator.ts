import { useState, useCallback } from 'react';

export interface ExtractedBeneficiary {
  id: string;
  nombre_beneficiario: string;
  cantidad_entregada: number;
  fecha_entrega: string;
  confidence: number;
  flagged: boolean;
  flagReason?: string;
  // Delivery record fields — populated during the validation step before saving
  familia_id?: string;
  persona_recibio?: string;
  fecha?: string;
  frutas_hortalizas_cantidad?: number;
  frutas_hortalizas_unidad?: string;
  carne_cantidad?: number;
  carne_unidad?: string;
  notas?: string;
  warnings?: string[];
  // S3 metadata — set when the record was extracted from a photo
  photoUrl?: string;
  photoKey?: string;
  rotationDegrees?: number;
}

export interface ErrorLogEntry {
  photoId: string;
  message: string;
  severity: 'error' | 'warning';
  timestamp?: Date;
}

export const useBatchAccumulator = () => {
  const [records, setRecords] = useState<ExtractedBeneficiary[]>([]);
  const [errors, setErrors] = useState<ErrorLogEntry[]>([]);

  const addRecords = useCallback((newRecords: ExtractedBeneficiary[]) => {
    setRecords((prev) => [...prev, ...newRecords]);
  }, []);

  const addError = useCallback((error: ErrorLogEntry) => {
    setErrors((prev) => [...prev, { ...error, timestamp: new Date() }]);
  }, []);

  const updateRecord = useCallback((id: string, updates: Partial<ExtractedBeneficiary>) => {
    setRecords((prev) =>
      prev.map((record) => (record.id === id ? { ...record, ...updates } : record))
    );
  }, []);

  const flagRecord = useCallback((id: string, reason: string) => {
    setRecords((prev) =>
      prev.map((record) =>
        record.id === id ? { ...record, flagged: true, flagReason: reason } : record
      )
    );
  }, []);

  const removeRecord = useCallback((id: string) => {
    setRecords((prev) => prev.filter((record) => record.id !== id));
  }, []);

  const clear = useCallback(() => {
    setRecords([]);
    setErrors([]);
  }, []);

  return {
    records,
    errors,
    totalCount: records.length,
    addRecords,
    addError,
    updateRecord,
    flagRecord,
    removeRecord,
    clear,
  };
};
