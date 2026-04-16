import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft, Users, FileText, Shield, Package, RotateCcw } from "lucide-react";
import { useFamiliaById, useDeliveries, useReactivateFamilia, useUpdateFamiliaDocField } from "@/features/families/hooks/useFamilias";
import { GufPanel } from "@/features/families/components/GufPanel";
import { SocialReportPanel } from "@/features/families/components/SocialReportPanel";
import { DeactivationForm } from "@/features/families/components/DeactivationForm";
import { MemberManagementModal } from "@/components/MemberManagementModal";
import { DocumentUploadModal } from "@/components/DocumentUploadModal";

function DocChecklistItem({ label, checked, familyId, field }: {
  label: string;
  checked: boolean;
  familyId: string;
  field: "docs_identidad" | "padron_recibido" | "justificante_recibido" | "consent_bocatas" | "consent_banco_alimentos";
}) {
  const updateDoc = useUpdateFamiliaDocField();
  return (
    <div className="flex items-center justify-between py-2">
      <Label className="text-sm">{label}</Label>
      <Switch
        checked={checked}
        onCheckedChange={(v) => {
          updateDoc.mutate({ id: familyId, field, value: v }, {
            onSuccess: () => toast.success("Actualizado"),
            onError: () => toast.error("Error al actualizar"),
          });
        }}
      />
    </div>
  );
}

export default function FamiliaDetalle() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const [tab, setTab] = useState("info");
  const [memberModalOpen, setMemberModalOpen] = useState(false);
  const [docModalOpen, setDocModalOpen] = useState<string | null>(null);

  const { data: family, isLoading } = useFamiliaById(id ?? "");
  const { data: deliveries } = useDeliveries(id ?? "");
  const reactivate = useReactivateFamilia();

  if (isLoading) {
    return (
      <div className="container py-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!family) {
    return (
      <div className="container py-6">
        <p className="text-muted-foreground">Familia no encontrada</p>
        <Link href="/familias"><Button variant="outline" className="mt-4">Volver</Button></Link>
      </div>
    );
  }

  const titular = family.persons as { id: string; nombre: string; apellidos: string | null; telefono: string | null; fecha_nacimiento: string | null } | null;
  const miembros = (family.miembros as unknown[]) ?? [];

  return (
    <div className="container py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/familias">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" /> Familias
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">Familia #{family.familia_numero}</h1>
            <Badge variant={family.estado === "activa" ? "default" : "destructive"}>
              {family.estado}
            </Badge>
          </div>
          {titular && (
            <p className="text-sm text-muted-foreground">
              Titular:{" "}
              <Link href={`/personas/${titular.id}`} className="hover:underline text-primary">
                {titular.nombre} {titular.apellidos ?? ""}
              </Link>
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {family.estado === "activa" ? (
            <DeactivationForm
              familyId={id!}
              familyNumber={family.familia_numero}
              onSuccess={() => navigate("/familias")}
            />
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => reactivate.mutate({ id: id! }, {
                onSuccess: () => toast.success("Familia reactivada"),
                onError: () => toast.error("Error al reactivar"),
              })}
              disabled={reactivate.isPending}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Reactivar
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="info"><Users className="mr-2 h-4 w-4" />Información</TabsTrigger>
          <TabsTrigger value="docs"><FileText className="mr-2 h-4 w-4" />Documentación</TabsTrigger>
          <TabsTrigger value="guf"><Shield className="mr-2 h-4 w-4" />GUF</TabsTrigger>
          <TabsTrigger value="entregas"><Package className="mr-2 h-4 w-4" />Entregas</TabsTrigger>
        </TabsList>

        {/* Tab: Información */}
        <TabsContent value="info" className="space-y-4 mt-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-sm">Titular</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                {titular ? (
                  <>
                    <p><span className="text-muted-foreground">Nombre:</span> {titular.nombre} {titular.apellidos ?? ""}</p>
                    {titular.telefono && <p><span className="text-muted-foreground">Teléfono:</span> {titular.telefono}</p>}
                    {titular.fecha_nacimiento && <p><span className="text-muted-foreground">Nacimiento:</span> {titular.fecha_nacimiento}</p>}
                    <Link href={`/personas/${titular.id}`}>
                      <Button variant="link" size="sm" className="px-0 h-auto">Ver ficha completa →</Button>
                    </Link>
                  </>
                ) : (
                  <p className="text-muted-foreground">Sin datos del titular</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-sm">Composición del hogar</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Adultos:</span>
                  <span>{family.num_adultos ?? 0}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Menores:</span>
                  <span>{family.num_menores_18 ?? 0}</span>
                </div>
                <div className="flex justify-between text-sm font-medium">
                  <span>Total miembros:</span>
                  <span>{(family.num_adultos ?? 0) + (family.num_menores_18 ?? 0)}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Members Management */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm">Miembros de la Familia</CardTitle>
              <Button
                size="sm"
                onClick={() => setMemberModalOpen(true)}
              >
                Gestionar Miembros
              </Button>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {miembros.length > 0 ? (
                <p>{miembros.length} miembro(s) registrado(s) en el sistema antiguo</p>
              ) : (
                <p>No hay miembros registrados. Usa el botón arriba para agregar miembros.</p>
              )}
            </CardContent>
          </Card>

          {/* Authorized person */}
          {family.autorizado && (
            <Card>
              <CardHeader><CardTitle className="text-sm">Persona autorizada</CardTitle></CardHeader>
              <CardContent className="text-sm">
                <p>{family.persona_recoge ?? "No especificada"}</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Tab: Documentación */}
        <TabsContent value="docs" className="space-y-4 mt-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Checklist de documentación</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <DocChecklistItem label="Documentos de identidad" checked={!!family.docs_identidad} familyId={id!} field="docs_identidad" />
              <DocChecklistItem label="Padrón municipal" checked={!!family.padron_recibido} familyId={id!} field="padron_recibido" />
              <DocChecklistItem label="Justificante de ingresos" checked={!!family.justificante_recibido} familyId={id!} field="justificante_recibido" />
              <DocChecklistItem label="Consentimiento Bocatas" checked={!!family.consent_bocatas} familyId={id!} field="consent_bocatas" />
              <DocChecklistItem label="Consentimiento Banco de Alimentos" checked={!!family.consent_banco_alimentos} familyId={id!} field="consent_banco_alimentos" />
            </CardContent>
          </Card>
          
          {/* Document Upload Section */}
          <Card>
            <CardHeader><CardTitle className="text-sm">Carga de Documentos</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {["DNI", "Pasaporte", "Comprobante domicilio"].map((docType) => (
                  <Button
                    key={docType}
                    variant="outline"
                    size="sm"
                    onClick={() => setDocModalOpen(docType)}
                    className="justify-start"
                  >
                    {docType}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
          <SocialReportPanel
            familyId={id!}
            informeSocial={!!family.informe_social}
            informeSocialFecha={family.informe_social_fecha ?? null}
          />
        </TabsContent>

        {/* Tab: GUF */}
        <TabsContent value="guf" className="mt-4">
          <GufPanel
            familyId={id!}
            altaEnGuf={!!family.alta_en_guf}
            fechaAltaGuf={family.fecha_alta_guf ?? null}
            gufCutoffDay={family.guf_cutoff_day ?? null}
            gufVerifiedAt={family.guf_verified_at ?? null}
          />
        </TabsContent>

        {/* Tab: Entregas */}
        <TabsContent value="entregas" className="mt-4">
          {deliveries && deliveries.length > 0 ? (
            <div className="space-y-2">
              {deliveries.map((d) => (
                <Card key={d.id}>
                  <CardContent className="flex items-center justify-between py-3 px-4 text-sm">
                    <div>
                      <p className="font-medium">{new Date(d.fecha_entrega).toLocaleDateString("es-ES")}</p>
                      <p className="text-xs text-muted-foreground">
                        Recogido por: {d.recogido_por}
                        {d.es_autorizado ? " (autorizado)" : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">
                        F+H: {d.kg_frutas_hortalizas}kg · Carne: {d.kg_carne}kg
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>Sin entregas registradas</p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Member Management Modal */}
      <MemberManagementModal
        familiaId={id!}
        open={memberModalOpen}
        onOpenChange={setMemberModalOpen}
      />

      {/* Document Upload Modal */}
      {docModalOpen && (
        <DocumentUploadModal
          familyId={id!}
          documentType={docModalOpen}
          open={!!docModalOpen}
          onOpenChange={(open) => !open && setDocModalOpen(null)}
        />
      )}
    </div>
  );
}
