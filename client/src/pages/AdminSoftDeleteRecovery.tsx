import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { SoftDeleteRecoveryTable } from "@/components/SoftDeleteRecoveryTable";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { AlertCircle, RotateCcw } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function AdminSoftDeleteRecovery() {
  const [familiesPage, setFamiliesPage] = useState(0);
  const [personsPage, setPersonsPage] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");

  const deletedFamiliesQuery = trpc.admin.softDelete.listDeletedFamilies.useQuery({
    limit: 20,
    offset: familiesPage * 20,
    search: searchQuery,
  });

  const deletedPersonsQuery = trpc.admin.softDelete.listDeletedPersons.useQuery({
    limit: 20,
    offset: personsPage * 20,
  });

  const restoreFamilyMutation = trpc.admin.softDelete.restoreFamily.useMutation({
    onSuccess: () => {
      alert("Familia restaurada correctamente");
      deletedFamiliesQuery.refetch();
    },
    onError: (error) => {
      alert(`Error: ${error.message}`);
    },
  });

  const restorePersonMutation = trpc.admin.softDelete.restorePerson.useMutation({
    onSuccess: () => {
      alert("Persona restaurada correctamente");
      deletedPersonsQuery.refetch();
    },
    onError: (error) => {
      alert(`Error: ${error.message}`);
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Recuperación de Registros Eliminados</h1>
        <p className="text-muted-foreground mt-2">
          Ver y restaurar registros que han sido eliminados (soft-delete)
        </p>
      </div>

      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Los registros eliminados se mantienen en la base de datos para auditoría. Puede restaurarlos aquí.
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="families" className="w-full">
        <TabsList>
          <TabsTrigger value="families">
            Familias ({deletedFamiliesQuery.data?.total || 0})
          </TabsTrigger>
          <TabsTrigger value="persons">
            Personas ({deletedPersonsQuery.data?.total || 0})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="families" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Familias Eliminadas</CardTitle>
              <CardDescription>
                Buscar y restaurar familias eliminadas
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                placeholder="Buscar por número de familia..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setFamiliesPage(0);
                }}
              />

              <SoftDeleteRecoveryTable
                items={deletedFamiliesQuery.data?.items || []}
                type="families"
                onRestore={async (id) => {
                  await restoreFamilyMutation.mutateAsync({ familyId: id });
                }}
                isLoading={deletedFamiliesQuery.isLoading}
              />

              <div className="flex justify-between items-center">
                <p className="text-sm text-muted-foreground">
                  Página {familiesPage + 1} de{" "}
                  {Math.ceil((deletedFamiliesQuery.data?.total || 0) / 20)}
                </p>
                <div className="space-x-2">
                  <Button
                    variant="outline"
                    onClick={() => setFamiliesPage((p) => Math.max(0, p - 1))}
                    disabled={familiesPage === 0}
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setFamiliesPage((p) => p + 1)}
                    disabled={
                      familiesPage >=
                      Math.ceil((deletedFamiliesQuery.data?.total || 0) / 20) -
                        1
                    }
                  >
                    Siguiente
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="persons" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Personas Eliminadas</CardTitle>
              <CardDescription>
                Ver y restaurar personas eliminadas
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <SoftDeleteRecoveryTable
                items={deletedPersonsQuery.data?.items || []}
                type="persons"
                onRestore={async (id) => {
                  await restorePersonMutation.mutateAsync({ personId: id });
                }}
                isLoading={deletedPersonsQuery.isLoading}
              />

              <div className="flex justify-between items-center">
                <p className="text-sm text-muted-foreground">
                  Página {personsPage + 1} de{" "}
                  {Math.ceil((deletedPersonsQuery.data?.total || 0) / 20)}
                </p>
                <div className="space-x-2">
                  <Button
                    variant="outline"
                    onClick={() => setPersonsPage((p) => Math.max(0, p - 1))}
                    disabled={personsPage === 0}
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setPersonsPage((p) => p + 1)}
                    disabled={
                      personsPage >=
                      Math.ceil((deletedPersonsQuery.data?.total || 0) / 20) -
                        1
                    }
                  >
                    Siguiente
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
