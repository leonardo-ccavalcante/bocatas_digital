/**
 * EnlaceSessionView.tsx — Public (no-login) view for a magic-link session.
 *
 * Mobile-first, WCAG AA. Zero admin chrome.
 * Flow:
 *  1. On mount → enlaceGetSession (MUTATION with token in body, GROUP 7e)
 *  2. Token error → friendly "enlace no válido o caducado" screen
 *  3. Success → roster + QR attendance + close form
 *
 * Stamps show "registrado como «<responsable> (enlace)»".
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, CheckCircle2, Users } from "lucide-react";
import { QRScanner } from "@/features/checkin/components/QRScanner";
import { SesionCloseFormFields } from "./SesionCloseFormFields";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { parseQrPayload } from "@shared/qr/payload";
import type { SessionCloseConfig } from "@shared/sessionSchemas";
import type { SessionDataValues } from "./types";

interface EnlaceSessionViewProps {
  sessionId: string;
  token: string;
}

type EnlaceSession = {
  id: string;
  fecha: string;
  estado: string;
  location_id: string | null;
};

type RosterPerson = { id: string; nombre: string; apellidos: string };

export function EnlaceSessionView({ sessionId, token }: EnlaceSessionViewProps) {
  const [session, setSession] = useState<EnlaceSession | null>(null);
  const [persons, setPersons] = useState<RosterPerson[]>([]);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [scanActive, setScanActive] = useState(false);
  const [closeValues, setCloseValues] = useState<SessionDataValues>({});
  const [attendedIds, setAttendedIds] = useState<Set<string>>(new Set());
  const [closeSuccess, setCloseSuccess] = useState(false);
  // Close-form definition arrives with enlaceGetSession — getCloseConfig is
  // authed (voluntarioProcedure) and unreachable from this public page.
  const [closeConfig, setCloseConfig] = useState<SessionCloseConfig | null>(null);

  const getSession = trpc.programs.enlace.enlaceGetSession.useMutation({
    onSuccess: (data) => {
      setSession(data.session as EnlaceSession);
      setPersons(data.persons as RosterPerson[]);
      setCloseConfig((data.closeConfig ?? null) as SessionCloseConfig | null);
    },
    onError: (err) => {
      const msg = err.message || "Enlace no válido o caducado";
      setTokenError(msg);
    },
  });

  const marcarAsistencia = trpc.programs.enlace.enlaceMarcarAsistencia.useMutation({
    onSuccess: (_data, variables) => {
      setAttendedIds((prev) => new Set([...prev, variables.personId]));
      setScanActive(false);
      toast.success("Asistencia registrada");
    },
    onError: (err) => {
      toast.error("Error al registrar asistencia", { description: err.message });
      setScanActive(false);
    },
  });

  const cerrar = trpc.programs.enlace.enlaceCerrar.useMutation({
    onSuccess: () => {
      setCloseSuccess(true);
      toast.success("Sesión cerrada correctamente");
    },
    onError: (err) => {
      toast.error("Error al cerrar sesión", { description: err.message });
    },
  });

  useEffect(() => {
    if (sessionId && token) {
      getSession.mutate({ sessionId, token });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, token]);

  function handleQrDecoded(raw: string) {
    const parsed = parseQrPayload(raw);
    if (!parsed || !session) {
      toast.error("QR no reconocido");
      setScanActive(false);
      return;
    }
    marcarAsistencia.mutate({ sessionId, token, personId: parsed.uuid, qrValue: raw });
  }

  function handleMarkManual(personId: string) {
    marcarAsistencia.mutate({ sessionId, token, personId });
  }

  function handleCerrar() {
    cerrar.mutate({
      sessionId,
      token,
      session_data: closeValues as Record<string, string | number | string[] | null>,
    });
  }

  // Loading state
  if (getSession.isPending) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
        <Skeleton className="h-8 w-48 mb-4" />
        <Skeleton className="h-32 w-full max-w-sm rounded-xl" />
      </div>
    );
  }

  // Token error / invalid / expired
  if (tokenError) {
    return (
      <main
        className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-12 text-center"
        lang="es"
        aria-labelledby="enlace-error-title"
      >
        <AlertTriangle className="h-12 w-12 text-destructive mb-4" aria-hidden="true" />
        <h1 id="enlace-error-title" className="text-h2 text-foreground mb-2">
          Enlace no válido o caducado
        </h1>
        <p className="text-body text-muted-foreground max-w-sm">
          {tokenError}. Si el problema persiste, contacta con la coordinación para
          que generen un nuevo enlace.
        </p>
      </main>
    );
  }

  // Closed successfully
  if (closeSuccess) {
    return (
      <main className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-12 text-center">
        <CheckCircle2 className="h-12 w-12 text-emerald-600 mb-4" aria-hidden="true" />
        <h1 className="text-h2 text-foreground mb-2">Sesión cerrada</h1>
        <p className="text-body text-muted-foreground">
          Los datos han sido registrados correctamente. Puedes cerrar esta ventana.
        </p>
      </main>
    );
  }

  if (!session) return null;

  const isAbierta = session.estado === "abierta";

  return (
    <main
      className="min-h-screen bg-background px-4 py-6 max-w-lg mx-auto space-y-6"
      lang="es"
      aria-label="Registro de sesión"
    >
      {/* Session header — no admin chrome */}
      <div className="space-y-1">
        <h1 className="text-h2 text-foreground">Sesión del {session.fecha}</h1>
        <p className="text-sm text-muted-foreground capitalize">{session.estado}</p>
      </div>

      {/* Attendance section */}
      <section aria-labelledby="asistencia-heading" className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 id="asistencia-heading" className="text-h3 text-foreground flex items-center gap-2">
            <Users className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            Asistencia ({attendedIds.size} de {persons.length})
          </h2>
          {isAbierta && (
            <Button
              size="sm"
              variant="outline"
              className="text-xs"
              onClick={() => setScanActive(!scanActive)}
              aria-label="Escanear QR para registrar asistencia"
            >
              {scanActive ? "Cancelar escaneo" : "Escanear QR"}
            </Button>
          )}
        </div>

        {scanActive && (
          <div className="rounded-xl overflow-hidden border aspect-video max-h-72">
            <QRScanner
              onDecoded={handleQrDecoded}
              onCancel={() => setScanActive(false)}
            />
          </div>
        )}

        <div
          className="space-y-1.5"
          role="list"
          aria-label="Lista de alumnos inscritos"
        >
          {persons.map((p) => {
            const attended = attendedIds.has(p.id);
            return (
              <div
                key={p.id}
                role="listitem"
                className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 ${
                  attended ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30" : ""
                }`}
              >
                <span className="text-sm font-medium">
                  {p.nombre} {p.apellidos}
                </span>
                {attended ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" aria-label="Asistencia registrada" />
                ) : (
                  isAbierta && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs"
                      disabled={marcarAsistencia.isPending}
                      onClick={() => handleMarkManual(p.id)}
                      aria-label={`Marcar asistencia de ${p.nombre} ${p.apellidos}`}
                    >
                      Marcar
                    </Button>
                  )
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Close form */}
      {isAbierta && closeConfig?.enabled && (
        <section aria-labelledby="cierre-heading" className="space-y-4">
          <h2 id="cierre-heading" className="text-h3 text-foreground">Datos de la sesión</h2>
          <SesionCloseFormFields
            config={closeConfig}
            values={closeValues}
            onChange={setCloseValues}
            sessionId={sessionId}
            token={token}
          />
        </section>
      )}

      {isAbierta && (
        <Alert className="border-amber-300 bg-amber-50 dark:bg-amber-950/30">
          <AlertDescription className="text-xs text-amber-800 dark:text-amber-200">
            Una vez cerrada la sesión no podrás modificar los datos de asistencia.
          </AlertDescription>
        </Alert>
      )}

      {isAbierta && (
        <Button
          className="w-full min-h-[48px]"
          disabled={cerrar.isPending}
          onClick={handleCerrar}
          aria-label="Cerrar sesión y guardar datos"
        >
          {cerrar.isPending ? "Cerrando..." : "Cerrar sesión"}
        </Button>
      )}
    </main>
  );
}
