/**
 * SesionScreen.tsx — Tela 2: Session detail screen.
 *
 * Shown when a session is selected from CalendarioSesiones.
 * Composes: header info, abrir/cerrar actions, asistencia block, close form,
 * and magic-link (enlace) section for staff.
 *
 * "En nombre de" affordance: staff can close on behalf of the teacher.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Key, KeyRound, Copy, Lock } from "lucide-react";
import { SesionEstadoChip } from "./SesionEstadoChip";
import { SesionAsistenciaBlock } from "./SesionAsistenciaBlock";
import { SesionCloseFormFields } from "./SesionCloseFormFields";
import { useCloseConfig } from "../../hooks/useCloseConfig";
import {
  useAbrirSesion,
  useCerrarSesion,
  useGenerarEnlace,
  useRevogarEnlace,
} from "../../hooks/useSesionMutations";
import { toast } from "sonner";
import type { SessionListItem } from "./SesionCalendarRow";
import type { SessionEstado } from "@shared/sessionSchemas";
import type { SessionDataValues } from "./types";

interface SesionScreenProps {
  session: SessionListItem;
  programId: string;
  programName: string;
  isAdmin: boolean;
  onBack: () => void;
}

function EnlaceSection({ sessionId, programId, isAdmin }: { sessionId: string; programId: string; isAdmin: boolean }) {
  const [token, setToken] = useState<string | null>(null);
  const generar = useGenerarEnlace(programId);
  const revogar = useRevogarEnlace(programId);

  if (!isAdmin) return null;

  return (
    <div className="space-y-3 pt-4 border-t">
      <div className="flex items-center gap-2">
        <Key className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <h4 className="text-sm font-semibold text-foreground">Enlace para el profesor</h4>
      </div>
      <p className="text-xs text-muted-foreground">
        Genera un enlace de un solo uso para que el profesor registre asistencia
        y cierre la sesión sin necesidad de acceder a la aplicación.
      </p>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          className="text-xs gap-1.5"
          disabled={generar.isPending}
          onClick={() => generar.mutate({ sessionId }, {
            onSuccess: (data) => { setToken(data.token); },
          })}
        >
          <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
          {generar.isPending ? "Generando..." : "Generar enlace"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-xs text-destructive hover:text-destructive"
          disabled={revogar.isPending}
          onClick={() => { revogar.mutate({ sessionId }); setToken(null); }}
        >
          {revogar.isPending ? "Revocando..." : "Revocar"}
        </Button>
      </div>
      {token && (
        <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
          <p className="text-xs text-muted-foreground">
            Comparte este enlace con el profesor. Solo funciona una vez.
          </p>
          <div className="flex items-center gap-2">
            <code className="text-xs font-mono break-all flex-1">
              {window.location.origin}/s/{sessionId}?t={token}
            </code>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 shrink-0"
              onClick={() => {
                void navigator.clipboard.writeText(`${window.location.origin}/s/${sessionId}?t=${token}`);
                toast.success("Enlace copiado");
              }}
              aria-label="Copiar enlace"
            >
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function SesionScreen({ session, programId, programName, isAdmin, onBack }: SesionScreenProps) {
  const [closeValues, setCloseValues] = useState<SessionDataValues>({});
  const [enNombreDe, setEnNombreDe] = useState("");

  const { data: closeConfig, isLoading: configLoading } = useCloseConfig(programId);
  const abrir = useAbrirSesion(programId);
  const cerrar = useCerrarSesion(programId);

  const estado = session.estado as SessionEstado;
  const isAbierta = estado === "abierta";
  const isPlanificada = estado === "planificada";
  const isCerrada = estado === "cerrada";

  function handleCerrar() {
    cerrar.mutate({
      sessionId: session.id,
      session_data: closeValues as Record<string, string | number | string[] | null>,
      en_nombre_de: enNombreDe.trim() || undefined,
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button
          variant="ghost"
          size="sm"
          className="text-xs gap-1.5 shrink-0"
          onClick={onBack}
          aria-label="Volver al calendario"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Calendario
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-h3 text-foreground">{session.fecha}</h3>
            <SesionEstadoChip estado={estado} />
          </div>
          {(session.hora_inicio || session.hora_fin) && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {session.hora_inicio} – {session.hora_fin}
            </p>
          )}
          {session.responsable_nombre && (
            <p className="text-xs text-muted-foreground">
              Responsable: {session.responsable_nombre}
            </p>
          )}
        </div>
      </div>

      {/* Abrir action */}
      {isPlanificada && isAdmin && (
        <Alert>
          <AlertDescription className="flex items-center justify-between gap-3">
            <span className="text-sm">Esta sesión está planificada. Ábrela para registrar asistencia.</span>
            <Button
              size="sm"
              disabled={abrir.isPending}
              onClick={() => abrir.mutate({ sessionId: session.id })}
            >
              {abrir.isPending ? "Abriendo..." : "Abrir sesión"}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Attendance block (only for open sessions) */}
      {isAbierta && (
        <>
          <SesionAsistenciaBlock
            sessionId={session.id}
            programId={programId}
            programName={programName}
            isAdmin={isAdmin}
          />
          <Separator />
        </>
      )}

      {/* Close form (only for open sessions) */}
      {isAbierta && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <h4 className="text-sm font-semibold text-foreground">Cerrar sesión</h4>
          </div>

          {configLoading ? (
            <Skeleton className="h-32 w-full rounded-lg" />
          ) : closeConfig?.enabled ? (
            <SesionCloseFormFields
              config={closeConfig}
              values={closeValues}
              onChange={setCloseValues}
              sessionId={session.id}
            />
          ) : null}

          {/* En nombre de (staff closing on behalf of teacher) */}
          <div className="space-y-1.5">
            <Label htmlFor="en-nombre-de">Registrado en nombre de (opcional)</Label>
            <Input
              id="en-nombre-de"
              value={enNombreDe}
              onChange={(e) => setEnNombreDe(e.target.value)}
              placeholder="Nombre del profesor/responsable"
              maxLength={200}
            />
            <p className="text-xs text-muted-foreground">
              Indica el nombre si cierras en nombre de otra persona.
            </p>
          </div>

          <Button
            className="w-full"
            disabled={cerrar.isPending}
            onClick={handleCerrar}
          >
            {cerrar.isPending ? "Cerrando sesión..." : "Cerrar sesión"}
          </Button>
        </div>
      )}

      {/* Closed state: read-only data */}
      {isCerrada && session.session_data && (
        <div className="rounded-xl border bg-muted/30 p-4 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Datos registrados al cierre
          </p>
          {Object.entries(session.session_data).map(([key, val]) => (
            <div key={key} className="flex justify-between text-sm gap-2">
              <span className="text-muted-foreground capitalize">{key.replace(/_/g, " ")}</span>
              <span className="font-medium text-right">
                {Array.isArray(val) ? val.join(", ") : String(val ?? "–")}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Magic link section */}
      {(isAbierta || isPlanificada) && (
        <EnlaceSection sessionId={session.id} programId={programId} isAdmin={isAdmin} />
      )}
    </div>
  );
}
