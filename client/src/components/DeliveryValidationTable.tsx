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

  const flaggedCount = records.filter((r) => r.flagged).length;
  const missingRequiredCount = records.filter((r) => !r.familia_id || !r.persona_recibio).length;
  const canSave = missingRequiredCount === 0 && records.length > 0;

  return (
    <div className="w-full">
      <div className="mb-4 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-600">
            {records.length} beneficiarios pendientes de guardar
          </p>
          {flaggedCount > 0 && (
            <div className="flex items-center gap-2 px-3 py-1 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-700">
              <AlertCircle className="w-4 h-4" />
              {flaggedCount} registros requieren revisión
            </div>
          )}
        </div>
        {missingRequiredCount > 0 && (
          <div className="flex items-center gap-2 px-3 py-1 bg-red-50 border border-red-200 rounded text-xs text-red-700">
            <AlertCircle className="w-4 h-4" />
            {missingRequiredCount} registros con campos requeridos vacíos (Familia ID, Persona que recibió)
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
                    <div>
                      <input
                        type="text"
                        value={
                          editValues[record.id]?.persona_recibio ??
                          record.persona_recibio
                        }
                        onChange={(e) =>
                          handleFieldChange(record.id, 'persona_recibio', e.target.value)
                        }
                        className={`w-full px-2 py-1 border rounded ${
                          !editValues[record.id]?.persona_recibio && !record.persona_recibio
                            ? 'border-red-300 bg-red-50'
                            : 'border-gray-300'
                        }`}
                        autoFocus
                      />
                      {!editValues[record.id]?.persona_recibio && !record.persona_recibio && (
                        <p className="text-xs text-red-600 mt-1">Campo requerido</p>
                      )}
                    </div>
                  ) : (
                    <span className={!record.persona_recibio ? 'text-red-600 font-semibold' : ''}>
                      {record.persona_recibio || '⚠️ Falta'}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {editingId === record.id ? (
                    <input
                      type="number"
                      value={
                        editValues[record.id]?.frutas_hortalizas_cantidad ??
                        record.frutas_hortalizas_cantidad
                      }
                      onChange={(e) =>
                        handleFieldChange(
                          record.id,
                          'frutas_hortalizas_cantidad',
                          parseInt(e.target.value)
                        )
                      }
                      className="w-full px-2 py-1 border border-gray-300 rounded"
                    />
                  ) : (
                    <span>{record.frutas_hortalizas_cantidad}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {editingId === record.id ? (
                    <input
                      type="date"
                      value={
                        editValues[record.id]?.fecha ?? record.fecha
                      }
                      onChange={(e) =>
                        handleFieldChange(record.id, 'fecha', e.target.value)
                      }
                      className="w-full px-2 py-1 border border-gray-300 rounded"
                    />
                  ) : (
                    <span>{record.fecha}</span>
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
                  {!record.familia_id || !record.persona_recibio ? (
                    <div className="flex items-center justify-center gap-1">
                      <span className="text-red-600 font-semibold">❌ Incompleto</span>
                    </div>
                  ) : record.flagged ? (
                    <div className="flex items-center justify-center gap-1">
                      <span className="text-yellow-600">⚠️ Revisar</span>
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
