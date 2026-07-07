import { useState } from "react";
import { toast } from "sonner";
import { getSignedDocUrl } from "@/features/families/utils/signedUrl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { FileText, FileDown, AlertCircle, CheckCircle, Clock, Upload, Loader2, Wand2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { isInformeStale } from "@shared/informeFreshness";
import { DocumentUploadModal } from "@/components/DocumentUploadModal";
import { useFamilyLevelDocuments } from "@/features/families/hooks/useFamilias";
import { FollowUpsPanel } from "./FollowUpsPanel";

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
  const [valoracion, setValoracion] = useState<string | null>(null); // null = not loaded/edited yet
  const utils = trpc.useUtils();

  const { data: familyDocs = [] } = useFamilyLevelDocuments(familyId);
  const { data: family } = trpc.families.getById.useQuery({ id: familyId }, { enabled: !!familyId });

  // situacion_familiar_texto is Art.9 admin-only; getById returns it for admins.
  const savedValoracion =
    (family as { situacion_familiar_texto?: string | null } | undefined)?.situacion_familiar_texto ?? "";
  const valoracionValue = valoracion ?? savedValoracion;

  const { data: latest } = trpc.families.getLatestFollowUp.useQuery(
    { family_id: familyId },
    { enabled: !!familyId },
  );

  const blockingError: string | null = (() => {
    if (latest == null) {
      return "Sin seguimientos registrados. Añade un seguimiento para habilitar la generación.";
    }
    if (isInformeStale(latest.fecha)) {
      return `El informe social está vencido (último seguimiento: ${latest.fecha}). Registra un seguimiento reciente.`;
    }
    if (savedValoracion.trim() === "") {
      return "Añade la valoración social (Descripción de la situación familiar) antes de generar.";
    }
    return null;
  })();

  const informeRow = familyDocs.find((d) => d.documento_tipo === "informe_social" && d.documento_url);
  const generatedRow = familyDocs.find(
    (d) => d.documento_tipo === "informe_valoracion_social" && d.documento_url,
  );

  const updateDoc = trpc.families.updateDocField.useMutation({
    onSuccess: () => {
      utils.families.getById.invalidate({ id: familyId });
      toast.success("Informe social actualizado");
      setEditing(false);
    },
    onError: () => toast.error("Error al actualizar"),
  });

  const compose = trpc.families.composeNarrativeDraft.useMutation({
    onSuccess: (data) => {
      setValoracion(data.draft);
      toast.success("Borrador compuesto. Revísalo y guárdalo.");
    },
    onError: (e) => toast.error(e.message),
  });

  const saveNarrative = trpc.families.updateNarrative.useMutation({
    onSuccess: () => {
      utils.families.getById.invalidate({ id: familyId });
      setValoracion(null); // fall back to saved value
      toast.success("Valoración guardada");
    },
    onError: (e) => toast.error(e.message),
  });

  const generateSaved = trpc.families.generateSocialReport.useMutation({
    onSuccess: () => {
      utils.families.getFamilyDocuments.invalidate({ family_id: familyId });
      utils.families.getById.invalidate({ id: familyId });
      toast.success("Informe generado y guardado");
    },
    onError: (e) => toast.error(e.message),
  });

  const status = getReportStatus(informeSocial, informeSocialFecha);
  const StatusIcon = status.icon;

  const handleSave = () => {
    updateDoc.mutate({ id: familyId, field: "informe_social", value: true, informe_social_fecha: localFecha || undefined });
  };

  const handleComposeDraft = () => {
    if (valoracionValue.trim() !== "" && !window.confirm("Ya hay una valoración. ¿Reemplazarla por un borrador nuevo?")) {
      return;
    }
    compose.mutate({ id: familyId });
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
            <Button variant="outline" size="sm" onClick={() => setUploadOpen(true)} aria-label="Subir informe social en PDF">
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

          <div className="flex flex-wrap items-center gap-3">
            {informeRow?.documento_url && (
              <button
                type="button"
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                aria-label="Ver informe social subido (PDF)"
                onClick={async () => {
                  const url = await getSignedDocUrl(informeRow.documento_url);
                  if (url) window.open(url, "_blank", "noopener,noreferrer");
                  else toast.error("No se pudo generar el enlace");
                }}
              >
                <FileText className="h-3 w-3" aria-hidden="true" />
                Ver informe (PDF subido)
              </button>
            )}
            {generatedRow?.documento_url && (
              <button
                type="button"
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                aria-label="Ver informe de valoración generado (DOCX)"
                onClick={async () => {
                  const url = await getSignedDocUrl(generatedRow.documento_url);
                  if (url) window.open(url, "_blank", "noopener,noreferrer");
                  else toast.error("No se pudo generar el enlace");
                }}
              >
                <FileDown className="h-3 w-3" aria-hidden="true" />
                Ver informe generado (DOCX)
              </button>
            )}
          </div>

          {editing && (
            <div className="space-y-3 pt-2">
              <div>
                <Label className="text-xs">Fecha del informe social</Label>
                <Input type="date" value={localFecha} onChange={(e) => setLocalFecha(e.target.value)} />
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

          {/* Valoración social — the «DESCRIPCIÓN SITUACIÓN FAMILIAR» narrative */}
          <div className="space-y-2 pt-2 border-t">
            <Label htmlFor="valoracion-social" className="text-sm font-medium">
              Valoración social (descripción de la situación familiar)
            </Label>
            <Textarea
              id="valoracion-social"
              rows={6}
              maxLength={20000}
              value={valoracionValue}
              onChange={(e) => setValoracion(e.target.value)}
              placeholder="Redacta o compón un borrador de la valoración…"
            />
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={handleComposeDraft} disabled={compose.isPending} aria-label="Componer borrador de la valoración">
                {compose.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" aria-hidden="true" /> : <Wand2 className="h-3 w-3 mr-1" aria-hidden="true" />}
                Componer borrador
              </Button>
              <Button
                size="sm"
                onClick={() => saveNarrative.mutate({ id: familyId, situacion_familiar_texto: valoracionValue })}
                disabled={saveNarrative.isPending || valoracion === null || valoracion === savedValoracion}
              >
                {saveNarrative.isPending ? "Guardando…" : "Guardar valoración"}
              </Button>
            </div>
          </div>

          {/* Generate + persist */}
          <div className="pt-2 border-t">
            {blockingError && (
              <p role="alert" className="text-xs text-destructive mb-2">
                {blockingError}
              </p>
            )}
            <Button
              size="sm"
              onClick={() => generateSaved.mutate({ family_id: familyId })}
              disabled={!!blockingError || generateSaved.isPending}
              aria-label="Generar y guardar el informe de valoración social"
            >
              {generateSaved.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" aria-hidden="true" /> : <FileDown className="h-4 w-4 mr-1" aria-hidden="true" />}
              Generar informe social
            </Button>
          </div>
        </CardContent>
      </Card>

      <FollowUpsPanel familyId={familyId} />

      <DocumentUploadModal familyId={familyId} documentoTipo="informe_social" memberIndex={-1} open={uploadOpen} onOpenChange={setUploadOpen} />
    </>
  );
}
