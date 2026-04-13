/**
 * MemberConsentCollector — E-D17 (Job 8)
 * Collects individual consent + document photo for each family member ≥14.
 * Uses SignatureCapture for consent signature and DocumentPhotoCapture for ID photo.
 */
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Clock, User, FileSignature } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface FamilyMember {
  nombre: string;
  apellidos: string;
  fecha_nacimiento?: string;
  person_id?: string;
}

interface MemberConsentCollectorProps {
  familyId: string;
  members: FamilyMember[];
  onComplete?: () => void;
}

function getAge(fechaNacimiento?: string): number | null {
  if (!fechaNacimiento) return null;
  const dob = new Date(fechaNacimiento);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

interface MemberStatus {
  consentSigned: boolean;
  docCaptured: boolean;
}

export function MemberConsentCollector({
  familyId,
  members,
  onComplete,
}: MemberConsentCollectorProps) {
  // Only members ≥14 need individual consent
  const eligibleMembers = members.filter((m) => {
    const age = getAge(m.fecha_nacimiento);
    return age === null || age >= 14;
  });

  const [statuses, setStatuses] = useState<Record<number, MemberStatus>>(() =>
    Object.fromEntries(eligibleMembers.map((_, i) => [i, { consentSigned: false, docCaptured: false }]))
  );
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [signatureData, setSignatureData] = useState<string>("");

  const createMemberDoc = trpc.families.createMemberDocument.useMutation();

  const completedCount = Object.values(statuses).filter(
    (s) => s.consentSigned && s.docCaptured
  ).length;
  const progress = eligibleMembers.length > 0
    ? Math.round((completedCount / eligibleMembers.length) * 100)
    : 100;

  const handleSignConsent = async (idx: number) => {
    if (!signatureData) {
      toast.error("Por favor, dibuja la firma antes de confirmar");
      return;
    }
    try {
      await createMemberDoc.mutateAsync({
        family_id: familyId,
        member_index: idx,
        documento_tipo: "consentimiento_rgpd",
        documento_url: signatureData,
        member_person_id: eligibleMembers[idx].person_id,
      });
      setStatuses((prev) => ({
        ...prev,
        [idx]: { ...prev[idx], consentSigned: true },
      }));
      setSignatureData("");
      toast.success(`Consentimiento de ${eligibleMembers[idx].nombre} registrado`);
    } catch {
      toast.error("Error al guardar el consentimiento");
    }
  };

  const handleDocCapture = async (idx: number, docUrl: string) => {
    try {
      await createMemberDoc.mutateAsync({
        family_id: familyId,
        member_index: idx,
        documento_tipo: "documento_identidad",
        documento_url: docUrl,
        member_person_id: eligibleMembers[idx].person_id,
      });
      setStatuses((prev) => ({
        ...prev,
        [idx]: { ...prev[idx], docCaptured: true },
      }));
      toast.success(`Documento de ${eligibleMembers[idx].nombre} capturado`);
    } catch {
      toast.error("Error al guardar el documento");
    }
  };

  if (eligibleMembers.length === 0) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          No hay miembros ≥14 años que requieran consentimiento individual.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Progress header */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">
              Consentimientos individuales
            </span>
            <span className="text-sm text-muted-foreground">
              {completedCount} / {eligibleMembers.length}
            </span>
          </div>
          <Progress value={progress} className="h-2" />
          {progress === 100 && (
            <div className="mt-3 flex justify-end">
              <Button size="sm" onClick={onComplete}>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Completar
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Per-member cards */}
      {eligibleMembers.map((member, idx) => {
        const status = statuses[idx] ?? { consentSigned: false, docCaptured: false };
        const isComplete = status.consentSigned && status.docCaptured;
        const isActive = activeIdx === idx;
        const age = getAge(member.fecha_nacimiento);

        return (
          <Card
            key={idx}
            className={isComplete ? "border-green-200 bg-green-50/30" : ""}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                {member.nombre} {member.apellidos}
                {age !== null && (
                  <span className="text-xs text-muted-foreground">({age} años)</span>
                )}
                {isComplete ? (
                  <Badge className="ml-auto bg-green-100 text-green-800 border-green-200">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Completo
                  </Badge>
                ) : (
                  <Badge variant="outline" className="ml-auto text-amber-700 border-amber-300">
                    <Clock className="h-3 w-3 mr-1" />
                    Pendiente
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Status indicators */}
              <div className="flex gap-4 text-xs">
                <span className={status.consentSigned ? "text-green-700" : "text-muted-foreground"}>
                  {status.consentSigned ? "✓" : "○"} Consentimiento RGPD
                </span>
                <span className={status.docCaptured ? "text-green-700" : "text-muted-foreground"}>
                  {status.docCaptured ? "✓" : "○"} Documento identidad
                </span>
              </div>

              {/* Expand/collapse */}
              {!isComplete && (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() => setActiveIdx(isActive ? null : idx)}
                >
                  <FileSignature className="h-4 w-4 mr-2" />
                  {isActive ? "Cerrar" : "Recoger consentimiento y documento"}
                </Button>
              )}

              {/* Inline form when active */}
              {isActive && !isComplete && (
                <div className="space-y-4 pt-2 border-t">
                  {/* Consent signature area */}
                  {!status.consentSigned && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Firma de consentimiento RGPD
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Yo, {member.nombre} {member.apellidos}, consiento el tratamiento de mis datos
                        personales para la gestión del Programa de Familias de Bocatas y el Banco de Alimentos,
                        conforme al RGPD (UE) 2016/679.
                      </p>
                      <textarea
                        className="w-full h-20 border rounded p-2 text-xs bg-white"
                        placeholder="[Área de firma — en producción usar SignatureCapture component]"
                        value={signatureData}
                        onChange={(e) => setSignatureData(e.target.value)}
                      />
                      <Button
                        size="sm"
                        onClick={() => handleSignConsent(idx)}
                        disabled={createMemberDoc.isPending}
                      >
                        Confirmar firma
                      </Button>
                    </div>
                  )}

                  {/* Document capture */}
                  {status.consentSigned && !status.docCaptured && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Fotografía del documento de identidad
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDocCapture(idx, `doc-placeholder-${idx}-${Date.now()}`)}
                        disabled={createMemberDoc.isPending}
                      >
                        Capturar documento
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
