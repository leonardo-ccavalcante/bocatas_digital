import { useState } from "react";
import { useParams, useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Users, FileText, Shield, Package, RotateCcw } from "lucide-react";
import {
  useFamiliaById,
  useDeliveries,
  useReactivateFamilia,
} from "@/features/families/hooks/useFamilias";
import type { FamilyDocType } from "@shared/familyDocuments";
import { GufPanel } from "@/features/families/components/GufPanel";
import { SocialReportPanel } from "@/features/families/components/SocialReportPanel";
import { DeactivationForm } from "@/features/families/components/DeactivationForm";
import { MemberManagementModal } from "@/components/MemberManagementModal";
import { DocumentUploadModal } from "@/components/DocumentUploadModal";
import { DeliveryDocumentModal } from "@/components/DeliveryDocumentModal";
import { FamilyDocsCard } from "./FamilyDocsCard";
import { MembersDocsCard } from "./MembersDocsCard";
import { FamiliaHeader } from "./FamiliaHeader";
import { InfoTab } from "./InfoTab";
import { EntregasTab } from "./EntregasTab";
import type { Titular } from "./types";

export default function FamiliaDetalle() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const [tab, setTab] = useState("info");
  const [memberModalOpen, setMemberModalOpen] = useState(false);
  const [docModalOpen, setDocModalOpen] = useState<{
    tipo: FamilyDocType;
    memberIndex: number;
  } | null>(null);
  const [deliveryDocModalOpen, setDeliveryDocModalOpen] = useState<string | null>(
    null,
  );

  const { data: family, isLoading } = useFamiliaById(id ?? "");
  const { data: deliveries } = useDeliveries(id ?? "");
  const reactivate = useReactivateFamilia();

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-4 px-4 py-6 sm:px-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!family) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-8">
        <p className="text-body-sm text-muted-foreground">
          Familia no encontrada
        </p>
        <Link href="/familias">
          <Button variant="outline" className="mt-4">
            Volver
          </Button>
        </Link>
      </div>
    );
  }

  const titular = family.persons as Titular | null;
  const miembros = (family.miembros as Record<string, unknown>[]) ?? [];
  const numAdultos = family.num_adultos ?? 0;
  const numMenores = family.num_menores_18 ?? 0;

  const actions =
    family.estado === "activa" ? (
      <DeactivationForm
        familyId={id!}
        familyNumber={family.familia_numero}
        onSuccess={() => navigate("/familias")}
      />
    ) : (
      <Button
        variant="outline"
        size="sm"
        onClick={() =>
          reactivate.mutate(
            { id: id! },
            {
              onSuccess: () => toast.success("Familia reactivada"),
              onError: () => toast.error("Error al reactivar"),
            },
          )
        }
        disabled={reactivate.isPending}
      >
        <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
        Reactivar
      </Button>
    );

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <FamiliaHeader
        familiaNumero={family.familia_numero}
        estado={family.estado}
        titular={titular}
        numAdultos={numAdultos}
        numMenores={numMenores}
        altaEnGuf={!!family.alta_en_guf}
        fechaAltaGuf={family.fecha_alta_guf ?? null}
        personaRecoge={family.persona_recoge ?? null}
        autorizado={family.autorizado ?? null}
        informeSocial={!!family.informe_social}
        actions={actions}
      />

      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-8">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="info">
              <Users className="mr-2 h-4 w-4" aria-hidden="true" />
              Información
            </TabsTrigger>
            <TabsTrigger value="docs">
              <FileText className="mr-2 h-4 w-4" aria-hidden="true" />
              Documentación
            </TabsTrigger>
            <TabsTrigger value="guf">
              <Shield className="mr-2 h-4 w-4" aria-hidden="true" />
              GUF
            </TabsTrigger>
            <TabsTrigger value="entregas">
              <Package className="mr-2 h-4 w-4" aria-hidden="true" />
              Entregas
            </TabsTrigger>
          </TabsList>

          {/* Información */}
          <TabsContent value="info" className="mt-5">
            <InfoTab
              titular={titular}
              numAdultos={numAdultos}
              numMenores={numMenores}
              miembros={miembros}
              autorizado={!!family.autorizado}
              personaRecoge={family.persona_recoge ?? null}
              onManageMembers={() => setMemberModalOpen(true)}
            />
          </TabsContent>

          {/* Documentación */}
          <TabsContent value="docs" className="mt-5 space-y-4">
            <FamilyDocsCard
              familyId={id!}
              onUpload={(tipo) => setDocModalOpen({ tipo, memberIndex: -1 })}
            />
            <MembersDocsCard
              familyId={id!}
              titular={
                titular
                  ? {
                      ...titular,
                      canal_llegada: titular.canal_llegada ?? null,
                    }
                  : null
              }
              miembros={miembros as Array<Record<string, unknown>>}
              onUpload={(tipo, memberIndex) =>
                setDocModalOpen({ tipo, memberIndex })
              }
            />
            <SocialReportPanel
              familyId={id!}
              informeSocial={!!family.informe_social}
              informeSocialFecha={family.informe_social_fecha ?? null}
            />
          </TabsContent>

          {/* GUF */}
          <TabsContent value="guf" className="mt-5">
            <GufPanel
              familyId={id!}
              altaEnGuf={!!family.alta_en_guf}
              fechaAltaGuf={family.fecha_alta_guf ?? null}
              gufCutoffDay={family.guf_cutoff_day ?? null}
              gufVerifiedAt={family.guf_verified_at ?? null}
            />
          </TabsContent>

          {/* Entregas */}
          <TabsContent value="entregas" className="mt-5">
            <EntregasTab
              deliveries={deliveries?.data ?? undefined}
              onUploadDelivery={() => setDeliveryDocModalOpen("upload")}
              onDeliveryDoc={(deliveryId) => setDeliveryDocModalOpen(deliveryId)}
            />
          </TabsContent>
        </Tabs>
      </main>

      <MemberManagementModal
        familiaId={id!}
        open={memberModalOpen}
        onOpenChange={setMemberModalOpen}
        miembros={miembros}
      />

      {docModalOpen && (
        <DocumentUploadModal
          familyId={id!}
          documentoTipo={docModalOpen.tipo}
          memberIndex={docModalOpen.memberIndex}
          open={!!docModalOpen}
          onOpenChange={(open) => !open && setDocModalOpen(null)}
        />
      )}

      {deliveryDocModalOpen && (
        <DeliveryDocumentModal
          familyId={id!}
          deliveryId={deliveryDocModalOpen}
          deliveryDate={
            deliveries?.data?.find((d) => d.id === deliveryDocModalOpen)
              ?.fecha_entrega || new Date().toISOString()
          }
          open={!!deliveryDocModalOpen}
          onOpenChange={(open) => !open && setDeliveryDocModalOpen(null)}
        />
      )}
    </div>
  );
}
