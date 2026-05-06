import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import { FAMILIA_DOCS_CONFIG } from "@/features/families/constants";
import { isAdultOrUnknown } from "@/features/families/utils/age";
import type { FamilyDocType } from "@shared/familyDocuments";
import { MemberDocSubcard } from "./MemberDocSubcard";

interface MembersDocsCardProps {
  familyId: string;
  titular: { id: string; nombre: string; apellidos: string | null; canal_llegada?: string | null; fecha_nacimiento?: string | null } | null;
  miembros: Array<Record<string, unknown>>;
  onUpload: (tipo: FamilyDocType, memberIndex: number) => void;
}

export function MembersDocsCard({ familyId, titular, miembros, onUpload }: MembersDocsCardProps) {
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

  const adultsOnly = allMembers.filter((m) => isAdultOrUnknown(m.fecha_nacimiento));

  if (adultsOnly.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-1.5">
            Documentos por miembro (≥14 años)
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" aria-label="Información sobre el estado de documentos" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs">
                El estado se actualiza automáticamente al cargar el documento. Para cambiarlo, carga o elimina el archivo.
              </TooltipContent>
            </Tooltip>
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Esta familia no tiene miembros mayores de 14 años — sólo se requieren los documentos de la familia.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-1.5">
          Documentos por miembro (≥14 años)
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" aria-label="Información sobre el estado de documentos" />
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-xs">
              El estado se actualiza automáticamente al cargar el documento. Para cambiarlo, carga o elimina el archivo.
            </TooltipContent>
          </Tooltip>
        </CardTitle>
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
