import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AlertCircle, Trash2, Check, X } from 'lucide-react';

interface DeliveryRow {
  id?: string;
  familia_id: string;
  fecha: string;
  persona_recibio: string;
  frutas_hortalizas_cantidad: number;
  frutas_hortalizas_unidad: string;
  carne_cantidad: number;
  carne_unidad: string;
  notas: string;
  confidence?: number;
  warnings?: string[];
}

interface DeliveryEditableTableProps {
  rows: DeliveryRow[];
  onRowsChange: (rows: DeliveryRow[]) => void;
  readOnly?: boolean;
}

export const DeliveryEditableTable: React.FC<DeliveryEditableTableProps> = ({
  rows,
  onRowsChange,
  readOnly = false,
}) => {
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<DeliveryRow>>({});

  const handleEdit = (row: DeliveryRow) => {
    setEditingRowId(row.id || `row-${rows.indexOf(row)}`);
    setEditValues({ ...row });
  };

  const handleSave = () => {
    if (!editingRowId) return;

    const updatedRows = rows.map(row => {
      const rowId = row.id || `row-${rows.indexOf(row)}`;
      if (rowId === editingRowId) {
        return { ...row, ...editValues };
      }
      return row;
    });

    onRowsChange(updatedRows);
    setEditingRowId(null);
    setEditValues({});
  };

  const handleCancel = () => {
    setEditingRowId(null);
    setEditValues({});
  };

  const handleDelete = (index: number) => {
    const updatedRows = rows.filter((_, i) => i !== index);
    onRowsChange(updatedRows);
  };

  const handleFieldChange = (field: keyof DeliveryRow, value: any) => {
    setEditValues(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead className="bg-gray-100 sticky top-0">
          <tr>
            <th className="border border-gray-300 p-2 text-left">Familia</th>
            <th className="border border-gray-300 p-2 text-left">Recibió</th>
            <th className="border border-gray-300 p-2 text-right">Frutas/Hort.</th>
            <th className="border border-gray-300 p-2 text-right">Carne</th>
            <th className="border border-gray-300 p-2 text-left">Notas</th>
            {!readOnly && <th className="border border-gray-300 p-2 text-center">Acciones</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const rowId = row.id || `row-${index}`;
            const isEditing = editingRowId === rowId;

            return (
              <React.Fragment key={rowId}>
                <tr className={isEditing ? 'bg-blue-50' : 'hover:bg-gray-50'}>
                  <td className="border border-gray-300 p-2">
                    {isEditing ? (
                      <input
                        type="text"
                        value={editValues.familia_id || ''}
                        onChange={(e) => handleFieldChange('familia_id', e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-xs font-mono"
                        disabled
                      />
                    ) : (
                      <span className="font-mono text-xs">{row.familia_id.slice(0, 8)}...</span>
                    )}
                  </td>
                  <td className="border border-gray-300 p-2">
                    {isEditing ? (
                      <input
                        type="text"
                        value={editValues.persona_recibio || ''}
                        onChange={(e) => handleFieldChange('persona_recibio', e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 rounded"
                      />
                    ) : (
                      row.persona_recibio
                    )}
                  </td>
                  <td className="border border-gray-300 p-2 text-right">
                    {isEditing ? (
                      <div className="flex gap-1 items-center justify-end">
                        <input
                          type="number"
                          value={editValues.frutas_hortalizas_cantidad || 0}
                          onChange={(e) =>
                            handleFieldChange('frutas_hortalizas_cantidad', parseFloat(e.target.value))
                          }
                          className="w-16 px-2 py-1 border border-gray-300 rounded text-right"
                          step="0.1"
                        />
                        <input
                          type="text"
                          value={editValues.frutas_hortalizas_unidad || ''}
                          onChange={(e) =>
                            handleFieldChange('frutas_hortalizas_unidad', e.target.value)
                          }
                          className="w-12 px-2 py-1 border border-gray-300 rounded text-center"
                        />
                      </div>
                    ) : (
                      <span>
                        {row.frutas_hortalizas_cantidad} {row.frutas_hortalizas_unidad}
                      </span>
                    )}
                  </td>
                  <td className="border border-gray-300 p-2 text-right">
                    {isEditing ? (
                      <div className="flex gap-1 items-center justify-end">
                        <input
                          type="number"
                          value={editValues.carne_cantidad || 0}
                          onChange={(e) =>
                            handleFieldChange('carne_cantidad', parseFloat(e.target.value))
                          }
                          className="w-16 px-2 py-1 border border-gray-300 rounded text-right"
                          step="0.1"
                        />
                        <input
                          type="text"
                          value={editValues.carne_unidad || ''}
                          onChange={(e) => handleFieldChange('carne_unidad', e.target.value)}
                          className="w-12 px-2 py-1 border border-gray-300 rounded text-center"
                        />
                      </div>
                    ) : (
                      <span>
                        {row.carne_cantidad} {row.carne_unidad}
                      </span>
                    )}
                  </td>
                  <td className="border border-gray-300 p-2 text-sm">
                    {isEditing ? (
                      <input
                        type="text"
                        value={editValues.notas || ''}
                        onChange={(e) => handleFieldChange('notas', e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 rounded"
                      />
                    ) : (
                      <span className="text-gray-600">{row.notas || '-'}</span>
                    )}
                  </td>
                  {!readOnly && (
                    <td className="border border-gray-300 p-2 text-center">
                      {isEditing ? (
                        <div className="flex gap-1 justify-center">
                          <button
                            onClick={handleSave}
                            className="p-1 hover:bg-green-100 rounded"
                            title="Guardar"
                          >
                            <Check className="w-4 h-4 text-green-600" />
                          </button>
                          <button
                            onClick={handleCancel}
                            className="p-1 hover:bg-red-100 rounded"
                            title="Cancelar"
                          >
                            <X className="w-4 h-4 text-red-600" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-1 justify-center">
                          <button
                            onClick={() => handleEdit(row)}
                            className="px-2 py-1 text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 rounded"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => handleDelete(index)}
                            className="p-1 hover:bg-red-100 rounded"
                            title="Eliminar"
                          >
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
                {row.warnings && row.warnings.length > 0 && (
                  <tr className="bg-yellow-50">
                    <td colSpan={readOnly ? 5 : 6} className="border border-gray-300 p-2">
                      <div className="flex gap-2 text-xs text-yellow-700">
                        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <div>
                          {row.warnings.map((w, i) => (
                            <div key={i}>⚠️ {w}</div>
                          ))}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>

      {rows.length === 0 && (
        <Card className="p-8 text-center text-gray-500">
          <p>No hay entregas registradas</p>
        </Card>
      )}
    </div>
  );
};
