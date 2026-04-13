/**
 * IdentityVerifier — Job 7
 * Volunteer-facing component to verify a family member's identity at delivery time.
 * Shows a redacted identity card (last 4 digits of document) + authorized photo.
 */
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, ShieldCheck, User, FileText } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface IdentityVerifierProps {
  familyId: string;
  /** Called when identity is confirmed */
  onVerified?: () => void;
  /** Called when identity is rejected */
  onRejected?: () => void;
}

/** Redact document number: show only last 4 chars */
function redactDocument(doc: string | null | undefined): string {
  if (!doc) return "—";
  if (doc.length <= 4) return doc;
  return `${"*".repeat(doc.length - 4)}${doc.slice(-4)}`;
}

export function IdentityVerifier({ familyId, onVerified, onRejected }: IdentityVerifierProps) {
  const [verified, setVerified] = useState<boolean | null>(null);

  const { data: family, isLoading } = trpc.families.getById.useQuery(
    { id: familyId },
    { enabled: Boolean(familyId) }
  );

  const handleVerify = (result: boolean) => {
    setVerified(result);
    if (result) {
      toast.success("Identidad verificada correctamente");
      onVerified?.();
    } else {
      toast.error("Identidad no verificada — no proceder con la entrega");
      onRejected?.();
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground text-sm">
          Cargando datos de identidad…
        </CardContent>
      </Card>
    );
  }

  if (!family) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground text-sm">
          Familia no encontrada
        </CardContent>
      </Card>
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const titular = (family as any).persons as {
    nombre: string;
    apellidos: string;
    numero_documento?: string | null;
    foto_perfil_url?: string | null;
  } | null;

  const personaRecoge = (family as { persona_recoge?: string | null }).persona_recoge;
  const autorizado = (family as { autorizado?: boolean }).autorizado;
  const autorizadoDocUrl = (family as { autorizado_documento_url?: string | null }).autorizado_documento_url;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          Verificación de identidad
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Titular info */}
        <div className="flex items-start gap-4">
          {titular?.foto_perfil_url ? (
            <img
              src={titular.foto_perfil_url}
              alt="Foto titular"
              className="h-16 w-16 rounded-full object-cover border-2 border-border"
            />
          ) : (
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
              <User className="h-8 w-8 text-muted-foreground" />
            </div>
          )}
          <div className="flex-1">
            <p className="font-semibold text-foreground">
              {titular?.nombre} {titular?.apellidos}
            </p>
            <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
              <FileText className="h-3.5 w-3.5" />
              Documento: <span className="font-mono">{redactDocument(titular?.numero_documento)}</span>
            </p>
          </div>
        </div>

        {/* Authorized person */}
        {autorizado && personaRecoge && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
            <p className="text-xs font-medium text-amber-800 mb-1">Persona autorizada para recoger:</p>
            <p className="text-sm font-semibold text-amber-900">{personaRecoge}</p>
            {autorizadoDocUrl && (
              <a
                href={autorizadoDocUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-amber-700 underline mt-1 inline-block"
              >
                Ver documento de autorización
              </a>
            )}
          </div>
        )}

        {/* Verification result */}
        {verified !== null && (
          <div className={`rounded-lg p-3 flex items-center gap-2 ${
            verified
              ? "bg-green-50 border border-green-200 text-green-800"
              : "bg-red-50 border border-red-200 text-red-800"
          }`}>
            {verified ? (
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            ) : (
              <XCircle className="h-5 w-5 text-red-600" />
            )}
            <span className="text-sm font-medium">
              {verified ? "Identidad verificada" : "Identidad NO verificada"}
            </span>
          </div>
        )}

        {/* Action buttons */}
        {verified === null && (
          <div className="flex gap-3 pt-2">
            <Button
              variant="default"
              className="flex-1 bg-green-600 hover:bg-green-700"
              onClick={() => handleVerify(true)}
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Confirmar identidad
            </Button>
            <Button
              variant="outline"
              className="flex-1 border-red-300 text-red-700 hover:bg-red-50"
              onClick={() => handleVerify(false)}
            >
              <XCircle className="h-4 w-4 mr-2" />
              No verificado
            </Button>
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          <Badge variant="outline" className="text-xs">
            Familia #{(family as { familia_numero?: number }).familia_numero ?? "—"}
          </Badge>
          <Badge
            variant="outline"
            className={`text-xs ${
              (family as { estado?: string }).estado === "activa"
                ? "border-green-300 text-green-700"
                : "border-red-300 text-red-700"
            }`}
          >
            {(family as { estado?: string }).estado ?? "—"}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
