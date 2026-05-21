import { useState } from "react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useEnrollments, useUnenrollPerson } from "../hooks/useEnrollment";
import { filterVisibleColumns } from "../utils/volunteerVisibility";
import type { EnrollmentEstado } from "../schemas";

interface EnrolledPersonsTableProps {
  programId: string;
  isAdmin?: boolean;
  /** Fields visible to volunteers. Empty = no restrictions. */
  volunteerVisibleFields?: string[];
}

export const ESTADO_LABEL: Record<string, string> = {
  activo: "Activos",
  completado: "Completados",
  rechazado: "Rechazados",
};

export function buildCountLabel(
  total: number,
  estadoFilter: EnrollmentEstado | undefined
): string {
  const plural = total !== 1;
  return (
    `${total} persona${plural ? "s" : ""} inscrita${plural ? "s" : ""}` +
    (estadoFilter ? ` (${ESTADO_LABEL[estadoFilter]?.toLowerCase()})` : "")
  );
}

const ESTADO_BADGE_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  activo: "default",
  completado: "secondary",
  rechazado: "destructive",
};

const ALL_COLUMNS = ["foto", "nombre", "estado", "fecha_inscripcion", "notas"] as const;
type ColumnKey = (typeof ALL_COLUMNS)[number];

function getInitials(nombre: string | null, apellidos: string | null): string {
  const n = (nombre ?? "").charAt(0);
  const a = (apellidos ?? "").charAt(0);
  return `${n}${a}`.toUpperCase() || "?";
}

const FILTER_STATES: EnrollmentEstado[] = ["activo", "completado", "rechazado"];

export function EnrolledPersonsTable({
  programId,
  isAdmin,
  volunteerVisibleFields = [],
}: EnrolledPersonsTableProps) {
  const [search, setSearch] = useState("");
  const [estadoFilter, setEstadoFilter] = useState<EnrollmentEstado | undefined>("activo");

  const { enrollments, total, isLoading } = useEnrollments(programId, {
    estado: estadoFilter,
    search: search.length >= 2 ? search : undefined,
  });

  const unenroll = useUnenrollPerson(programId);

  // Determine visible columns based on role and program config
  const visibleCols = new Set<ColumnKey>(
    filterVisibleColumns([...ALL_COLUMNS], volunteerVisibleFields, !!isAdmin) as ColumnKey[]
  );

  const colCount = visibleCols.size + (isAdmin ? 1 : 0);

  function handleFilterChange(value: string) {
    // ToggleGroup `type="single"` returns empty string when deselected
    if (!value) {
      setEstadoFilter(undefined);
    } else {
      setEstadoFilter(value as EnrollmentEstado);
    }
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Input
          placeholder="Buscar por nombre..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="sm:max-w-xs"
          aria-label="Buscar persona inscrita"
        />
        <ToggleGroup
          type="single"
          value={estadoFilter ?? ""}
          onValueChange={handleFilterChange}
          aria-label="Filtrar por estado de inscripción"
          className="flex-wrap gap-1"
        >
          {FILTER_STATES.map((estado) => (
            <ToggleGroupItem
              key={estado}
              value={estado}
              aria-label={ESTADO_LABEL[estado]}
              className="text-xs font-semibold px-3 py-1.5 rounded-full border h-auto data-[state=on]:bg-foreground data-[state=on]:text-background data-[state=on]:border-foreground"
            >
              {ESTADO_LABEL[estado]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {/* Count */}
      <p className="text-sm text-muted-foreground">
        {buildCountLabel(total, estadoFilter)}
      </p>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {visibleCols.has("foto") && <TableHead className="w-12"></TableHead>}
              {visibleCols.has("nombre") && <TableHead>Persona</TableHead>}
              {visibleCols.has("estado") && (
                <TableHead className="hidden sm:table-cell">Estado</TableHead>
              )}
              {visibleCols.has("fecha_inscripcion") && (
                <TableHead className="hidden md:table-cell">Inscripción</TableHead>
              )}
              {visibleCols.has("notas") && (
                <TableHead className="hidden lg:table-cell">Notas</TableHead>
              )}
              {isAdmin && <TableHead className="text-right">Acciones</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell
                  colSpan={colCount}
                  className="text-center py-8 text-muted-foreground"
                >
                  Cargando...
                </TableCell>
              </TableRow>
            ) : enrollments.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={colCount}
                  className="text-center py-8 text-muted-foreground"
                >
                  No hay personas inscritas
                </TableCell>
              </TableRow>
            ) : (
              enrollments.map((enrollment) => (
                <TableRow key={enrollment.id}>
                  {/* Avatar / Foto */}
                  {visibleCols.has("foto") && (
                    <TableCell className="w-12 pr-0">
                      <Avatar className="h-8 w-8">
                        <AvatarImage
                          src={enrollment.persons.foto_perfil_url ?? undefined}
                          alt={`${enrollment.persons.nombre} ${enrollment.persons.apellidos}`}
                        />
                        <AvatarFallback className="text-xs bg-accent text-accent-foreground">
                          {getInitials(
                            enrollment.persons.nombre ?? "",
                            enrollment.persons.apellidos ?? ""
                          )}
                        </AvatarFallback>
                      </Avatar>
                    </TableCell>
                  )}

                  {/* Nombre */}
                  {visibleCols.has("nombre") && (
                    <TableCell>
                      <Link
                        href={`/personas/${enrollment.persons.id}`}
                        className="hover:underline font-medium text-sm"
                      >
                        {enrollment.persons.apellidos}, {enrollment.persons.nombre}
                      </Link>
                      {enrollment.persons.restricciones_alimentarias && (
                        <p className="text-xs text-amber-600 mt-0.5">
                          ⚠ {enrollment.persons.restricciones_alimentarias}
                        </p>
                      )}
                    </TableCell>
                  )}

                  {/* Estado */}
                  {visibleCols.has("estado") && (
                    <TableCell className="hidden sm:table-cell">
                      <Badge
                        variant={ESTADO_BADGE_VARIANT[enrollment.estado]}
                        className="text-xs"
                      >
                        {ESTADO_LABEL[enrollment.estado] ?? enrollment.estado}
                      </Badge>
                    </TableCell>
                  )}

                  {/* Fecha inscripción */}
                  {visibleCols.has("fecha_inscripcion") && (
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                      {enrollment.fecha_inicio
                        ? new Date(enrollment.fecha_inicio).toLocaleDateString("es-ES")
                        : "—"}
                    </TableCell>
                  )}

                  {/* Notas */}
                  {visibleCols.has("notas") && (
                    <TableCell className="hidden lg:table-cell text-sm text-muted-foreground max-w-[200px] truncate">
                      {enrollment.notas ?? "—"}
                    </TableCell>
                  )}

                  {/* Acciones (admin only) */}
                  {isAdmin && (
                    <TableCell className="text-right">
                      {enrollment.estado === "activo" && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-muted-foreground hover:text-destructive"
                            >
                              Dar de baja
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>¿Dar de baja?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Se marcará la inscripción de{" "}
                                <strong>
                                  {enrollment.persons.nombre} {enrollment.persons.apellidos}
                                </strong>{" "}
                                como completada. Esta acción no se puede deshacer.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() =>
                                  unenroll.mutate({ enrollmentId: enrollment.id })
                                }
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Dar de baja
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
