import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useCreateReparto } from "../hooks/useReparto";
import { CrearRepartoSchema } from "../schemas";

interface Props {
  programId: string;
  onCreated: (roundId: string) => void;
}

const FIELDS = [
  { k: "kg_total_alimentos", label: "Kg totales de alimentos", type: "number" },
  { k: "kg_total_carne", label: "Kg totales de carne", type: "number" },
  { k: "num_albaran_ba", label: "Nº albarán Banco de Alimentos", type: "text" },
  { k: "num_factura_carne", label: "Nº factura de la carne", type: "text" },
] as const;

/** Operator inputs that generate the Hoja de Firmas + day split. */
export function CrearRepartoForm({ programId, onCreated }: Props) {
  const createReparto = useCreateReparto();
  const [form, setForm] = useState({
    nombre: "",
    fecha_inicio: "",
    dias_reparto: "3",
    cap_per_day: "",
    kg_total_alimentos: "",
    kg_total_carne: "",
    num_albaran_ba: "",
    num_factura_carne: "",
  });

  const set = (k: keyof typeof form) => (v: string) => setForm((p) => ({ ...p, [k]: v }));
  const num = (v: string) => (v.trim() === "" ? undefined : Number(v));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = CrearRepartoSchema.safeParse({
      program_id: programId,
      nombre: form.nombre,
      fecha_inicio: form.fecha_inicio,
      dias_reparto: Number(form.dias_reparto),
      cap_per_day: num(form.cap_per_day) ?? null,
      kg_total_alimentos: num(form.kg_total_alimentos) ?? null,
      kg_total_carne: num(form.kg_total_carne) ?? null,
      num_albaran_ba: form.num_albaran_ba || undefined,
      num_factura_carne: form.num_factura_carne || undefined,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Datos inválidos");
      return;
    }
    try {
      const round = await createReparto.mutateAsync(parsed.data);
      toast.success("Reparto creado en borrador");
      if (round?.id) onCreated(round.id);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al crear el reparto");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="reparto-nombre">Nombre (p. ej. «Hoja de Firmas Mayo 2026») *</Label>
        <Input id="reparto-nombre" value={form.nombre} onChange={(e) => set("nombre")(e.target.value)} required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="reparto-inicio">Fecha de inicio *</Label>
          <Input id="reparto-inicio" type="date" value={form.fecha_inicio} onChange={(e) => set("fecha_inicio")(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="reparto-dias">Días de reparto *</Label>
          <Input id="reparto-dias" type="number" min={1} max={31} value={form.dias_reparto} onChange={(e) => set("dias_reparto")(e.target.value)} required />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="reparto-cap">Cupo de personas por día (opcional)</Label>
        <Input id="reparto-cap" type="number" min={1} value={form.cap_per_day} onChange={(e) => set("cap_per_day")(e.target.value)} placeholder="sin límite" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {FIELDS.map((f) => (
          <div key={f.k} className="space-y-1.5">
            <Label htmlFor={`reparto-${f.k}`}>{f.label}</Label>
            <Input
              id={`reparto-${f.k}`}
              type={f.type}
              value={form[f.k]}
              onChange={(e) => set(f.k)(e.target.value)}
            />
          </div>
        ))}
      </div>
      <Button type="submit" className="w-full" disabled={createReparto.isPending}>
        {createReparto.isPending ? "Creando…" : "Crear reparto"}
      </Button>
    </form>
  );
}
