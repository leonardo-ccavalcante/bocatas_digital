import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useCreateReparto, useEligibleFamilies } from "../hooks/useReparto";
import { daysInMonth, weekdayLongOf } from "../utils/calendar";
import { RepartoDaySlotRow } from "./RepartoDaySlotRow";
import { RepartoExtrasFields } from "./RepartoExtrasFields";
import { RepartoFamiliasIncluidas } from "./RepartoFamiliasIncluidas";
import { RepartoFueraMadrid } from "./RepartoFueraMadrid";
import { RepartoMonthGrid } from "./RepartoMonthGrid";
import { RepartoResumenDialog, type ResumenSlot } from "./RepartoResumenDialog";
import type { Turno } from "../schemas";

interface Props {
  programId: string;
  onCreated: (roundId: string) => void;
}

interface DayConfig {
  manana: boolean;
  tarde: boolean;
}

const parseNum = (v: string) => (v.trim() === "" ? undefined : Number(v));
const slotKey = (date: string, turno: Turno) => `${date}#${turno}`;

type TurnoMode = "manana" | "tarde" | "ambos";

/** Operator form: pick a month, then specific days (mañana/tarde/ambos per day).
 *  ALL active families are included automatically — no total-personas or per-slot
 *  cupo input. The first slot can be reserved for fuera-de-Madrid families.
 *  Calls createRound with cap:null (reference-only); the server activates later. */
export function CrearRepartoForm({ programId, onCreated }: Props) {
  const createReparto = useCreateReparto();
  const { data: eligibleFamilies, isLoading: familiesLoading } = useEligibleFamilies(programId);

  const [nombre, setNombre] = useState("");
  const [yearMonth, setYearMonth] = useState("");
  const [dayConfigs, setDayConfigs] = useState<Record<string, DayConfig>>({});
  const [fueraMadridOn, setFueraMadridOn] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [kgAlimentos, setKgAlimentos] = useState("");
  const [kgCarne, setKgCarne] = useState("");
  const [albaranes, setAlbaranes] = useState<string[]>([]);
  const [facturas, setFacturas] = useState<string[]>([]);

  const totalFamilias = eligibleFamilies?.length ?? 0;
  const totalPersonas = useMemo(
    () => (eligibleFamilies ?? []).reduce((s, f) => s + f.total_miembros, 0),
    [eligibleFamilies],
  );

  const days = useMemo(() => daysInMonth(yearMonth), [yearMonth]);
  const selectedDays = useMemo(() => days.filter((d) => !!dayConfigs[d]).sort(), [days, dayConfigs]);
  const tooManyDays = selectedDays.length > 10;

  const slotList = useMemo(() => {
    const arr: { key: string; date: string; turno: Turno }[] = [];
    for (const date of selectedDays) {
      const cfg = dayConfigs[date];
      if (cfg.manana) arr.push({ key: slotKey(date, "manana"), date, turno: "manana" });
      if (cfg.tarde) arr.push({ key: slotKey(date, "tarde"), date, turno: "tarde" });
    }
    return arr;
  }, [selectedDays, dayConfigs]);

  // The first slot is reserved for fuera-de-Madrid families when the toggle is on.
  const fueraKey = fueraMadridOn && slotList.length > 0 ? slotList[0].key : null;

  const blockReason = ((): string | null => {
    if (!nombre.trim()) return "Ponle un nombre al reparto";
    if (slotList.length === 0) return "Selecciona al menos un día y turno";
    if (tooManyDays) return "Máximo 10 días de reparto";
    return null;
  })();
  const canPreview = slotList.length > 0 && !tooManyDays;

  const resumen = useMemo<ResumenSlot[]>(
    () =>
      slotList.map((s) => ({
        key: s.key,
        weekday: weekdayLongOf(s.date),
        dayNum: parseInt(s.date.split("-")[2], 10),
        turno: s.turno,
        esFueraMadrid: s.key === fueraKey,
      })),
    [slotList, fueraKey],
  );

  const toggleDay = (date: string) => {
    setDayConfigs((prev) => {
      if (prev[date]) {
        const next = { ...prev };
        delete next[date];
        return next;
      }
      return { ...prev, [date]: { manana: true, tarde: false } };
    });
  };

  const setTurno = (date: string, mode: TurnoMode) => {
    const manana = mode === "manana" || mode === "ambos";
    const tarde = mode === "tarde" || mode === "ambos";
    setDayConfigs((prev) => ({ ...prev, [date]: { manana, tarde } }));
  };

  // Caps are reference-only under the new model — send null so the server treats
  // every slot as uncapped when distributing families.
  const buildSlots = () =>
    slotList.map((s) => ({
      slot_date: s.date,
      turno: s.turno,
      cap: null as null,
      es_fuera_madrid: s.key === fueraKey,
    }));

  const doCreate = async () => {
    if (blockReason) { toast.error(blockReason); return; }
    const cleanAlbaranes = albaranes.map((s) => s.trim()).filter(Boolean).slice(0, 4);
    const cleanFacturas = facturas.map((s) => s.trim()).filter(Boolean).slice(0, 4);
    try {
      const round = await createReparto.mutateAsync({
        program_id: programId,
        nombre,
        slots: buildSlots(),
        kg_total_alimentos: parseNum(kgAlimentos) ?? null,
        kg_total_carne: parseNum(kgCarne) ?? null,
        num_albaran_ba: cleanAlbaranes.length ? cleanAlbaranes : undefined,
        num_factura_carne: cleanFacturas.length ? cleanFacturas : undefined,
        logos: [],
      });
      toast.success("Reparto creado en borrador");
      setPreviewOpen(false);
      if (round?.id) onCreated(round.id);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al crear el reparto");
    }
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); void doCreate(); }} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="reparto-nombre">Nombre (p. ej. «Hoja de Firmas Mayo 2026») *</Label>
        <Input id="reparto-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="reparto-mes">Mes de reparto *</Label>
        <Input
          id="reparto-mes"
          type="month"
          value={yearMonth}
          onChange={(e) => { setYearMonth(e.target.value); setDayConfigs({}); }}
          required
        />
      </div>

      <RepartoFamiliasIncluidas
        familias={totalFamilias}
        personas={totalPersonas}
        isLoading={familiesLoading}
      />

      {days.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>
              Días de reparto (máx. 10)
              {tooManyDays && <span className="ml-1 text-destructive"> — demasiados días</span>}
            </Label>
            {selectedDays.length > 0 && (
              <Badge variant="secondary">
                {selectedDays.length} día{selectedDays.length !== 1 ? "s" : ""}
              </Badge>
            )}
          </div>
          <RepartoMonthGrid days={days} isSelected={(d) => !!dayConfigs[d]} onToggle={toggleDay} />
        </div>
      )}

      {slotList.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Turnos por día</Label>
            <Badge variant="secondary">
              {slotList.length} turno{slotList.length !== 1 ? "s" : ""}
            </Badge>
          </div>

          <RepartoFueraMadrid
            enabled={fueraMadridOn}
            onToggle={() => setFueraMadridOn((v) => !v)}
          />

          {selectedDays.map((date) => {
            const cfg = dayConfigs[date];
            return (
              <RepartoDaySlotRow
                key={date}
                date={date}
                mananaActive={cfg.manana}
                tardeActive={cfg.tarde}
                mananaFuera={fueraKey === slotKey(date, "manana")}
                tardeFuera={fueraKey === slotKey(date, "tarde")}
                onSetTurno={(mode) => setTurno(date, mode)}
              />
            );
          })}
        </div>
      )}

      <RepartoExtrasFields
        kgAlimentos={kgAlimentos}
        kgCarne={kgCarne}
        albaranes={albaranes}
        facturas={facturas}
        onKgAlimentos={setKgAlimentos}
        onKgCarne={setKgCarne}
        onAlbaranes={setAlbaranes}
        onFacturas={setFacturas}
      />

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={!canPreview}
          onClick={() => setPreviewOpen(true)}
        >
          Visualizar
        </Button>
        <Button type="submit" className="w-full" disabled={createReparto.isPending}>
          {createReparto.isPending ? "Creando…" : "Crear reparto"}
        </Button>
      </div>

      <RepartoResumenDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        nombre={nombre}
        slots={resumen}
        blockReason={blockReason}
        isPending={createReparto.isPending}
        onConfirm={() => void doCreate()}
      />
    </form>
  );
}
