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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  UserPlus, Clock, CheckCircle2, Timer, UserCheck,
  PauseCircle, UserX, CheckCircle, XCircle,
} from "lucide-react";
import { ESTADO_LABELS, ESTADOS_CATALOGO } from "@shared/programEstados";
import { useEnrollments } from "../hooks/useEnrollment";
import { filterVisibleColumns } from "../utils/volunteerVisibility";
import { buildGrupoQuery } from "@/lib/volverNav";
import { Checkbox } from "@/components/ui/checkbox";
import { EnrollmentRowActions } from "./EnrollmentRowActions";
import { EnrollmentsContactoToolbar } from "./EnrollmentsContactoToolbar";
import { BulkEstadoBar } from "./BulkEstadoBar";
import {
  alternarSeleccion,
  seleccionVisible,
  estanTodosSeleccionados,
} from "../utils/enrollmentSeleccion";
import type { EnrollmentEstado } from "../schemas";

interface EnrolledPersonsTableProps {
  programId: string;
  /** Slug del programa — la ficha lo usa para «volver» aquí (?volver=…). */
  programSlug?: string;
  /** Nombre visible del programa — rótulo del enlace «volver». */
  programName?: string;
  isAdmin?: boolean;
  volunteerVisibleFields?: string[];
  /** Program's enabled enrollment states (from programs.estados_habilitados). */
  estadosHabilitados?: string[];
}

// ─── Legacy label map — kept for backwards-compat with exported buildCountLabel ─
export const ESTADO_LABEL: Record<string, string> = {
  activo: "Activos",
  terminado: "Terminados",
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
    (estadoFilter ? ` (${ESTADO_LABEL[estadoFilter]?.toLowerCase() ?? estadoFilter})` : "")
  );
}

/**
 * Chips de filtro: estados habilitados del programa + 'completado' legacy.
 * 'terminado' y 'completado' comparten etiqueta («Terminado», ESTADO_LABELS):
 * con 'terminado' habilitado se omite el alias legacy, que duplicaba el chip.
 */
export function buildFilterStates(estadosHabilitados: string[]): EnrollmentEstado[] {
  const conTerminado = estadosHabilitados.includes("terminado");
  return [
    ...new Set([
      ...estadosHabilitados.filter(
        (e) =>
          (ESTADOS_CATALOGO as readonly string[]).includes(e) &&
          !(e === "completado" && conTerminado)
      ),
      ...(conTerminado ? [] : ["completado"]),
    ]),
  ] as EnrollmentEstado[];
}

// ─── Estado chip config (WCAG: icon + text, never color alone) ────────────────
type ChipStyle = { icon: React.ReactNode; className: string };

const CHIP_CONFIG: Record<string, ChipStyle> = {
  inscrito:       { icon: <UserPlus className="w-3 h-3" />,   className: "bg-blue-100 text-blue-800 border-blue-200" },
  preseleccionado:{ icon: <Clock className="w-3 h-3" />,       className: "bg-amber-100 text-amber-800 border-amber-200" },
  admitido:       { icon: <CheckCircle2 className="w-3 h-3" />,className: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  lista_espera:   { icon: <Timer className="w-3 h-3" />,       className: "bg-orange-100 text-orange-800 border-orange-200" },
  activo:         { icon: <UserCheck className="w-3 h-3" />,   className: "bg-green-100 text-green-800 border-green-200" },
  pausado:        { icon: <PauseCircle className="w-3 h-3" />, className: "bg-gray-100 text-gray-700 border-gray-200" },
  baja:           { icon: <UserX className="w-3 h-3" />,       className: "bg-red-100 text-red-800 border-red-200" },
  terminado:      { icon: <CheckCircle className="w-3 h-3" />, className: "bg-slate-100 text-slate-600 border-slate-200" },
  completado:     { icon: <CheckCircle className="w-3 h-3" />, className: "bg-slate-100 text-slate-600 border-slate-200" },
  rechazado:      { icon: <XCircle className="w-3 h-3" />,     className: "bg-red-100 text-red-700 border-red-200" },
};

/**
 * Estado del filtro al abrir la tabla: ninguno, es decir «Todos».
 *
 * Antes arrancaba en 'activo'. Pero cada programa declara sus propios
 * `estados_habilitados`, y un curso de formación no habilita 'activo' — su
 * embudo es inscrito → preseleccionado → admitido → … Resultado: la tabla pedía
 * al servidor un estado que ese programa no usa y devolvía cero, así que un
 * curso con 23 personas inscritas se veía como «0 (activo)».
 *
 * Se exporta para que el test lea el valor real en vez de replicarlo.
 */
export const ESTADO_FILTRO_INICIAL: EnrollmentEstado | undefined = undefined;

const ALL_COLUMNS = ["foto", "nombre", "estado", "fecha_inscripcion", "notas"] as const;
type ColumnKey = (typeof ALL_COLUMNS)[number];

function getInitials(nombre: string | null, apellidos: string | null): string {
  const n = (nombre ?? "").charAt(0);
  const a = (apellidos ?? "").charAt(0);
  return `${n}${a}`.toUpperCase() || "?";
}

function EstadoChip({ estado }: { estado: string }) {
  const cfg = CHIP_CONFIG[estado];
  const label = ESTADO_LABELS[estado as keyof typeof ESTADO_LABELS] ?? estado;
  if (!cfg) return <Badge variant="outline" className="text-xs">{label}</Badge>;
  return (
    <Badge
      variant="outline"
      className={`text-xs flex items-center gap-1 border ${cfg.className}`}
      aria-label={label}
    >
      {cfg.icon}
      {label}
    </Badge>
  );
}

export function EnrolledPersonsTable({
  programId,
  programSlug,
  programName,
  isAdmin,
  volunteerVisibleFields = [],
  estadosHabilitados = [],
}: EnrolledPersonsTableProps) {
  // Contexto de origen para la ficha: «volver» a este programa + navegación
  // anterior/siguiente dentro del grupo (?grupo=). PersonaDetalle sanea `volver`.
  const fichaQuery = programSlug
    ? buildGrupoQuery(programId, `/programas/${programSlug}`, programName)
    : "";
  const [search, setSearch] = useState("");
  const [estadoFilter, setEstadoFilter] = useState<EnrollmentEstado | undefined>(
    ESTADO_FILTRO_INICIAL
  );
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());

  const filterStates = buildFilterStates(estadosHabilitados);

  const { enrollments, total, isLoading } = useEnrollments(programId, {
    estado: estadoFilter,
    search: search.length >= 2 ? search : undefined,
  });

  const visibleCols = new Set<ColumnKey>(
    filterVisibleColumns([...ALL_COLUMNS], volunteerVisibleFields, !!isAdmin) as ColumnKey[]
  );

  // Sólo se manda al servidor lo marcado que SIGUE en la página: al cambiar
  // el filtro las filas viejas ya no se ven y no pueden viajar en la mutación.
  const idsVisibles = enrollments.map((e) => e.id);
  const seleccionados = seleccionVisible(seleccion, idsVisibles);
  const todosMarcados = estanTodosSeleccionados(seleccion, idsVisibles);

  const colCount = visibleCols.size + (isAdmin ? 2 : 0);

  return (
    <div className="space-y-4">
      {/* Search + Estado filter */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <Input
          placeholder="Buscar por nombre..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="sm:max-w-xs"
          aria-label="Buscar persona inscrita"
        />
        <div className="flex flex-wrap gap-1" role="group" aria-label="Filtrar por estado">
          <Button
            size="sm"
            variant={estadoFilter === undefined ? "default" : "outline"}
            onClick={() => setEstadoFilter(undefined)}
            className="text-xs h-8 rounded-full"
          >
            Todos
          </Button>
          {filterStates.map((e) => (
            <Button
              key={e}
              size="sm"
              variant={estadoFilter === e ? "default" : "outline"}
              onClick={() => setEstadoFilter(e as EnrollmentEstado)}
              className="text-xs h-8 rounded-full"
            >
              {ESTADO_LABELS[e as keyof typeof ESTADO_LABELS] ?? e}
            </Button>
          ))}
        </div>
      </div>

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {buildCountLabel(total, estadoFilter)}
      </p>

      {isAdmin && enrollments.length > 0 && (
        <EnrollmentsContactoToolbar
          personas={enrollments.map((e) => e.persons)}
          total={total}
        />
      )}

      {isAdmin && (
        <BulkEstadoBar
          programId={programId}
          seleccionados={seleccionados}
          estadosHabilitados={estadosHabilitados}
          onHecho={() => setSeleccion(new Set())}
        />
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {isAdmin && (
                <TableHead className="w-10">
                  <Checkbox
                    checked={todosMarcados}
                    onCheckedChange={() =>
                      setSeleccion(todosMarcados ? new Set() : new Set(idsVisibles))
                    }
                    aria-label="Seleccionar todas las inscripciones de esta página"
                  />
                </TableHead>
              )}
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
                  {isAdmin && (
                    <TableCell className="w-10">
                      <Checkbox
                        checked={seleccion.has(enrollment.id)}
                        onCheckedChange={() =>
                          setSeleccion((previa) => alternarSeleccion(previa, enrollment.id))
                        }
                        aria-label={`Seleccionar a ${enrollment.persons.nombre} ${enrollment.persons.apellidos}`}
                      />
                    </TableCell>
                  )}
                  {visibleCols.has("foto") && (
                    <TableCell className="w-12 pr-0">
                      <Avatar className="h-8 w-8">
                        <AvatarImage
                          src={enrollment.persons.foto_perfil_url ?? undefined}
                          alt={`${enrollment.persons.nombre} ${enrollment.persons.apellidos}`}
                        />
                        <AvatarFallback className="text-xs bg-accent text-accent-foreground">
                          {getInitials(enrollment.persons.nombre ?? "", enrollment.persons.apellidos ?? "")}
                        </AvatarFallback>
                      </Avatar>
                    </TableCell>
                  )}

                  {visibleCols.has("nombre") && (
                    <TableCell>
                      <Link
                        href={`/personas/${enrollment.persons.id}${fichaQuery}`}
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

                  {visibleCols.has("estado") && (
                    <TableCell className="hidden sm:table-cell">
                      <EstadoChip estado={enrollment.estado} />
                    </TableCell>
                  )}

                  {visibleCols.has("fecha_inscripcion") && (
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                      {enrollment.fecha_inicio
                        ? new Date(enrollment.fecha_inicio).toLocaleDateString("es-ES")
                        : "—"}
                    </TableCell>
                  )}

                  {visibleCols.has("notas") && (
                    <TableCell className="hidden lg:table-cell text-sm text-muted-foreground max-w-[200px] truncate">
                      {enrollment.notas ?? "—"}
                    </TableCell>
                  )}

                  {isAdmin && (
                    <TableCell className="text-right">
                      <EnrollmentRowActions
                        enrollmentId={enrollment.id}
                        personName={`${enrollment.persons.nombre} ${enrollment.persons.apellidos}`}
                        currentEstado={enrollment.estado}
                        estadosHabilitados={estadosHabilitados}
                        programId={programId}
                      />
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
