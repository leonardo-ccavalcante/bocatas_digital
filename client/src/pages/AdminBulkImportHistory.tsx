import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { BulkImportHistoryTable } from "@/components/BulkImportHistoryTable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";

export default function AdminBulkImportHistory() {
  const [history, setHistory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Query import history
  const { data: historyData, isLoading: isLoadingHistory } =
    trpc.admin.getBulkImportHistory.useQuery(
      { limit: 50, offset: 0 },
      { enabled: true }
    );

  useEffect(() => {
    if (historyData) {
      setHistory(historyData);
      setIsLoading(false);
    }
  }, [historyData]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Historial de Importaciones</h1>
          <p className="text-gray-600">
            Registro de todas las importaciones CSV realizadas
          </p>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Total Importaciones
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{history.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Completadas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {history.filter((h) => h.status === "completed").length}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Fallidas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {history.filter((h) => h.status === "failed").length}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Pendientes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">
                {history.filter((h) => h.status === "pending").length}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* History Table */}
        <Card>
          <CardHeader>
            <CardTitle>Detalles de Importaciones</CardTitle>
          </CardHeader>
          <CardContent>
            <BulkImportHistoryTable
              history={history}
              isLoading={isLoading || isLoadingHistory}
            />
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
