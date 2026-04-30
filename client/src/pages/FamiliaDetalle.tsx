import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { ArrowLeft, Users, FileText, Shield, Package, RotateCcw } from "lucide-react";
import { useFamiliaById, useDeliveries, useReactivateFamilia, useFamilyLevelDocuments, useMemberLevelDocuments } from "@/features/families/hooks/useFamilias";
import { FAMILIA_DOCS_CONFIG } from "@/features/families/constants";
import { DocumentChecklist } from "@/features/programs/components/DocumentChecklist";
import type { FamilyDocType } from "@shared/familyDocuments";
import { GufPanel } from "@/features/families/components/GufPanel";
import { SocialReportPanel } from "@/features/families/components/SocialReportPanel";
import { DeactivationForm } from "@/features/families/components/DeactivationForm";
import { MemberManagementModal } from "@/components/MemberManagementModal";
import { DocumentUploadModal } from "@/components/DocumentUploadModal";
import { DeliveryDocumentModal } from "@/components/DeliveryDocumentModal";

// ─── FamilyDocsCard ───────────────────────────────────────────────────────────

function FamilyDocsCard({
  familyId,
  onUpload,
}: {
  familyId: string;
  onUpload: (tipo: FamilyDocType) => void;
}) {
  const { data: uploaded = [], isLoading } = useFamilyLevelDocuments(familyId);
  const familyDocs = FAMILIA_DOCS_CONFIG.filter((d) => !d.perMember);
  const items = familyDocs.map((d) => {
    const row = uploaded.find((u) => u.documento_tipo === d.key);
    return {
      id: d.key,
      label: d.label,
      required: d.required,
      checked: !!row?.documento_url,
      documentUrl: row?.documento_url ?? null,
    };
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-sm">Documentación de la familia</CardTitle></CardHeader>
        <CardContent><Skeleton className="h-32" /></CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <DocumentChecklist
          title="Documentación de la familia"
          items={items}
          readOnly
        />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 pt-2">
          {familyDocs.map((d) => (
            <Button
              key={d.key}
              variant="outline"
              size="sm"
              onClick={() => onUpload(d.key as FamilyDocType)}
              className="justify-start"
            >
              {items.find((i) => i.id === d.key)?.checked ? "Actualizar" : "Cargar"}: {d.label}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Age helper ───────────────────────────────────────────────────────────────

function ageInYears(fecha_nacimiento?: string | null): number | null {
  if (!fecha_nacimiento) return null;
  const dob = new Date(fecha_nacimiento);
  if (isNaN(dob.getTime())) return null;
  const ageMs = Date.now() - dob.getTime();
  return Math.floor(ageMs / (365.25 * 24 * 3600 * 1000));
}

// ─── MemberDocSubcard ─────────────────────────────────────────────────────────

function MemberDocSubcard({
  familyId,
  member,
  memberDocs,
  onUpload,
}: {
  familyId: string;
  member: { member_index: number; nombre: string; apellidos: string | null; person_id: string | null; canal_llegada: string | null };
  memberDocs: Array<{ key: string; label: string; required: boolean }>;
  onUpload: (tipo: FamilyDocType, memberIndex: number) => void;
}) {
  const { data: uploaded = [] } = useMemberLevelDocuments(familyId, member.member_index);
  const items = memberDocs.map((d) => {
    const row = uploaded.find((u) => u.documento_tipo === d.key);
    return {
      id: d.key,
      label: d.label,
      required: d.required,
      checked: !!row?.documento_url,
      documentUrl: row?.documento_url ?? null,
    };
  });

  return (
    <div className="border rounded-lg p-3 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        {member.person_id ? (
          <Link href={`/personas/${member.person_id}`} className="font-medium text-sm hover:underline text-primary">
            {member.nombre} {member.apellidos ?? ""}
          </Link>
        ) : (
          <span className="font-medium text-sm">
            {member.nombre} {member.apellidos ?? ""}{" "}
            <span className="text-xs text-muted-foreground italic">(sin enlace a persona)</span>
          </span>
        )}
        {member.canal_llegada === "programa_familias" && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">alta vía familia</Badge>
        )}
      </div>
      <DocumentChecklist
        title=""
        items={items}
        readOnly
      />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {memberDocs.map((d) => (
          <Button
            key={d.key}
            variant="outline"
            size="sm"
            onClick={() => onUpload(d.key as FamilyDocType, member.member_index)}
            className="justify-start text-xs"
          >
            {items.find((i) => i.id === d.key)?.checked ? "Actualizar" : "Cargar"}: {d.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

// ─── MembersDocsCard ──────────────────────────────────────────────────────────

function MembersDocsCard({
  familyId,
  titular,
  miembros,
  onUpload,
}: {
  familyId: string;
  titular: { id: string; nombre: string; apellidos: string | null; canal_llegada?: string | null; fecha_nacimiento?: string | null } | null;
  miembros: Array<Record<string, unknown>>;
  onUpload: (tipo: FamilyDocType, memberIndex: number) => void;
}) {
  const memberDocs = FAMILIA_DOCS_CONFIG.filter((d) => d.perMember);

  const allMembers: Array<{
    member_index: number;
    nombre: string;
    apellidos: string | null;
    person_id: string | null;
    canal_llegada: string | null;
    fecha_nacimiento: string | null;
  }> = [];

  if (titular) {
    allMembers.push({
      member_index: 0,
      nombre: titular.nombre,
      apellidos: titular.apellidos,
      person_id: titular.id,
      canal_llegada: titular.canal_llegada ?? null,
      fecha_nacimiento: titular.fecha_nacimiento ?? null,
    });
  }
  miembros.forEach((m, i) => {
    const member = m as Record<string, unknown>;
    allMembers.push({
      member_index: i + 1,
      nombre: (member.nombre as string) ?? "",
      apellidos: (member.apellidos as string) ?? null,
      person_id: (member.person_id as string) ?? null,
      canal_llegada: (member.canal_llegada as string) ?? null,
      fecha_nacimiento: (member.fecha_nacimiento as string) ?? null,
    });
  });

  const adultsOnly = allMembers.filter((m) => {
    const age = ageInYears(m.fecha_nacimiento);
    return age === null || age >= 14;
  });

  if (adultsOnly.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-sm">Documentos por miembro (≥14 años)</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Esta familia no tiene miembros mayores de 14 años — sólo se requieren los documentos de la familia.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Documentos por miembro (≥14 años)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {adultsOnly.map((member) => (
          <MemberDocSubcard
            key={member.member_index}
            familyId={familyId}
            member={member}
            memberDocs={memberDocs}
            onUpload={onUpload}
          />
        ))}
      </CardContent>
    </Card>
  );
}

// ─── FamiliaDetalle ───────────────────────────────────────────────────────────

export default function FamiliaDetalle() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const [tab, setTab] = useState("info");
  const [memberModalOpen, setMemberModalOpen] = useState(false);
  const [docModalOpen, setDocModalOpen] = useState<{ tipo: FamilyDocType; memberIndex: number } | null>(null);
  const [deliveryDocModalOpen, setDeliveryDocModalOpen] = useState<string | null>(null);

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
          {/* Family-level checklist (auto-derived from real uploads) */}
          <FamilyDocsCard familyId={id!} onUpload={(tipo) => setDocModalOpen({ tipo, memberIndex: -1 })} />

          {/* Per-member section — auto-derived from real uploads */}
          <MembersDocsCard
            familyId={id!}
            titular={titular ? {
              ...titular,
              canal_llegada: (titular as { canal_llegada?: string | null }).canal_llegada ?? null,
            } : null}
            miembros={miembros as Array<Record<string, unknown>>}
            onUpload={(tipo, memberIndex) => setDocModalOpen({ tipo, memberIndex })}
          />

          {/* Informe social — date-tracking workflow (legacy path, kept) */}
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
        <TabsContent value="entregas" className="mt-4 space-y-4">
          {/* Upload Entregas Button */}
          <Button
            onClick={() => setDeliveryDocModalOpen('upload')}
            className="w-full sm:w-auto"
          >
            <Package className="mr-2 h-4 w-4" />
            Subir Documento de Entregas
          </Button>

          {deliveries && deliveries.length > 0 ? (
            <div className="space-y-2">
              {deliveries.map((d) => (
                <Card key={d.id}>
                  <CardContent className="space-y-3 py-3 px-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">{new Date(d.fecha_entrega).toLocaleDateString("es-ES")}</p>
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
                    </div>

                    {/* Delivery Document Button */}
                    <div className="flex justify-end pt-2 border-t">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setDeliveryDocModalOpen(d.id)}
                      >
                        Documento de Entrega
                      </Button>
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
          documentoTipo={docModalOpen.tipo}
          memberIndex={docModalOpen.memberIndex}
          open={!!docModalOpen}
          onOpenChange={(open) => !open && setDocModalOpen(null)}
        />
      )}

      {/* Delivery Document Modal */}
      {deliveryDocModalOpen && (
        <DeliveryDocumentModal
          familyId={id!}
          deliveryId={deliveryDocModalOpen}
          deliveryDate={deliveries?.find((d) => d.id === deliveryDocModalOpen)?.fecha_entrega || new Date().toISOString()}
          open={!!deliveryDocModalOpen}
          onOpenChange={(open) => !open && setDeliveryDocModalOpen(null)}
        />
      )}
    </div>
  );
}
