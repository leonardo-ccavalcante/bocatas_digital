import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { useEnrollPerson, useUnenrollPerson } from "../hooks/useEnrollment";
import { usePrograms } from "../hooks/usePrograms";

interface EnrollmentPanelProps {
  personId: string;
  isAdmin?: boolean;
}

export function EnrollmentPanel({ personId, isAdmin }: EnrollmentPanelProps) {
  const [selectedProgramId, setSelectedProgramId] = useState<string>("");

  const { data: enrollments, isLoading } = trpc.programs.getPersonEnrollments.useQuery(
    { personId },
    { staleTime: 30_000 }
  );

  const { programs } = usePrograms();

  // Programs not yet enrolled
  const enrolledProgramIds = new Set(
    (enrollments ?? [])
      .filter((e) => e.estado === "activo")
      .map((e) => e.program_id)
  );

  const availablePrograms = programs.filter((p) => !enrolledProgramIds.has(p.id) && p.is_active);

  const enroll = useEnrollPerson(selectedProgramId);
  const unenroll = useUnenrollPerson(selectedProgramId);

  const handleEnroll = () => {
    if (!selectedProgramId) return;
    enroll.mutate({ personId, programId: selectedProgramId });
    setSelectedProgramId("");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Programas inscritos</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current enrollments */}
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
                    variant={
                      enrollment.estado === "activo"
                        ? "default"
                        : enrollment.estado === "completado"
                        ? "secondary"
                        : "destructive"
                    }
                    className="text-xs"
                  >
                    {enrollment.estado}
                  </Badge>
                </div>
                {isAdmin && enrollment.estado === "activo" && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-destructive">
                        Dar de baja
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>¿Dar de baja del programa?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Se marcará la inscripción en <strong>{enrollment.programs?.name}</strong> como completada.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => unenroll.mutate({ enrollmentId: enrollment.id })}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Dar de baja
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Enroll in new program (admin only) */}
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
    </Card>
  );
}
