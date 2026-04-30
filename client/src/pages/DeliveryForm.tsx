import { useState, useEffect } from 'react';
import { useRoute, useLocation } from 'wouter';
import { useAuth } from '@/_core/hooks/useAuth';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

export default function DeliveryForm() {
  const { user } = useAuth();
  const [, params] = useRoute('/entregas/:id');
  const [, navigate] = useLocation();
  const deliveryId = params?.id;
  const isEdit = deliveryId && deliveryId !== 'nueva';

  // Form state
  const [formData, setFormData] = useState({
    entregas_batch_id: '',
    familia_id: '',
    fecha: new Date().toISOString().split('T')[0],
    persona_recibio: '',
    frutas_hortalizas_cantidad: 0,
    frutas_hortalizas_unidad: 'kg',
    carne_cantidad: 0,
    carne_unidad: 'kg',
    notas: '',
  });

  // Fetch delivery if editing
  const { data: deliveryData, isLoading: isLoadingDelivery } = trpc.entregas.getDeliveryById.useQuery(
    { id: deliveryId as string },
    { enabled: !!(isEdit && deliveryId) }
  );

  // Populate form when delivery data loads
  useEffect(() => {
    if (deliveryData?.data) {
      setFormData({
        entregas_batch_id: deliveryData.data.entregas_batch_id,
        familia_id: deliveryData.data.familia_id,
        fecha: deliveryData.data.fecha,
        persona_recibio: deliveryData.data.persona_recibio,
        frutas_hortalizas_cantidad: deliveryData.data.frutas_hortalizas_cantidad || 0,
        frutas_hortalizas_unidad: deliveryData.data.frutas_hortalizas_unidad || 'kg',
        carne_cantidad: deliveryData.data.carne_cantidad || 0,
        carne_unidad: deliveryData.data.carne_unidad || 'kg',
        notas: deliveryData.data.notas || '',
      });
    }
  }, [deliveryData?.data]);

  // Mutations
  const createMutation = trpc.entregas.createDelivery.useMutation();
  const updateMutation = trpc.entregas.updateDelivery.useMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (isEdit && deliveryId) {
        // Update
        await updateMutation.mutateAsync({
          id: deliveryId,
          updates: {
            persona_recibio: formData.persona_recibio,
            frutas_hortalizas_cantidad: formData.frutas_hortalizas_cantidad,
            frutas_hortalizas_unidad: formData.frutas_hortalizas_unidad,
            carne_cantidad: formData.carne_cantidad,
            carne_unidad: formData.carne_unidad,
            notas: formData.notas,
          },
        });
      } else {
        // Create
        await createMutation.mutateAsync({
          entregas_batch_id: formData.entregas_batch_id,
          familia_id: formData.familia_id,
          fecha: formData.fecha,
          persona_recibio: formData.persona_recibio,
          frutas_hortalizas_cantidad: formData.frutas_hortalizas_cantidad,
          frutas_hortalizas_unidad: formData.frutas_hortalizas_unidad,
          carne_cantidad: formData.carne_cantidad,
          carne_unidad: formData.carne_unidad,
          notas: formData.notas,
        });
      }

      // Navigate back to list
      navigate('/entregas');
    } catch (error) {
      console.error('Error saving delivery:', error);
    }
  };

  if (!user) {
    return <div className="p-4">Por favor inicia sesión</div>;
  }

  if (isLoadingDelivery) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-bold">
        {isEdit ? 'Editar Entrega' : 'Nueva Entrega'}
      </h1>

      <Card className="p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Batch ID and Familia ID */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Batch ID *</label>
              <Input
                type="text"
                placeholder="UUID del lote"
                value={formData.entregas_batch_id}
                onChange={(e) =>
                  setFormData({ ...formData, entregas_batch_id: e.target.value })
                }
                disabled={isEdit || false}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Familia ID *</label>
              <Input
                type="text"
                placeholder="UUID de familia"
                value={formData.familia_id}
                onChange={(e) =>
                  setFormData({ ...formData, familia_id: e.target.value })
                }
                disabled={isEdit || false}
                required
              />
            </div>
          </div>

          {/* Fecha and Persona */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Fecha *</label>
              <Input
                type="date"
                value={formData.fecha}
                onChange={(e) =>
                  setFormData({ ...formData, fecha: e.target.value })
                }
                disabled={isEdit || false}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Persona que recibió *</label>
              <Input
                type="text"
                placeholder="Nombre"
                value={formData.persona_recibio}
                onChange={(e) =>
                  setFormData({ ...formData, persona_recibio: e.target.value })
                }
                required
              />
            </div>
          </div>

          {/* Frutas/Hortalizas */}
          <div>
            <label className="block text-sm font-medium mb-2">Frutas y Hortalizas</label>
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="number"
                placeholder="Cantidad"
                value={formData.frutas_hortalizas_cantidad}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    frutas_hortalizas_cantidad: parseFloat(e.target.value) || 0,
                  })
                }
              />
              <Input
                type="text"
                placeholder="Unidad (kg, piezas, etc)"
                value={formData.frutas_hortalizas_unidad}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    frutas_hortalizas_unidad: e.target.value,
                  })
                }
              />
            </div>
          </div>

          {/* Carne */}
          <div>
            <label className="block text-sm font-medium mb-2">Carne</label>
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="number"
                placeholder="Cantidad"
                value={formData.carne_cantidad}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    carne_cantidad: parseFloat(e.target.value) || 0,
                  })
                }
              />
              <Input
                type="text"
                placeholder="Unidad (kg, piezas, etc)"
                value={formData.carne_unidad}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    carne_unidad: e.target.value,
                  })
                }
              />
            </div>
          </div>

          {/* Notas */}
          <div>
            <label className="block text-sm font-medium mb-1">Notas</label>
            <textarea
              placeholder="Notas adicionales"
              value={formData.notas}
              onChange={(e) =>
                setFormData({ ...formData, notas: e.target.value })
              }
              className="w-full p-2 border rounded-md"
              rows={3}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate('/entregas')}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending || updateMutation.isPending || false}
            >
              {createMutation.isPending || updateMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                'Guardar'
              )}
            </Button>
          </div>

          {/* Error message */}
          {(createMutation.error || updateMutation.error) && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-red-800 text-sm">
                Error: {(createMutation.error || updateMutation.error)?.message}
              </p>
            </div>
          )}
        </form>
      </Card>
    </div>
  );
}
