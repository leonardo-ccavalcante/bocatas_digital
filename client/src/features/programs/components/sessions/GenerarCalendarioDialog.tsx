/**
 * GenerarCalendarioDialog.tsx — el modal del botón «Generar calendario».
 *
 * Antes: el botón llamaba generarSesiones({ programId }) a ciegas y el servidor
 * leía programs.config.programacion — una configuración que NINGUNA pantalla
 * permitía editar. En producción (2026-09-01) ningún programa la tenía: pulsar
 * el botón creaba cero sesiones sin decir por qué.
 *
 * Ahora: rango de fechas + franjas semanales + ubicación, con la previsualización
 * de lo que se va a crear ANTES de confirmar. Al confirmar se guarda la
 * configuración con programs.update y SÓLO entonces se llama a generarSesiones
 * — que lee la config de la base, no del formulario.
 *
 * Sustituye a la sección 2 del runbook 2026-09-01-operaciones-post-reunion.md.
 */
import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import {
  DIA_SEMANA_LABELS,
  ProgramacionSchema,
  type ProgramacionSlot,
} from "@shared/sessionSchemas";
import { resumirCalendario, validarCalendario } from "@shared/sessionCalendario";

interface GenerarCalendarioDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  programId: string;
  /** Fechas que ya tienen sesión — el servidor las salta; la previsualización también. */
  fechasExistentes: string[];
}

const FRANJA_NUEVA: ProgramacionSlot = { dia_semana: 1, hora_inicio: "09:00", hora_fin: "13:00" };

// Desplegable nativo a propósito: es un formulario de configuración, y así se
// puede accionar en los tests sin los stubs de puntero que exige Radix Select.
const SELECT_CLASS =
  "border-input h-11 w-full rounded-xl border bg-transparent px-4 py-2 text-base shadow-xs outline-none md:text-sm";

export function GenerarCalendarioDialog({
  open,
  onOpenChange,
  programId,
  fechasExistentes,
}: GenerarCalendarioDialogProps) {
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [slots, setSlots] = useState<ProgramacionSlot[]>([FRANJA_NUEVA]);
  const [locationId, setLocationId] = useState("");
  const [errores, setErrores] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);

  const utils = trpc.useUtils();
  const { data: programas = [] } = trpc.programs.getAll.useQuery(undefined, { enabled: open });
  const { data: ubicaciones = [] } = trpc.checkin.getLocations.useQuery(undefined, { enabled: open });
  const update = trpc.programs.update.useMutation();
  const generar = trpc.programs.sessions.generarSesiones.useMutation();

  const programa = programas.find((p) => p.id === programId);

  // Reabrir el modal enseña lo ya guardado, para corregirlo.
  useEffect(() => {
    if (!open || !programa) return;
    const config = (programa.config ?? {}) as Record<string, unknown>;
    const guardada = ProgramacionSchema.safeParse(config.programacion);
    setDesde(programa.fecha_inicio ?? "");
    setHasta(programa.fecha_fin ?? "");
    setSlots(guardada.success && guardada.data.length > 0 ? guardada.data : [FRANJA_NUEVA]);
    setLocationId(typeof config.location_id === "string" ? config.location_id : "");
    setErrores([]);
  }, [open, programa]);

  const resumen = useMemo(
    () => resumirCalendario(desde, hasta, slots, fechasExistentes),
    [desde, hasta, slots, fechasExistentes]
  );

  function actualizarSlot(i: number, cambio: Partial<ProgramacionSlot>) {
    setSlots((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...cambio } : s)));
  }

  async function handleConfirm() {
    const fallos = validarCalendario({ desde, hasta, slots, locationId });
    setErrores(fallos);
    if (fallos.length > 0 || !programa) return;

    // ORDEN OBLIGATORIO. generarSesiones lee programs.config de la base, no de
    // este formulario: si el guardado falla y se generase igual, el calendario
    // saldría con el horario viejo — y corregirlo después es sesión a sesión.
    setEnviando(true);
    try {
      await update.mutateAsync({
        id: programId,
        data: {
          fecha_inicio: desde,
          fecha_fin: hasta,
          config: {
            ...((programa.config ?? {}) as Record<string, unknown>),
            programacion: slots,
            location_id: locationId,
          },
        },
      });
    } catch (err) {
      setEnviando(false);
      toast.error("No se ha guardado el horario — no se ha generado ninguna sesión", {
        description: err instanceof Error ? err.message : undefined,
      });
      return;
    }

    try {
      const res = await generar.mutateAsync({ programId, desde, hasta });
      toast.success(
        `Calendario generado: ${res.created} sesiones nuevas, ${res.skipped} ya existían.`
      );
    } catch (err) {
      // El fallo puede llegar A MEDIO lote (el insert va fecha a fecha):
      // se invalida igual para que el calendario enseñe lo que sí se creó
      // y reabrir el modal lea la config ya guardada.
      await utils.programs.sessions.listSesiones.invalidate({ programId });
      await utils.programs.getAll.invalidate();
      setEnviando(false);
      toast.error("Horario guardado, pero no se han generado las sesiones", {
        description: err instanceof Error ? err.message : undefined,
      });
      return;
    }

    await utils.programs.sessions.listSesiones.invalidate({ programId });
    await utils.programs.getAll.invalidate();
    setEnviando(false);
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      // Mientras se guarda/genera no se cierra ni con Escape ni pinchando
      // fuera — coherente con el botón Cancelar deshabilitado.
      onOpenChange={(o) => {
        if (!o && enviando) return;
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Generar calendario</DialogTitle>
          <DialogDescription>
            Define los días y las horas del curso. Se creará una sesión planificada
            por cada día que coincida.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="calendario-desde">Primer día del curso</Label>
              <Input id="calendario-desde" type="date" value={desde}
                onChange={(e) => setDesde(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="calendario-hasta">Último día del curso</Label>
              <Input id="calendario-hasta" type="date" value={hasta}
                onChange={(e) => setHasta(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium leading-none">Días de clase</p>
            {slots.map((slot, i) => (
              <div key={i} className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <Label htmlFor={`franja-${i}-dia`} className="text-xs text-muted-foreground">Día</Label>
                  <select id={`franja-${i}-dia`} className={SELECT_CLASS} value={slot.dia_semana}
                    onChange={(e) => actualizarSlot(i, { dia_semana: Number(e.target.value) })}>
                    {DIA_SEMANA_LABELS.map((label, dia) => (
                      <option key={dia} value={dia}>{label}</option>
                    ))}
                  </select>
                </div>
                <div className="w-28 space-y-1">
                  <Label htmlFor={`franja-${i}-inicio`} className="text-xs text-muted-foreground">Inicio</Label>
                  <Input id={`franja-${i}-inicio`} type="time" value={slot.hora_inicio}
                    onChange={(e) => actualizarSlot(i, { hora_inicio: e.target.value })} />
                </div>
                <div className="w-28 space-y-1">
                  <Label htmlFor={`franja-${i}-fin`} className="text-xs text-muted-foreground">Fin</Label>
                  <Input id={`franja-${i}-fin`} type="time" value={slot.hora_fin}
                    onChange={(e) => actualizarSlot(i, { hora_fin: e.target.value })} />
                </div>
                <Button type="button" variant="ghost" size="icon"
                  aria-label={`Quitar ${DIA_SEMANA_LABELS[slot.dia_semana]}`}
                  onClick={() => setSlots((prev) => prev.filter((_, idx) => idx !== i))}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" className="gap-1.5"
              onClick={() => setSlots((prev) => [...prev, FRANJA_NUEVA])}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Añadir día
            </Button>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="calendario-ubicacion">
              Ubicación <span className="text-destructive" aria-hidden="true">*</span>
            </Label>
            <select id="calendario-ubicacion" className={SELECT_CLASS} value={locationId}
              aria-required="true"
              onChange={(e) => setLocationId(e.target.value)}>
              <option value="">Selecciona una ubicación…</option>
              {ubicaciones.map((u) => (
                <option key={u.id} value={u.id}>{u.nombre}</option>
              ))}
            </select>
          </div>

          <div className="rounded-lg border bg-muted/30 p-3 text-sm" data-testid="calendario-preview">
            {resumen.nuevas > 0 ? (
              <p>
                Se crearán <strong>{resumen.nuevas} sesiones</strong>, del{" "}
                <strong>{resumen.primera}</strong> al <strong>{resumen.ultima}</strong>.
                {resumen.existentes > 0 &&
                  ` ${resumen.existentes} fechas ya tienen sesión y se respetan.`}
              </p>
            ) : (
              <p className="text-muted-foreground">
                Con esta configuración no se creará ninguna sesión nueva.
              </p>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            Generar no borra nada: las fechas que ya tienen sesión se respetan. Pero
            cambiar el horario después <strong>no reescribe</strong> las sesiones ya
            creadas — habría que corregirlas una a una con «Reprogramar» o cancelarlas.
            Revisa la previsualización antes de confirmar.
          </p>

          {errores.length > 0 && (
            <ul className="space-y-1 text-sm text-destructive" role="alert">
              {errores.map((e) => <li key={e}>{e}</li>)}
            </ul>
          )}

          {!programa && (
            <p className="text-sm text-muted-foreground">
              Cargando la configuración del programa…
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" disabled={enviando}
            onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" disabled={!programa || enviando} onClick={handleConfirm}>
            {enviando ? "Guardando..." : "Guardar y generar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
