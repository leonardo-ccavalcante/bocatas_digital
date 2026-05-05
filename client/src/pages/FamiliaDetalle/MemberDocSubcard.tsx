import { Link } from "wouter";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useMemberLevelDocuments } from "@/features/families/hooks/useFamilias";
import { DocumentChecklist } from "@/features/programs/components/DocumentChecklist";
import type { DocumentItem } from "@/features/programs/components/DocumentChecklist";
import type { FamilyDocType } from "@shared/familyDocuments";
import { getSignedDocUrl } from "@/features/families/utils/signedUrl";

interface MemberDocSubcardProps {
  familyId: string;
  member: { member_index: number; nombre: string; apellidos: string | null; person_id: string | null; canal_llegada: string | null };
  memberDocs: Array<{ key: string; label: string; required: boolean }>;
  onUpload: (tipo: FamilyDocType, memberIndex: number) => void;
}

export function MemberDocSubcard({
  familyId,
  member,
  memberDocs,
  onUpload,
}: MemberDocSubcardProps) {
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
        onViewDocument={async (item: DocumentItem) => {
          const url = await getSignedDocUrl(item.documentUrl);
          if (url) window.open(url, "_blank", "noopener,noreferrer");
          else toast.error("No se pudo generar el enlace");
        }}
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
