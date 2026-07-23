import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { ESTADO_LABELS } from "@shared/programEstados";
import { useEnrollPerson, useUnenrollPerson } from "../hooks/useEnrollment";
import { usePrograms } from "../hooks/usePrograms";
import { BajaDialog } from "./BajaDialog";

interface EnrollmentPanelProps {
  personId: string;
  isAdmin?: boolean;
}

export function EnrollmentPanel({ personId, isAdmin }: EnrollmentPanelProps) {
  const [selectedProgramId, setSelectedProgramId] = useState<string>("");
  const [bajaEnrollmentId, setBajaEnrollmentId] = useState<string | null>(null);
  const [bajaProgramId, setBajaProgramId] = useState<string | null>(null);
  const [bajaProgramName, setBajaProgramName] = useState<string>("");

  const { data: enrollments, isLoading } = trpc.programs.getPersonEnrollments.useQuery(
    { personId },
    { staleTime: 30_000 }
  );

  const { programs } = usePrograms();

  const enrolledProgramIds = new Set(
    (enrollments ?? [])
      .filter((e) => e.estado === "activo")
      .map((e) => e.program_id)
  );

  const availablePrograms = programs.filter(
    (p) => !enrolledProgramIds.has(p.id) && p.is_active && p.inscribible !== false
  );

  const enroll = useEnrollPerson(selectedProgramId, personId);
  const unenroll = useUnenrollPerson(bajaProgramId ?? selectedProgramId, personId);

  function handleEnroll() {
    if (!selectedProgramId) return;
    enroll.mutate({ personId, programId: selectedProgramId });
    setSelectedProgramId("");
  }

  function openBajaDialog(enrollmentId: string, programId: string, programName: string) {
    setBajaEnrollmentId(enrollmentId);
    setBajaProgramId(programId);
    setBajaProgramName(programName);
  }

  function closeBajaDialog() {
    setBajaEnrollmentId(null);
    setBajaProgramId(null);
    setBajaProgramName("");
  }

  function handleBajaConfirm(motivo: string, notas?: string) {
    if (!bajaEnrollmentId) return;
    unenroll.mutate({ enrollmentId: bajaEnrollmentId, motivo, notas });
    closeBajaDialog();
  }

  function estadoBadgeVariant(estado: string): "default" | "secondary" | "destructive" | "outline" {
    if (estado === "activo" || estado === "admitido") return "default";
    if (estado === "baja" || estado === "rechazado") return "destructive";
    return "secondary";
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Programas inscritos</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando...</p>
        ) : !enrollments?.length ? (
          <p className="text-sm text-muted-foreground">
            Esta persona no está inscrita en ningún programa.
          </p>
        ) : (
          <div className="space-y-2">
            {enrollments.map((enrollment) => (
              <div
                key={enrollment.id}
                className="flex items-center justify-between p-2 rounded-md border"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{enrollment.programs?.name ?? "—"}</span>
                  <Badge
                    variant={estadoBadgeVariant(enrollment.estado)}
                    className="text-xs"
                    aria-label={ESTADO_LABELS[enrollment.estado as keyof typeof ESTADO_LABELS] ?? enrollment.estado}
                  >
                    {ESTADO_LABELS[enrollment.estado as keyof typeof ESTADO_LABELS] ?? enrollment.estado}
                  </Badge>
                </div>
                {isAdmin && enrollment.estado !== "baja" && enrollment.estado !== "terminado" && enrollment.estado !== "completado" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-muted-foreground hover:text-destructive"
                    onClick={() => openBajaDialog(enrollment.id, enrollment.program_id, enrollment.programs?.name ?? "")}
                    aria-label={`Dar de baja de ${enrollment.programs?.name ?? "programa"}`}
                  >
                    Dar de baja
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        {isAdmin && availablePrograms.length > 0 && (
          <div className="flex gap-2 pt-2 border-t">
            <Select value={selectedProgramId} onValueChange={setSelectedProgramId}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Inscribir en programa..." />
              </SelectTrigger>
              <SelectContent>
                {availablePrograms.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.icon} {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              onClick={handleEnroll}
              disabled={!selectedProgramId || enroll.isPending}
            >
              {enroll.isPending ? "..." : "Inscribir"}
            </Button>
          </div>
        )}
      </CardContent>

      <BajaDialog
        open={!!bajaEnrollmentId}
        onOpenChange={(open) => { if (!open) closeBajaDialog(); }}
        personName={bajaProgramName || "esta persona"}
        isLoading={unenroll.isPending}
        onConfirm={handleBajaConfirm}
      />
    </Card>
  );
}
