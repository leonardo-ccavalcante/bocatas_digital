/**
 * CerrarSesionPrograma — E-D20 (Job 10)
 * Config-driven session close form for a program delivery day.
 * Uses FAMILIA_SESSION_CLOSE_PRESET fields, enforces hard-block if required fields missing.
 */
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { LockKeyhole, CheckCircle2, AlertTriangle, Clock } from "lucide-react";
import { useCloseSession, useOpenSession } from "../hooks/useFamilias";
import { FAMILIA_SESSION_CLOSE_PRESET } from "../constants";
import { toast } from "sonner";

interface CerrarSesionProgramaProps {
  programId: string;
  locationId?: string;
  fecha?: string;
  onClosed?: () => void;
}

export function CerrarSesionPrograma({
  programId,
  locationId,
  fecha,
  onClosed,
}: CerrarSesionProgramaProps) {
  const today = fecha ?? new Date().toISOString().split("T")[0];
  const { data: openSession, isLoading: sessionLoading } = useOpenSession(programId, today);
  const closeSession = useCloseSession();

  const [fields, setFields] = useState<Record<string, string | boolean>>(() =>
    Object.fromEntries(
      FAMILIA_SESSION_CLOSE_PRESET.map((f) => [f.key, f.type === "boolean" ? false : ""])
    )
  );
  const [submitting, setSubmitting] = useState(false);

  // Validate required fields
  const missingRequired = FAMILIA_SESSION_CLOSE_PRESET.filter((f) => {
    if (!f.required) return false;
    const val = fields[f.key];
    if (f.type === "boolean") return false; // booleans are always set
    return !val || String(val).trim() === "";
  });

  const handleClose = async () => {
    if (missingRequired.length > 0) {
      toast.error(`Faltan campos obligatorios: ${missingRequired.map((f) => f.label).join(", ")}`);
      return;
    }

    setSubmitting(true);
    try {
      // Build session_data from fields
      const sessionData: Record<string, unknown> = {};
      for (const f of FAMILIA_SESSION_CLOSE_PRESET) {
        const val = fields[f.key];
        if (f.type === "number") {
          sessionData[f.key] = val !== "" ? Number(val) : null;
        } else {
          sessionData[f.key] = val;
        }
      }

      await closeSession.mutateAsync({
        program_id: programId,
        fecha: today,
        location_id: locationId,
        session_data: sessionData,
      });

      toast.success("Sesión cerrada correctamente");
      onClosed?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al cerrar la sesión";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (sessionLoading) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          Verificando sesión…
        </CardContent>
      </Card>
    );
  }

  // Session already closed
  if (!openSession && !sessionLoading) {
    return (
      <Card className="border-green-200">
        <CardContent className="py-6">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-8 w-8 text-green-600 shrink-0" />
            <div>
              <p className="font-semibold text-green-800">Sesión ya cerrada</p>
              <p className="text-sm text-green-700">
                La sesión del {today} ya fue registrada correctamente.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <LockKeyhole className="h-5 w-5 text-primary" />
          Cerrar sesión del día
          <Badge variant="outline" className="ml-auto text-xs">
            <Clock className="h-3 w-3 mr-1" />
            {today}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Registra los datos de cierre de la sesión de hoy. Los campos marcados con{" "}
          <span className="text-red-500">*</span> son obligatorios.
        </p>

        {/* Dynamic fields from preset */}
        <div className="space-y-4">
          {FAMILIA_SESSION_CLOSE_PRESET.map((field) => (
            <div key={field.key} className="space-y-1.5">
              <Label htmlFor={`session-${field.key}`} className="text-sm font-medium">
                {field.label}
                {field.required && <span className="text-red-500 ml-1">*</span>}
                {field.unit && (
                  <span className="text-xs text-muted-foreground ml-1">({field.unit})</span>
                )}
              </Label>

              {field.type === "boolean" ? (
                <div className="flex items-center gap-2">
                  <Switch
                    id={`session-${field.key}`}
                    checked={Boolean(fields[field.key])}
                    onCheckedChange={(checked) =>
                      setFields((prev) => ({ ...prev, [field.key]: checked }))
                    }
                  />
                  <span className="text-sm text-muted-foreground">
                    {fields[field.key] ? "Sí" : "No"}
                  </span>
                </div>
              ) : field.type === "text" ? (
                <Textarea
                  id={`session-${field.key}`}
                  placeholder={`${field.label}…`}
                  value={String(fields[field.key] ?? "")}
                  onChange={(e) =>
                    setFields((prev) => ({ ...prev, [field.key]: e.target.value }))
                  }
                  rows={3}
                  className="resize-none"
                />
              ) : (
                <Input
                  id={`session-${field.key}`}
                  type="number"
                  min={0}
                  placeholder="0"
                  value={String(fields[field.key] ?? "")}
                  onChange={(e) =>
                    setFields((prev) => ({ ...prev, [field.key]: e.target.value }))
                  }
                  className="w-40"
                />
              )}
            </div>
          ))}
        </div>

        {/* Hard-block warning */}
        {missingRequired.length > 0 && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-800">
                No se puede cerrar la sesión
              </p>
              <p className="text-xs text-red-700 mt-0.5">
                Faltan campos obligatorios:{" "}
                {missingRequired.map((f) => f.label).join(", ")}
              </p>
            </div>
          </div>
        )}

        <Button
          className="w-full"
          onClick={handleClose}
          disabled={submitting || closeSession.isPending || missingRequired.length > 0}
        >
          <LockKeyhole className="h-4 w-4 mr-2" />
          {submitting ? "Cerrando sesión…" : "Cerrar sesión del día"}
        </Button>
      </CardContent>
    </Card>
  );
}
