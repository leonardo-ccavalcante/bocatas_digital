/**
 * FamiliasEntregas — E-E6
 * Delivery day view: lists families scheduled for today's delivery
 * and allows recording individual deliveries.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Package,
  Search,
  CheckCircle2,
  Clock,
  LockKeyhole,
  Users,
  CalendarDays,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import BackLink from "@/components/layout/BackLink";
import { toast } from "sonner";

export default function FamiliasEntregas() {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("entregas");

  const today = new Date().toISOString().split("T")[0];

  // Get all active families for delivery
  const { data: families, isLoading } = trpc.families.getAll.useQuery(
    { estado: "activa" },
    { staleTime: 30_000 }
  );

  // Get today's deliveries to mark which families already received
  const { data: todayDeliveries } = trpc.entregas.getDeliveries.useQuery(
    { fechaFrom: today, fechaTo: today },
    { staleTime: 30_000 }
  );

  const createDelivery = trpc.entregas.createDelivery.useMutation({
    onSuccess: () => toast.success("Entrega registrada"),
    // Supabase SDK boundary — opaque join result
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (err: any) => toast.error(err.message),
  });

  const deliveredFamilyIds = new Set<string>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((todayDeliveries?.data as any[]) ?? []).map((d: any) => d.family_id)
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filteredFamilies = ((families as any[]) ?? []).filter((f: any) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      f.persons?.nombre?.toLowerCase().includes(q) ||
      f.persons?.apellidos?.toLowerCase().includes(q) ||
      String(f.familia_numero).includes(q)
    );
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pendingFamilies = filteredFamilies.filter((f: any) => !deliveredFamilyIds.has(f.id));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const deliveredFamilies = filteredFamilies.filter((f: any) => deliveredFamilyIds.has(f.id));

  const handleQuickDelivery = async (familyId: string) => {
    await createDelivery.mutateAsync({
      family_id: familyId,
      fecha_entrega: today,
      recogido_por: "Voluntario",
      es_autorizado: false,
    });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
      {/* Header */}
      <div>
        <BackLink label="Familias" href="/familias" className="mb-3" />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-display-2 flex items-center gap-2 text-foreground">
              <Package className="h-6 w-6 text-primary" aria-hidden="true" />
              Entregas del día
            </h1>
            <p className="mt-1 flex items-center gap-1 text-body-sm text-muted-foreground">
              <CalendarDays className="h-4 w-4" aria-hidden="true" />
              {new Date().toLocaleDateString("es-ES", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>
          </div>
          <div className="flex gap-2 text-sm">
            <Badge variant="outline" className="border-amber-300 text-amber-700">
              <Clock className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              {pendingFamilies.length} pendientes
            </Badge>
            <Badge variant="outline" className="border-green-300 text-green-700">
              <CheckCircle2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              {deliveredFamilies.length} entregadas
            </Badge>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full">
          <TabsTrigger value="entregas" className="flex-1">
            <Package className="h-4 w-4 mr-2" />
            Entregas
          </TabsTrigger>
          <TabsTrigger value="cierre" className="flex-1">
            <LockKeyhole className="h-4 w-4 mr-2" />
            Cerrar sesión
          </TabsTrigger>
        </TabsList>

        <TabsContent value="entregas" className="space-y-4 mt-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar familia…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground text-center py-8">Cargando familias…</p>
          ) : (
            <div className="space-y-2">
              {/* Pending deliveries */}
              {pendingFamilies.length > 0 && (
                <div>
                  <p className="text-eyebrow mb-2 text-muted-foreground">
                    Pendientes de entrega
                  </p>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {pendingFamilies.map((family: any) => (
                    <div key={family.id} className="bocatas-card mb-2 flex items-center gap-3 px-4 py-3">
                        <Users className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                        <div className="min-w-0 flex-1">
                          <p className="text-body-sm font-medium text-foreground truncate">
                            {family.persons?.nombre} {family.persons?.apellidos}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Familia #{family.familia_numero} · {family.num_miembros} miembro(s)
                          </p>
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <Link href={`/familias/${family.id}`}>
                            <Button size="sm" variant="outline" className="h-8 text-xs">
                              Ver
                            </Button>
                          </Link>
                          <Button
                            size="sm"
                            className="h-8 text-xs"
                            onClick={() => handleQuickDelivery(family.id)}
                            disabled={createDelivery.isPending}
                          >
                            <CheckCircle2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                            Entregar
                          </Button>
                        </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Delivered */}
              {deliveredFamilies.length > 0 && (
                <div>
                  <p className="text-eyebrow mb-2 text-muted-foreground">
                    Ya entregadas hoy
                  </p>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {deliveredFamilies.map((family: any) => (
                    <div key={family.id} className="bocatas-card mb-2 flex items-center gap-3 border-green-200 bg-green-50/30 px-4 py-3">
                        <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" aria-hidden="true" />
                        <div className="min-w-0 flex-1">
                          <p className="text-body-sm font-medium text-green-800 truncate">
                            {family.persons?.nombre} {family.persons?.apellidos}
                          </p>
                          <p className="text-xs text-green-700">
                            Familia #{family.familia_numero} · Entregada
                          </p>
                        </div>
                        <Link href={`/familias/${family.id}`}>
                          <Button size="sm" variant="ghost" className="h-8 text-xs">
                            Ver
                          </Button>
                        </Link>
                    </div>
                  ))}
                </div>
              )}

              {filteredFamilies.length === 0 && (
                <p className="py-8 text-center text-body-sm text-muted-foreground">
                  No hay familias activas registradas.
                </p>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="cierre" className="mt-4">
          <div className="space-y-4">
            <div className="bocatas-card p-5">
              <p className="text-eyebrow mb-3 text-muted-foreground">
                Resumen del día
              </p>
              <div className="grid grid-cols-2 gap-4 text-center">
                <div>
                  <p className="tabular-stat text-2xl font-bold text-primary">{deliveredFamilies.length}</p>
                  <p className="text-xs text-muted-foreground">Familias atendidas</p>
                </div>
                <div>
                  <p className="tabular-stat text-2xl font-bold text-amber-600">{pendingFamilies.length}</p>
                  <p className="text-xs text-muted-foreground">Sin recoger</p>
                </div>
              </div>
            </div>

            {/* Session close form — needs a program_id */}
            <p className="text-center text-xs text-muted-foreground">
              Selecciona el programa desde{" "}
              <Link href="/programas" className="underline text-primary">
                Programas
              </Link>{" "}
              para cerrar la sesión.
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
