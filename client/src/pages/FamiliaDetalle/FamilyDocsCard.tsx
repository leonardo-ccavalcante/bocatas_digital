import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import { useFamilyLevelDocuments } from "@/features/families/hooks/useFamilias";
import { FAMILIA_DOCS_CONFIG } from "@/features/families/constants";
import { DocumentChecklist } from "@/features/programs/components/DocumentChecklist";
import type { DocumentItem } from "@/features/programs/components/DocumentChecklist";
import type { FamilyDocType } from "@shared/familyDocuments";
import { getSignedDocUrl } from "@/features/families/utils/signedUrl";

interface FamilyDocsCardProps {
  familyId: string;
  onUpload: (tipo: FamilyDocType) => void;
}

export function FamilyDocsCard({ familyId, onUpload }: FamilyDocsCardProps) {
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
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-1.5">
          Documentación de la familia
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
      <CardContent className="space-y-3 pt-0">
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
