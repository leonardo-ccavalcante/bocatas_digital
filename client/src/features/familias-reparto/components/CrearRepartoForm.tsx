import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useCreateReparto } from "../hooks/useReparto";
import { distributeTargets } from "../utils/assignReparto";
import { daysInMonth, weekdayLongOf } from "../utils/calendar";
import { RepartoAvisos } from "./RepartoAvisos";
import { RepartoDaySlotRow } from "./RepartoDaySlotRow";
import { RepartoExtrasFields } from "./RepartoExtrasFields";
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

/** Operator form: enter how many people to serve, pick specific days of a month
 *  (mañana/tarde/ambos per day), and let the total split equally across the
 *  resulting (día × turno) slots. Fixing one slot rebalances the rest; each
 *  slot's number becomes its cupo. The first slot can be reserved for people
 *  from outside Madrid. Builds slots[] and calls createRound. */
export function CrearRepartoForm({ programId, onCreated }: Props) {
  const createReparto = useCreateReparto();
  const [nombre, setNombre] = useState("");
  const [yearMonth, setYearMonth] = useState("");
  const [totalPersonas, setTotalPersonas] = useState("");
  const [dayConfigs, setDayConfigs] = useState<Record<string, DayConfig>>({});
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [fueraMadridOn, setFueraMadridOn] = useState(false);
  const [fueraMadridCount, setFueraMadridCount] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [kgAlimentos, setKgAlimentos] = useState("");
  const [kgCarne, setKgCarne] = useState("");
  const [albaranes, setAlbaranes] = useState<string[]>([]);
  const [facturas, setFacturas] = useState<string[]>([]);

  const totalNum = parseNum(totalPersonas);
  const hasTotal = totalNum != null && Number.isFinite(totalNum) && totalNum > 0;

  const days = useMemo(() => daysInMonth(yearMonth), [yearMonth]);
  const selectedDays = useMemo(() => days.filter((d) => !!dayConfigs[d]).sort(), [days, dayConfigs]);
  const tooManyDays = selectedDays.length > 10;

  // Ordered slot list — by date, then turno (mañana before tarde). This is the
  // exact order the DB assigns ordinals, so the equal split lines up 1:1.
  const slotList = useMemo(() => {
    const arr: { key: string; date: string; turno: Turno }[] = [];
    for (const date of selectedDays) {
      const cfg = dayConfigs[date];
      if (cfg.manana) arr.push({ key: slotKey(date, "manana"), date, turno: "manana" });
      if (cfg.tarde) arr.push({ key: slotKey(date, "tarde"), date, turno: "tarde" });
    }
    return arr;
  }, [selectedDays, dayConfigs]);

  // Fuera-de-Madrid reserves the FIRST slot: its people = the fuera count (fixed),
  // the rest rebalance around it. It's just an override the engine already handles.
  const fueraKey = fueraMadridOn && slotList.length > 0 ? slotList[0].key : null;
  const fueraOverride = Math.max(0, Math.floor(parseNum(fueraMadridCount) || 0));

  const distribution = useMemo(
    () =>
      distributeTargets(
        totalNum ?? 0,
        slotList.map((s) => ({
          key: s.key,
          override: s.key === fueraKey ? fueraOverride : overrides[s.key] ?? null,
        })),
      ),
    [totalNum, slotList, overrides, fueraKey, fueraOverride],
  );
  const peopleByKey = useMemo(
    () => new Map(distribution.slots.map((s) => [s.key, s.people])),
    [distribution],
  );
  const hasZeroSlot = slotList.length > 0 && distribution.slots.some((s) => s.people < 1);

  // Single source of validity — the toast reason, the disabled state and the
  // preview-dialog gate all read this.
  const blockReason = ((): string | null => {
    if (!nombre.trim()) return "Ponle un nombre al reparto";
    if (!hasTotal) return "Indica cuántas personas vas a atender";
    if (slotList.length === 0) return "Selecciona al menos un día y turno";
    if (tooManyDays) return "Máximo 10 días de reparto";
    if (fueraKey && fueraOverride < 1) return "Indica cuántas personas de fuera de Madrid";
    if (distribution.overCommitted) return "Los cupos fijados superan el total. Bájalos o sube el total";
    if (hasZeroSlot) return "Hay turnos con 0 personas. Sube el total o quita turnos";
    return null;
  })();
  const canPreview = hasTotal && slotList.length > 0 && !tooManyDays;

  const resumen = useMemo<ResumenSlot[]>(
    () =>
      slotList.map((s) => ({
        key: s.key,
        weekday: weekdayLongOf(s.date),
        dayNum: parseInt(s.date.split("-")[2], 10),
        turno: s.turno,
        people: peopleByKey.get(s.key) ?? 0,
        esFueraMadrid: s.key === fueraKey,
      })),
    [slotList, peopleByKey, fueraKey],
  );

  const toggleDay = (date: string) => {
    const wasSelected = !!dayConfigs[date];
    setDayConfigs((prev) => {
      if (prev[date]) {
        const next = { ...prev };
        delete next[date];
        return next;
      }
      return { ...prev, [date]: { manana: true, tarde: false } };
    });
    if (wasSelected) {
      setOverrides((prev) => {
        const next = { ...prev };
        delete next[slotKey(date, "manana")];
        delete next[slotKey(date, "tarde")];
        return next;
      });
    }
  };

  const setTurno = (date: string, mode: TurnoMode) => {
    const manana = mode === "manana" || mode === "ambos";
    const tarde = mode === "tarde" || mode === "ambos";
    setDayConfigs((prev) => ({ ...prev, [date]: { manana, tarde } }));
    setOverrides((prev) => {
      const next = { ...prev };
      if (!manana) delete next[slotKey(date, "manana")];
      if (!tarde) delete next[slotKey(date, "tarde")];
      return next;
    });
  };

  const setOverride = (key: string, raw: string) =>
    setOverrides((prev) => {
      const next = { ...prev };
      const n = parseNum(raw);
      if (n == null || !Number.isFinite(n)) delete next[key];
      else next[key] = Math.max(0, Math.floor(n));
      return next;
    });

  const buildSlots = () =>
    slotList.map((s) => ({
      slot_date: s.date,
      turno: s.turno,
      cap: peopleByKey.get(s.key) ?? 0,
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
          onChange={(e) => { setYearMonth(e.target.value); setDayConfigs({}); setOverrides({}); }}
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="reparto-total">Total de personas a atender *</Label>
        <Input
          id="reparto-total"
          type="number"
          min={1}
          step={1}
          placeholder="p. ej. 200"
          value={totalPersonas}
          onChange={(e) => setTotalPersonas(e.target.value)}
          required
        />
        <p className="text-xs text-muted-foreground">
          Se reparten a partes iguales entre los turnos que elijas.
        </p>
      </div>

      {hasTotal && (
        <RepartoFueraMadrid
          enabled={fueraMadridOn}
          count={fueraMadridCount}
          onToggle={() => setFueraMadridOn((v) => !v)}
          onCount={setFueraMadridCount}
        />
      )}

      {days.length > 0 && !hasTotal && (
        <p className="text-sm text-muted-foreground">
          Primero indica cuántas personas vas a atender para elegir los días.
        </p>
      )}

      {days.length > 0 && hasTotal && (
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

      {hasTotal && slotList.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Turnos y personas por día</Label>
            <Badge variant="secondary">
              {slotList.length} turno{slotList.length !== 1 ? "s" : ""}
            </Badge>
          </div>

          <RepartoAvisos
            total={totalNum ?? 0}
            overCommitted={distribution.overCommitted}
            hasZeroSlot={hasZeroSlot}
            leftover={distribution.leftover}
          />

          {selectedDays.map((date) => {
            const cfg = dayConfigs[date];
            return (
              <RepartoDaySlotRow
                key={date}
                date={date}
                mananaActive={cfg.manana}
                tardeActive={cfg.tarde}
                mananaPeople={peopleByKey.get(slotKey(date, "manana")) ?? 0}
                tardePeople={peopleByKey.get(slotKey(date, "tarde")) ?? 0}
                mananaFixed={overrides[slotKey(date, "manana")] != null}
                tardeFixed={overrides[slotKey(date, "tarde")] != null}
                mananaFuera={fueraKey === slotKey(date, "manana")}
                tardeFuera={fueraKey === slotKey(date, "tarde")}
                onSetTurno={(mode) => setTurno(date, mode)}
                onSetPersonas={(turno, raw) => setOverride(slotKey(date, turno), raw)}
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
        total={totalNum ?? 0}
        slots={resumen}
        blockReason={blockReason}
        isPending={createReparto.isPending}
        onConfirm={() => void doCreate()}
      />
    </form>
  );
}
