import React, { createContext, useContext, useState, useCallback } from 'react';

export interface ExtractedBeneficiary {
  id: string;
  familia_id: string;
  fecha: string;
  persona_recibio: string;
  frutas_hortalizas_cantidad: number;
  frutas_hortalizas_unidad: string;
  carne_cantidad: number;
  carne_unidad: string;
  notas: string;
  confidence: number;
  warnings: string[];
  flagged: boolean;
  flagReason?: string;
}

export interface ErrorLogEntry {
  photoId: string;
  message: string;
  severity: 'error' | 'warning';
  timestamp?: Date;
}

interface BatchAccumulatorContextType {
  records: ExtractedBeneficiary[];
  errors: ErrorLogEntry[];
  totalCount: number;
  addRecords: (records: ExtractedBeneficiary[]) => void;
  addError: (error: ErrorLogEntry) => void;
  updateRecord: (id: string, updates: Partial<ExtractedBeneficiary>) => void;
  flagRecord: (id: string, reason: string) => void;
  removeRecord: (id: string) => void;
  clear: () => void;
}

const BatchAccumulatorContext = createContext<BatchAccumulatorContextType | undefined>(
  undefined
);

export const BatchAccumulatorProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
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

  const value: BatchAccumulatorContextType = {
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

  return (
    <BatchAccumulatorContext.Provider value={value}>
      {children}
    </BatchAccumulatorContext.Provider>
  );
};

export const useBatchAccumulator = (): BatchAccumulatorContextType => {
  const context = useContext(BatchAccumulatorContext);
  if (!context) {
    throw new Error('useBatchAccumulator must be used within BatchAccumulatorProvider');
  }
  return context;
};
