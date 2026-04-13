import { useState } from "react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

const ESTADO_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  activo: { label: "Activo", variant: "default" },
  completado: { label: "Completado", variant: "secondary" },
  rechazado: { label: "Rechazado", variant: "destructive" },
  pausado: { label: "Pausado", variant: "outline" },
};

const ALL_COLUMNS = ["foto", "nombre", "estado", "fecha_inscripcion", "notas"] as const;
type ColumnKey = typeof ALL_COLUMNS[number];

function getInitials(nombre: string | null, apellidos: string | null): string {
  const n = (nombre ?? '').charAt(0);
  const a = (apellidos ?? '').charAt(0);
  return `${n}${a}`.toUpperCase() || '?';
}

export function EnrolledPersonsTable({ programId, isAdmin, volunteerVisibleFields = [] }: EnrolledPersonsTableProps) {
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

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Input
          placeholder="Buscar por nombre..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="sm:max-w-xs"
        />
        <div className="flex gap-2">
          {(["activo", "completado", "rechazado"] as EnrollmentEstado[]).map((estado) => (
            <Button
              key={estado}
              variant={estadoFilter === estado ? "default" : "outline"}
              size="sm"
              onClick={() => setEstadoFilter(estadoFilter === estado ? undefined : estado)}
              className="capitalize"
            >
              {ESTADO_BADGE[estado].label}
            </Button>
          ))}
        </div>
      </div>

      {/* Count */}
      <p className="text-sm text-muted-foreground">
        {total} persona{total !== 1 ? "s" : ""} inscrita{total !== 1 ? "s" : ""}
        {estadoFilter ? ` (${ESTADO_BADGE[estadoFilter].label.toLowerCase()})` : ""}
      </p>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {visibleCols.has("foto") && <TableHead className="w-12"></TableHead>}
              {visibleCols.has("nombre") && <TableHead>Persona</TableHead>}
              {visibleCols.has("estado") && <TableHead className="hidden sm:table-cell">Estado</TableHead>}
              {visibleCols.has("fecha_inscripcion") && <TableHead className="hidden md:table-cell">Inscripción</TableHead>}
              {visibleCols.has("notas") && <TableHead className="hidden lg:table-cell">Notas</TableHead>}
              {isAdmin && <TableHead className="text-right">Acciones</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={colCount} className="text-center py-8 text-muted-foreground">
                  Cargando...
                </TableCell>
              </TableRow>
            ) : enrollments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colCount} className="text-center py-8 text-muted-foreground">
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
                        <AvatarFallback className="text-xs bg-muted">
                          {getInitials(enrollment.persons.nombre ?? '', enrollment.persons.apellidos ?? '')}
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
                      <Badge variant={ESTADO_BADGE[enrollment.estado].variant} className="text-xs">
                        {ESTADO_BADGE[enrollment.estado].label}
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
                            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive">
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
