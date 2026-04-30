import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { FileText, AlertCircle, CheckCircle, Clock, Upload } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { DocumentUploadModal } from "@/components/DocumentUploadModal";
import { useFamilyLevelDocuments } from "@/features/families/hooks/useFamilias";

interface SocialReportPanelProps {
  familyId: string;
  informeSocial: boolean;
  informeSocialFecha: string | null;
}

function getReportStatus(hasReport: boolean, fecha: string | null) {
  if (!hasReport) return { label: "Pendiente", variant: "destructive" as const, icon: AlertCircle };
  if (!fecha) return { label: "Sin fecha", variant: "secondary" as const, icon: Clock };
  const reportDate = new Date(fecha);
  const now = new Date();
  const monthsOld = (now.getFullYear() - reportDate.getFullYear()) * 12 + (now.getMonth() - reportDate.getMonth());
  if (monthsOld > 12) return { label: "Caducado", variant: "destructive" as const, icon: AlertCircle };
  if (monthsOld > 9) return { label: "Por renovar", variant: "secondary" as const, icon: Clock };
  return { label: "Al día", variant: "default" as const, icon: CheckCircle };
}

export function SocialReportPanel({ familyId, informeSocial, informeSocialFecha }: SocialReportPanelProps) {
  const [editing, setEditing] = useState(false);
  const [localFecha, setLocalFecha] = useState(informeSocialFecha ?? "");
  const [uploadOpen, setUploadOpen] = useState(false);
  const utils = trpc.useUtils();

  const { data: familyDocs = [] } = useFamilyLevelDocuments(familyId);

  const informeRow = familyDocs.find(
    (d) => d.documento_tipo === "informe_social" && d.documento_url
  );

  const updateDoc = trpc.families.updateDocField.useMutation({
    onSuccess: () => {
      utils.families.getById.invalidate({ id: familyId });
      toast.success("Informe social actualizado");
      setEditing(false);
    },
    onError: () => toast.error("Error al actualizar"),
  });

  const status = getReportStatus(informeSocial, informeSocialFecha);
  const StatusIcon = status.icon;

  const handleSave = () => {
    updateDoc.mutate({
      id: familyId,
      field: "informe_social",
      value: true,
      informe_social_fecha: localFecha || undefined,
    });
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Informe Social
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setUploadOpen(true)}
              aria-label="Subir informe social en PDF"
            >
              <Upload className="h-3 w-3 mr-1" aria-hidden="true" />
              Subir informe (PDF)
            </Button>
            {!editing && (
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                Actualizar
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <StatusIcon className={`h-4 w-4 ${status.variant === "default" ? "text-green-600" : status.variant === "destructive" ? "text-red-500" : "text-yellow-500"}`} />
            <Badge variant={status.variant}>{status.label}</Badge>
          </div>

          {informeSocialFecha && (
            <p className="text-sm text-muted-foreground">
              Último informe: {new Date(informeSocialFecha).toLocaleDateString("es-ES")}
            </p>
          )}

          {informeRow?.documento_url && (
            <a
              href={informeRow.documento_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
              aria-label="Ver informe social en PDF"
            >
              <FileText className="h-3 w-3" aria-hidden="true" />
              Ver informe
            </a>
          )}

          {editing && (
            <div className="space-y-3 pt-2">
              <div>
                <Label className="text-xs">Fecha del informe social</Label>
                <Input
                  type="date"
                  value={localFecha}
                  onChange={(e) => setLocalFecha(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSave} disabled={updateDoc.isPending}>
                  {updateDoc.isPending ? "Guardando..." : "Guardar"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <DocumentUploadModal
        familyId={familyId}
        documentoTipo="informe_social"
        memberIndex={-1}
        open={uploadOpen}
        onOpenChange={setUploadOpen}
      />
    </>
  );
}
