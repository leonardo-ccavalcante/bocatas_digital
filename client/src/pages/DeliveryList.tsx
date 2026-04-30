import { useState } from 'react';
import { useAuth } from '@/_core/hooks/useAuth';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Link } from 'wouter';
import { Plus, Loader2 } from 'lucide-react';

export default function DeliveryList() {
  const { user } = useAuth();
  const [limit] = useState(50);
  const [offset, setOffset] = useState(0);
  const [familiaId, setFamiliaId] = useState<string>('');
  const [fechaFrom, setFechaFrom] = useState<string>('');
  const [fechaTo, setFechaTo] = useState<string>('');

  // Query deliveries
  const { data: deliveriesResponse, isLoading, error } = trpc.entregas.getDeliveries.useQuery({
    limit,
    offset,
    familiaId: familiaId || undefined,
    fechaFrom: fechaFrom || undefined,
    fechaTo: fechaTo || undefined,
  });

  const deliveries = deliveriesResponse?.data || [];
  const total = deliveriesResponse?.total || 0;

  if (!user) {
    return <div className="p-4">Por favor inicia sesión</div>;
  }

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Entregas</h1>
        <Link href="/entregas/nueva">
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            Nueva Entrega
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <Card className="p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="text-sm font-medium">Familia ID</label>
            <Input
              placeholder="UUID de familia"
              value={familiaId}
              onChange={(e) => {
                setFamiliaId(e.target.value);
                setOffset(0);
              }}
            />
          </div>
          <div>
            <label className="text-sm font-medium">Desde</label>
            <Input
              type="date"
              value={fechaFrom}
              onChange={(e) => {
                setFechaFrom(e.target.value);
                setOffset(0);
              }}
            />
          </div>
          <div>
            <label className="text-sm font-medium">Hasta</label>
            <Input
              type="date"
              value={fechaTo}
              onChange={(e) => {
                setFechaTo(e.target.value);
                setOffset(0);
              }}
            />
          </div>
          <div className="flex items-end">
            <Button
              variant="outline"
              onClick={() => {
                setFamiliaId('');
                setFechaFrom('');
                setFechaTo('');
                setOffset(0);
              }}
              className="w-full"
            >
              Limpiar
            </Button>
          </div>
        </div>
      </Card>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      )}

      {/* Error State */}
      {error && (
        <Card className="p-4 bg-red-50 border-red-200">
          <p className="text-red-800">Error al cargar entregas: {error.message}</p>
        </Card>
      )}

      {/* Empty State */}
      {!isLoading && deliveries.length === 0 && (
        <Card className="p-8 text-center">
          <p className="text-gray-500">No hay entregas registradas</p>
        </Card>
      )}

      {/* Table */}
      {!isLoading && deliveries.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b">
                <th className="text-left p-3 font-semibold">Familia</th>
                <th className="text-left p-3 font-semibold">Fecha</th>
                <th className="text-left p-3 font-semibold">Recibió</th>
                <th className="text-left p-3 font-semibold">Frutas/Hortalizas</th>
                <th className="text-left p-3 font-semibold">Carne</th>
                <th className="text-left p-3 font-semibold">Notas</th>
                <th className="text-left p-3 font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((delivery: any) => (
                <tr key={delivery.id} className="border-b hover:bg-gray-50">
                  <td className="p-3 text-sm">{delivery.familia_id}</td>
                  <td className="p-3 text-sm">{delivery.fecha}</td>
                  <td className="p-3 text-sm">{delivery.persona_recibio}</td>
                  <td className="p-3 text-sm">
                    {delivery.frutas_hortalizas_cantidad} {delivery.frutas_hortalizas_unidad}
                  </td>
                  <td className="p-3 text-sm">
                    {delivery.carne_cantidad} {delivery.carne_unidad}
                  </td>
                  <td className="p-3 text-sm truncate max-w-xs">{delivery.notas}</td>
                  <td className="p-3 text-sm">
                    <Link href={`/entregas/${delivery.id}`}>
                      <Button variant="outline" size="sm">
                        Ver
                      </Button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {!isLoading && total > limit && (
        <div className="flex items-center justify-between p-4">
          <p className="text-sm text-gray-600">
            Mostrando {offset + 1}-{Math.min(offset + limit, total)} de {total}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - limit))}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              disabled={offset + limit >= total}
              onClick={() => setOffset(offset + limit)}
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
