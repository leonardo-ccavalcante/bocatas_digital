# Modal Tabs & Batch Processing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "📸 Escanear Documento" tab to DeliveryDocumentUpload modal alongside existing CSV tab, with batch processing to accumulate multiple OCR-extracted records before final save.

**Architecture:** 
- Two-tab modal: CSV (existing) + OCR (new)
- Tab switching clears previous state (no data leakage)
- Batch state accumulator: in-memory array of extracted beneficiaries + error log
- Validation table for reviewing/editing extracted data before save
- Error handling: flag failed OCR records with red badge, continue processing others
- Running counter shows total beneficiaries pending save

**Tech Stack:** React 19, Tailwind 4, tRPC 11, Zod, Vitest, shadcn/ui

---

## File Structure

**Files to Create:**
- `client/src/components/BatchAccumulatorContext.tsx` - React Context for batch state management
- `client/src/hooks/useBatchAccumulator.ts` - Hook to access batch state
- `client/src/components/DeliveryValidationTable.tsx` - Editable table for reviewing extracted records
- `client/src/components/DeliveryDocumentUploadTabs.tsx` - Tab wrapper for CSV + OCR workflows

**Files to Modify:**
- `client/src/components/DeliveryDocumentUpload.tsx` - Refactor to use tabs + batch accumulator
- `client/src/components/PhotoUploadInput.tsx` - Already created, integrate into OCR tab

**Files to Test:**
- `client/src/components/__tests__/BatchAccumulatorContext.test.tsx`
- `client/src/components/__tests__/DeliveryValidationTable.test.tsx`
- `client/src/components/__tests__/DeliveryDocumentUploadTabs.test.tsx`

---

## Task 1: Create Batch Accumulator Context

**Files:**
- Create: `client/src/components/BatchAccumulatorContext.tsx`
- Create: `client/src/hooks/useBatchAccumulator.ts`
- Test: `client/src/components/__tests__/BatchAccumulatorContext.test.tsx`

**Context Purpose:** Manage accumulated OCR-extracted records across multiple photo uploads, track errors, provide clear/add/remove operations.

### Step 1: Write failing test for batch context

```typescript
// client/src/components/__tests__/BatchAccumulatorContext.test.tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { BatchAccumulatorProvider, useBatchAccumulator } from '../BatchAccumulatorContext';
import React from 'react';

describe('BatchAccumulatorContext', () => {
  it('should initialize with empty records and errors', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <BatchAccumulatorProvider>{children}</BatchAccumulatorProvider>
    );
    const { result } = renderHook(() => useBatchAccumulator(), { wrapper });

    expect(result.current.records).toEqual([]);
    expect(result.current.errors).toEqual([]);
    expect(result.current.totalCount).toBe(0);
  });

  it('should add records to batch', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <BatchAccumulatorProvider>{children}</BatchAccumulatorProvider>
    );
    const { result } = renderHook(() => useBatchAccumulator(), { wrapper });

    const newRecords = [
      {
        id: '1',
        nombre_beneficiario: 'Juan García',
        cantidad_entregada: 5,
        fecha_entrega: '2026-04-27',
        confidence: 0.95,
        flagged: false,
      },
    ];

    act(() => {
      result.current.addRecords(newRecords);
    });

    expect(result.current.records).toHaveLength(1);
    expect(result.current.totalCount).toBe(1);
  });

  it('should add error log entries', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <BatchAccumulatorProvider>{children}</BatchAccumulatorProvider>
    );
    const { result } = renderHook(() => useBatchAccumulator(), { wrapper });

    act(() => {
      result.current.addError({
        photoId: 'photo-1',
        message: 'OCR confidence too low (0.45)',
        severity: 'warning',
      });
    });

    expect(result.current.errors).toHaveLength(1);
    expect(result.current.errors[0].message).toContain('confidence');
  });

  it('should clear all records and errors', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <BatchAccumulatorProvider>{children}</BatchAccumulatorProvider>
    );
    const { result } = renderHook(() => useBatchAccumulator(), { wrapper });

    act(() => {
      result.current.addRecords([
        {
          id: '1',
          nombre_beneficiario: 'Test',
          cantidad_entregada: 1,
          fecha_entrega: '2026-04-27',
          confidence: 0.9,
          flagged: false,
        },
      ]);
      result.current.addError({
        photoId: 'p1',
        message: 'Test error',
        severity: 'error',
      });
    });

    expect(result.current.records).toHaveLength(1);
    expect(result.current.errors).toHaveLength(1);

    act(() => {
      result.current.clear();
    });

    expect(result.current.records).toEqual([]);
    expect(result.current.errors).toEqual([]);
    expect(result.current.totalCount).toBe(0);
  });

  it('should update individual record', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <BatchAccumulatorProvider>{children}</BatchAccumulatorProvider>
    );
    const { result } = renderHook(() => useBatchAccumulator(), { wrapper });

    const record = {
      id: '1',
      nombre_beneficiario: 'Juan García',
      cantidad_entregada: 5,
      fecha_entrega: '2026-04-27',
      confidence: 0.95,
      flagged: false,
    };

    act(() => {
      result.current.addRecords([record]);
    });

    act(() => {
      result.current.updateRecord('1', {
        nombre_beneficiario: 'Juan García López',
      });
    });

    expect(result.current.records[0].nombre_beneficiario).toBe('Juan García López');
  });

  it('should flag record for manual review', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <BatchAccumulatorProvider>{children}</BatchAccumulatorProvider>
    );
    const { result } = renderHook(() => useBatchAccumulator(), { wrapper });

    const record = {
      id: '1',
      nombre_beneficiario: 'Juan García',
      cantidad_entregada: 5,
      fecha_entrega: '2026-04-27',
      confidence: 0.95,
      flagged: false,
    };

    act(() => {
      result.current.addRecords([record]);
      result.current.flagRecord('1', 'OCR confidence below threshold');
    });

    expect(result.current.records[0].flagged).toBe(true);
  });
});
```

### Step 2: Run test to verify it fails

```bash
cd /home/ubuntu/bocatas-digital
pnpm test client/src/components/__tests__/BatchAccumulatorContext.test.tsx
```

Expected: FAIL - "Cannot find module 'BatchAccumulatorContext'"

### Step 3: Implement BatchAccumulatorContext

```typescript
// client/src/components/BatchAccumulatorContext.tsx
import React, { createContext, useContext, useState, useCallback } from 'react';

export interface ExtractedBeneficiary {
  id: string;
  nombre_beneficiario: string;
  cantidad_entregada: number;
  fecha_entrega: string;
  confidence: number;
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
```

### Step 4: Run test to verify it passes

```bash
cd /home/ubuntu/bocatas-digital
pnpm test client/src/components/__tests__/BatchAccumulatorContext.test.tsx
```

Expected: PASS (all 7 tests)

### Step 5: Create useBatchAccumulator hook

```typescript
// client/src/hooks/useBatchAccumulator.ts
export { useBatchAccumulator } from '@/components/BatchAccumulatorContext';
```

### Step 6: Commit

```bash
cd /home/ubuntu/bocatas-digital
git add client/src/components/BatchAccumulatorContext.tsx \
        client/src/hooks/useBatchAccumulator.ts \
        client/src/components/__tests__/BatchAccumulatorContext.test.tsx
git commit -m "feat: add batch accumulator context for OCR record management"
```

---

## Task 2: Create Validation Table Component

**Files:**
- Create: `client/src/components/DeliveryValidationTable.tsx`
- Test: `client/src/components/__tests__/DeliveryValidationTable.test.tsx`

**Purpose:** Display extracted beneficiaries in editable table with confidence badges, flagged status, and inline editing.

### Step 1: Write failing test for validation table

```typescript
// client/src/components/__tests__/DeliveryValidationTable.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeliveryValidationTable } from '../DeliveryValidationTable';

describe('DeliveryValidationTable', () => {
  const mockRecords = [
    {
      id: '1',
      nombre_beneficiario: 'Juan García',
      cantidad_entregada: 5,
      fecha_entrega: '2026-04-27',
      confidence: 0.95,
      flagged: false,
    },
    {
      id: '2',
      nombre_beneficiario: 'María López',
      cantidad_entregada: 3,
      fecha_entrega: '2026-04-27',
      confidence: 0.65,
      flagged: true,
      flagReason: 'Low confidence',
    },
  ];

  it('should render table with records', () => {
    const onUpdate = vi.fn();
    render(
      <DeliveryValidationTable
        records={mockRecords}
        onUpdate={onUpdate}
      />
    );

    expect(screen.getByText('Juan García')).toBeInTheDocument();
    expect(screen.getByText('María López')).toBeInTheDocument();
  });

  it('should display confidence badges with correct colors', () => {
    const onUpdate = vi.fn();
    render(
      <DeliveryValidationTable
        records={mockRecords}
        onUpdate={onUpdate}
      />
    );

    // High confidence (95%) should show green
    expect(screen.getByText('95%')).toHaveClass('bg-green-100');
    
    // Low confidence (65%) should show yellow
    expect(screen.getByText('65%')).toHaveClass('bg-yellow-100');
  });

  it('should display flagged badge for records with issues', () => {
    const onUpdate = vi.fn();
    render(
      <DeliveryValidationTable
        records={mockRecords}
        onUpdate={onUpdate}
      />
    );

    expect(screen.getByText('⚠️ Revisar')).toBeInTheDocument();
  });

  it('should allow editing record fields', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(
      <DeliveryValidationTable
        records={mockRecords}
        onUpdate={onUpdate}
      />
    );

    const nameInput = screen.getByDisplayValue('Juan García');
    await user.clear(nameInput);
    await user.type(nameInput, 'Juan García López');
    await user.tab();

    expect(onUpdate).toHaveBeenCalledWith('1', {
      nombre_beneficiario: 'Juan García López',
    });
  });

  it('should allow removing records', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(
      <DeliveryValidationTable
        records={mockRecords}
        onUpdate={vi.fn()}
        onRemove={onRemove}
      />
    );

    const deleteButton = screen.getAllByRole('button', { name: /eliminar/i })[0];
    await user.click(deleteButton);

    expect(onRemove).toHaveBeenCalledWith('1');
  });

  it('should show summary count', () => {
    const onUpdate = vi.fn();
    render(
      <DeliveryValidationTable
        records={mockRecords}
        onUpdate={onUpdate}
      />
    );

    expect(screen.getByText(/2 beneficiarios/i)).toBeInTheDocument();
  });
});
```

### Step 2: Run test to verify it fails

```bash
cd /home/ubuntu/bocatas-digital
pnpm test client/src/components/__tests__/DeliveryValidationTable.test.tsx
```

Expected: FAIL - "Cannot find module 'DeliveryValidationTable'"

### Step 3: Implement DeliveryValidationTable

```typescript
// client/src/components/DeliveryValidationTable.tsx
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { AlertCircle, Trash2 } from 'lucide-react';
import { ExtractedBeneficiary } from './BatchAccumulatorContext';

interface DeliveryValidationTableProps {
  records: ExtractedBeneficiary[];
  onUpdate: (id: string, updates: Partial<ExtractedBeneficiary>) => void;
  onRemove?: (id: string) => void;
}

const getConfidenceBadgeColor = (confidence: number): string => {
  if (confidence >= 0.85) return 'bg-green-100 text-green-800';
  if (confidence >= 0.70) return 'bg-yellow-100 text-yellow-800';
  return 'bg-red-100 text-red-800';
};

export const DeliveryValidationTable: React.FC<DeliveryValidationTableProps> = ({
  records,
  onUpdate,
  onRemove,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, any>>({});

  const handleFieldChange = (id: string, field: string, value: any) => {
    setEditValues((prev) => ({
      ...prev,
      [id]: { ...prev[id], [field]: value },
    }));
  };

  const handleSaveEdit = (id: string) => {
    if (editValues[id]) {
      onUpdate(id, editValues[id]);
    }
    setEditingId(null);
    setEditValues((prev) => {
      const newValues = { ...prev };
      delete newValues[id];
      return newValues;
    });
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditValues({});
  };

  return (
    <div className="w-full">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-gray-600">
          {records.length} beneficiarios pendientes de guardar
        </p>
        {records.some((r) => r.flagged) && (
          <div className="flex items-center gap-2 px-3 py-1 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-700">
            <AlertCircle className="w-4 h-4" />
            {records.filter((r) => r.flagged).length} registros requieren revisión
          </div>
        )}
      </div>

      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-gray-700">Beneficiario</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-700">Cantidad</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-700">Fecha</th>
              <th className="px-4 py-3 text-center font-semibold text-gray-700">Confianza</th>
              <th className="px-4 py-3 text-center font-semibold text-gray-700">Estado</th>
              <th className="px-4 py-3 text-center font-semibold text-gray-700">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr
                key={record.id}
                className={`border-b border-gray-200 hover:bg-gray-50 ${
                  record.flagged ? 'bg-red-50' : ''
                }`}
              >
                <td className="px-4 py-3">
                  {editingId === record.id ? (
                    <input
                      type="text"
                      value={
                        editValues[record.id]?.nombre_beneficiario ??
                        record.nombre_beneficiario
                      }
                      onChange={(e) =>
                        handleFieldChange(record.id, 'nombre_beneficiario', e.target.value)
                      }
                      className="w-full px-2 py-1 border border-gray-300 rounded"
                      autoFocus
                    />
                  ) : (
                    <span>{record.nombre_beneficiario}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {editingId === record.id ? (
                    <input
                      type="number"
                      value={
                        editValues[record.id]?.cantidad_entregada ??
                        record.cantidad_entregada
                      }
                      onChange={(e) =>
                        handleFieldChange(
                          record.id,
                          'cantidad_entregada',
                          parseInt(e.target.value)
                        )
                      }
                      className="w-full px-2 py-1 border border-gray-300 rounded"
                    />
                  ) : (
                    <span>{record.cantidad_entregada}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {editingId === record.id ? (
                    <input
                      type="date"
                      value={
                        editValues[record.id]?.fecha_entrega ?? record.fecha_entrega
                      }
                      onChange={(e) =>
                        handleFieldChange(record.id, 'fecha_entrega', e.target.value)
                      }
                      className="w-full px-2 py-1 border border-gray-300 rounded"
                    />
                  ) : (
                    <span>{record.fecha_entrega}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  <span
                    className={`inline-block px-2 py-1 rounded text-xs font-semibold ${getConfidenceBadgeColor(
                      record.confidence
                    )}`}
                  >
                    {Math.round(record.confidence * 100)}%
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  {record.flagged ? (
                    <div className="flex items-center justify-center gap-1">
                      <span className="text-red-600">⚠️ Revisar</span>
                    </div>
                  ) : (
                    <span className="text-green-600">✓</span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  {editingId === record.id ? (
                    <div className="flex gap-2 justify-center">
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => handleSaveEdit(record.id)}
                      >
                        Guardar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleCancel}
                      >
                        Cancelar
                      </Button>
                    </div>
                  ) : (
                    <div className="flex gap-2 justify-center">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditingId(record.id)}
                      >
                        Editar
                      </Button>
                      {onRemove && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onRemove(record.id)}
                          className="text-red-600 hover:text-red-700"
                          title="Eliminar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
```

### Step 4: Run test to verify it passes

```bash
cd /home/ubuntu/bocatas-digital
pnpm test client/src/components/__tests__/DeliveryValidationTable.test.tsx
```

Expected: PASS (all 6 tests)

### Step 5: Commit

```bash
cd /home/ubuntu/bocatas-digital
git add client/src/components/DeliveryValidationTable.tsx \
        client/src/components/__tests__/DeliveryValidationTable.test.tsx
git commit -m "feat: add delivery validation table with inline editing and confidence badges"
```

---

## Task 3: Refactor DeliveryDocumentUpload with Tabs

**Files:**
- Modify: `client/src/components/DeliveryDocumentUpload.tsx`
- Test: `client/src/components/__tests__/DeliveryDocumentUpload.test.tsx` (update existing)

**Purpose:** Integrate tabs (CSV + OCR), batch accumulator, and validation table into unified modal.

### Step 1: Write failing test for tabs integration

```typescript
// client/src/components/__tests__/DeliveryDocumentUpload.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeliveryDocumentUpload } from '../DeliveryDocumentUpload';
import { BatchAccumulatorProvider } from '../BatchAccumulatorContext';

// Mock tRPC
vi.mock('@/lib/trpc', () => ({
  trpc: {
    entregas: {
      downloadTemplate: {
        useQuery: () => ({
          data: {
            csvContent: 'test,csv',
            guideContent: 'test guide',
            fileName: 'template.csv',
          },
        }),
      },
      extractFromPhoto: {
        useMutation: () => ({
          mutateAsync: vi.fn().mockResolvedValue({
            success: true,
            data: {
              records: [
                {
                  id: '1',
                  nombre_beneficiario: 'Test',
                  cantidad_entregada: 1,
                  fecha_entrega: '2026-04-27',
                  confidence: 0.9,
                  flagged: false,
                },
              ],
            },
          }),
        }),
      },
      saveBatch: {
        useMutation: () => ({
          mutateAsync: vi.fn().mockResolvedValue({
            success: true,
            batchId: 'batch-123',
          }),
        }),
      },
    },
  },
}));

describe('DeliveryDocumentUpload with Tabs', () => {
  it('should render two tabs: CSV and OCR', () => {
    render(
      <BatchAccumulatorProvider>
        <DeliveryDocumentUpload />
      </BatchAccumulatorProvider>
    );

    expect(screen.getByRole('tab', { name: /📄 cargar csv/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /📸 escanear documento/i })).toBeInTheDocument();
  });

  it('should show CSV tab content by default', () => {
    render(
      <BatchAccumulatorProvider>
        <DeliveryDocumentUpload />
      </BatchAccumulatorProvider>
    );

    expect(screen.getByText(/cargar documento de entrega/i)).toBeInTheDocument();
  });

  it('should switch to OCR tab when clicked', async () => {
    const user = userEvent.setup();
    render(
      <BatchAccumulatorProvider>
        <DeliveryDocumentUpload />
      </BatchAccumulatorProvider>
    );

    const ocrTab = screen.getByRole('tab', { name: /📸 escanear documento/i });
    await user.click(ocrTab);

    await waitFor(() => {
      expect(screen.getByText(/captura de documento/i)).toBeInTheDocument();
    });
  });

  it('should clear state when switching tabs', async () => {
    const user = userEvent.setup();
    render(
      <BatchAccumulatorProvider>
        <DeliveryDocumentUpload />
      </BatchAccumulatorProvider>
    );

    // Switch to OCR tab
    const ocrTab = screen.getByRole('tab', { name: /📸 escanear documento/i });
    await user.click(ocrTab);

    // Switch back to CSV tab
    const csvTab = screen.getByRole('tab', { name: /📄 cargar csv/i });
    await user.click(csvTab);

    // CSV tab should be in initial state
    expect(screen.getByText(/cargar documento de entrega/i)).toBeInTheDocument();
  });

  it('should show batch counter in OCR tab', async () => {
    const user = userEvent.setup();
    render(
      <BatchAccumulatorProvider>
        <DeliveryDocumentUpload />
      </BatchAccumulatorProvider>
    );

    const ocrTab = screen.getByRole('tab', { name: /📸 escanear documento/i });
    await user.click(ocrTab);

    await waitFor(() => {
      expect(screen.getByText(/0 beneficiarios pendientes/i)).toBeInTheDocument();
    });
  });
});
```

### Step 2: Run test to verify it fails

```bash
cd /home/ubuntu/bocatas-digital
pnpm test client/src/components/__tests__/DeliveryDocumentUpload.test.tsx
```

Expected: FAIL - Tests fail because tabs don't exist yet

### Step 3: Refactor DeliveryDocumentUpload with tabs

```typescript
// client/src/components/DeliveryDocumentUpload.tsx
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
  const handlePhotoUpload = async (photoFile: File, rotationDegrees: number) => {
    setOcrLoading(true);
    setOcrError(null);

    try {
      // TODO: Upload photo to storage and get URL
      const photoUrl = 'https://placeholder.com/photo.jpg';

      const result = await ocrExtractMutation.mutateAsync({
        imageUrl: photoUrl,
      });

      if (result.success && result.data.records) {
        // Add records to batch accumulator
        batch.addRecords(result.data.records);
        
        // Log any errors
        if (result.data.errors && result.data.errors.length > 0) {
          result.data.errors.forEach((error: any) => {
            batch.addError({
              photoId: photoUrl,
              message: error.message,
              severity: 'warning',
            });
          });
        }

        setOcrStep('validation');
        toast.success(`${result.data.records.length} beneficiarios extraídos`);
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
          fecha_reparto: new Date().toISOString().split('T')[0],
          total_personas_asistidas: batch.records.length,
          warnings: [],
        },
        rows: batch.records,
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
                onPhotoCapture={handlePhotoUpload}
                loading={ocrLoading}
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
```

### Step 4: Run test to verify it passes

```bash
cd /home/ubuntu/bocatas-digital
pnpm test client/src/components/__tests__/DeliveryDocumentUpload.test.tsx
```

Expected: PASS (all tests for tabs integration)

### Step 5: Run all tests to ensure no regressions

```bash
cd /home/ubuntu/bocatas-digital
pnpm test
```

Expected: 580+ tests passing, 0 failures

### Step 6: Commit

```bash
cd /home/ubuntu/bocatas-digital
git add client/src/components/DeliveryDocumentUpload.tsx \
        client/src/components/__tests__/DeliveryDocumentUpload.test.tsx
git commit -m "feat: refactor delivery upload with tabs, batch accumulator, and validation table"
```

---

## Task 4: Integration & Final Testing

**Files:**
- Verify: `client/src/App.tsx` - Modal integration point
- Verify: `client/src/pages/Entregas.tsx` - Uses DeliveryDocumentUpload

### Step 1: Verify modal is properly integrated

```bash
cd /home/ubuntu/bocatas-digital
grep -n "DeliveryDocumentUpload" client/src/pages/Entregas.tsx
```

Expected: Modal is rendered with BatchAccumulatorProvider wrapper

### Step 2: Wrap modal with BatchAccumulatorProvider

If not already wrapped, update `client/src/pages/Entregas.tsx`:

```typescript
import { BatchAccumulatorProvider } from '@/components/BatchAccumulatorContext';
import { DeliveryDocumentUpload } from '@/components/DeliveryDocumentUpload';

export const Entregas: React.FC = () => {
  return (
    <BatchAccumulatorProvider>
      <DeliveryDocumentUpload
        onSuccess={(batchId) => {
          toast.success(`Lote ${batchId} guardado exitosamente`);
        }}
        onError={(message) => {
          toast.error(message);
        }}
      />
    </BatchAccumulatorProvider>
  );
};
```

### Step 3: Run full test suite

```bash
cd /home/ubuntu/bocatas-digital
pnpm test
```

Expected: 580+ tests passing, 0 failures

### Step 4: Run type check

```bash
cd /home/ubuntu/bocatas-digital
pnpm check
```

Expected: 0 TypeScript errors

### Step 5: Run build

```bash
cd /home/ubuntu/bocatas-digital
pnpm build
```

Expected: Build succeeds, no warnings

### Step 6: Commit integration

```bash
cd /home/ubuntu/bocatas-digital
git add client/src/pages/Entregas.tsx
git commit -m "feat: integrate batch accumulator provider with delivery upload modal"
```

---

## Success Criteria

- [ ] Tab switching clears previous tab state (no data leakage)
- [ ] Multiple photos accumulate in batch (counter increments)
- [ ] Validation table shows extracted beneficiaries with confidence badges
- [ ] Failed OCR records flagged (red badge) but don't block batch
- [ ] All 580+ tests passing
- [ ] 0 TypeScript errors
- [ ] Production build succeeds
- [ ] Batch can be saved with multiple records at once
- [ ] Error log shows all processing errors without blocking workflow

---

## Notes

- **Karpathy Simplicity:** Each component has single responsibility (Context = state, Table = display, Modal = orchestration)
- **TDD Throughout:** All tasks start with failing tests, then implementation
- **Surgical Changes:** Only files necessary for tabs + batch processing modified
- **No Speculative Features:** No caching, no undo/redo, no advanced features beyond requirements
