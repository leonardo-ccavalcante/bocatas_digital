/**
 * SesionAsistenciaBlock.tsx — QR scanner + manual chip for session attendance.
 *
 * QR scan flow:
 *   1. Decode QR (bocatas://person/<uuid>?sig=<hmac8>) → extract personId
 *   2. Call marcarAsistenciaSesion({ sessionId, personId, qrValue })
 *   3. BAD_REQUEST → "no inscrito" prompt with enroll option
 *   4. FORBIDDEN  → "QR inválido o manipulado" error
 *
 * Manual fallback: search enrolled persons by name, mark by personId.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { QRScanner } from "@/features/checkin/components/QRScanner";
import { SesionManualSearch } from "./SesionManualSearch";
import { EnrollPersonModal } from "../EnrollPersonModal";
import { parseQrPayload } from "@shared/qr/payload";
import { trpc } from "@/lib/trpc";
import { QrCode, UserSearch, CheckCircle2, AlertTriangle } from "lucide-react";

interface SesionAsistenciaBlockProps {
  sessionId: string;
  programId: string;
  programName: string;
  isAdmin: boolean;
  asistenciaCount?: number;
  enrollmentTotal?: number;
}

type AttendanceResult =
  | { type: "success"; nombre: string }
  | { type: "not_enrolled"; personId: string }
  | { type: "error"; message: string };

export function SesionAsistenciaBlock({
  sessionId,
  programId,
  programName,
  isAdmin,
  asistenciaCount = 0,
  enrollmentTotal,
}: SesionAsistenciaBlockProps) {
  const [scanActive, setScanActive] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [lastResult, setLastResult] = useState<AttendanceResult | null>(null);
  const [notEnrolledPersonId, setNotEnrolledPersonId] = useState<string | null>(null);
  const [enrollOpen, setEnrollOpen] = useState(false);

  const utils = trpc.useUtils();
  const marcar = trpc.programs.enlace.marcarAsistenciaSesion.useMutation({
    onSuccess: (_data, variables) => {
      setLastResult({ type: "success", nombre: `ID: ${variables.personId.slice(0, 8)}` });
      setScanActive(false);
      void utils.programs.sessions.listSesiones.invalidate({ programId });
    },
    onError: (err) => {
      const code = (err as { data?: { code?: string } })?.data?.code;
      if (code === "BAD_REQUEST") {
        setNotEnrolledPersonId(
          (err as { data?: { personId?: string } })?.data?.personId ?? null
        );
        setLastResult({ type: "not_enrolled", personId: "" });
      } else {
        setLastResult({ type: "error", message: err.message });
      }
      setScanActive(false);
    },
  });

  function handleQrDecoded(raw: string) {
    const parsed = parseQrPayload(raw);
    if (!parsed) {
      setLastResult({ type: "error", message: "QR no reconocido. Asegúrate de escanear el QR de Bocatas." });
      setScanActive(false);
      return;
    }
    marcar.mutate({ sessionId, personId: parsed.uuid, qrValue: raw });
  }

  const attendanceLabel = enrollmentTotal
    ? `Asistencia (${asistenciaCount} de ${enrollmentTotal})`
    : `Asistencia (${asistenciaCount})`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-foreground">{attendanceLabel}</h4>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={manualOpen ? "default" : "outline"}
            className="text-xs gap-1.5"
            onClick={() => { setManualOpen(!manualOpen); setScanActive(false); }}
          >
            <UserSearch className="h-3.5 w-3.5" aria-hidden="true" />
            Buscar persona
          </Button>
          <Button
            size="sm"
            variant={scanActive ? "default" : "outline"}
            className="text-xs gap-1.5"
            onClick={() => { setScanActive(!scanActive); setManualOpen(false); setLastResult(null); }}
            aria-label="Escanear QR del alumno"
          >
            <QrCode className="h-3.5 w-3.5" aria-hidden="true" />
            Escanear QR
          </Button>
        </div>
      </div>

      {/* Feedback */}
      {lastResult && (
        <div role="status" aria-live="polite">
          {lastResult.type === "success" && (
            <Alert className="border-emerald-300 bg-emerald-50 dark:bg-emerald-950">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
              <AlertDescription className="text-emerald-800 dark:text-emerald-200">
                Asistencia registrada: <strong>{lastResult.nombre}</strong>
              </AlertDescription>
            </Alert>
          )}
          {lastResult.type === "not_enrolled" && (
            <Alert className="border-amber-300 bg-amber-50 dark:bg-amber-950">
              <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />
              <AlertDescription className="text-amber-800 dark:text-amber-200 space-y-2">
                <p>Esta persona no está inscrita en este curso.</p>
                {isAdmin && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs"
                    onClick={() => { setNotEnrolledPersonId(notEnrolledPersonId); setEnrollOpen(true); }}
                  >
                    Inscribir en el programa
                  </Button>
                )}
              </AlertDescription>
            </Alert>
          )}
          {lastResult.type === "error" && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              <AlertDescription>{lastResult.message}</AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {scanActive && (
        <div className="rounded-xl overflow-hidden border aspect-video max-h-72">
          <QRScanner
            onDecoded={handleQrDecoded}
            onCancel={() => setScanActive(false)}
          />
        </div>
      )}

      {manualOpen && (
        <div className="rounded-xl border p-4">
          <SesionManualSearch
            sessionId={sessionId}
            programId={programId}
            onSuccess={(personId, nombre) => {
              setLastResult({ type: "success", nombre });
              setManualOpen(false);
            }}
          />
        </div>
      )}

      {/* Enroll prompt dialog */}
      {isAdmin && enrollOpen && (
        <EnrollPersonModal
          programId={programId}
          programName={programName}
          trigger={null}
          onSuccess={() => setEnrollOpen(false)}
          onCancel={() => setEnrollOpen(false)}
        />
      )}
    </div>
  );
}
