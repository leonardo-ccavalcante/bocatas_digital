import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Users } from "lucide-react";
import type { FamilyMember } from "../_shared";

interface Step8FamiliaProps {
  numAdultos: number;
  setNumAdultos: (n: number) => void;
  numMenores: number;
  setNumMenores: (n: number) => void;
  familyMembers: FamilyMember[];
  addFamilyMember: () => void;
  removeFamilyMember: (idx: number) => void;
  updateFamilyMember: (idx: number, field: keyof FamilyMember, value: string) => void;
}

export function Step8Familia({
  numAdultos, setNumAdultos,
  numMenores, setNumMenores,
  familyMembers, addFamilyMember, removeFamilyMember, updateFamilyMember,
}: Step8FamiliaProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
        <Users className="h-5 w-5 text-primary shrink-0" />
        <div>
          <p className="font-medium text-sm">Composición del hogar</p>
          <p className="text-xs text-muted-foreground">
            Esta información es necesaria para el Programa Familias y la distribución de alimentos.
          </p>
        </div>
      </div>

      {/* Counts */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="num_adultos">Adultos (≥18 años) <span className="text-destructive">*</span></Label>
          <Input
            id="num_adultos"
            type="number"
            min={1}
            max={20}
            value={numAdultos}
            onChange={(e) => setNumAdultos(Math.max(1, parseInt(e.target.value) || 1))}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="num_menores">Menores (&lt;18 años)</Label>
          <Input
            id="num_menores"
            type="number"
            min={0}
            max={20}
            value={numMenores}
            onChange={(e) => setNumMenores(Math.max(0, parseInt(e.target.value) || 0))}
          />
        </div>
      </div>

      <p className="text-sm font-medium">
        Total: {numAdultos + numMenores} miembro{numAdultos + numMenores !== 1 ? "s" : ""}
      </p>

      {/* Optional member list */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="font-medium">Miembros del hogar (opcional)</Label>
          <Button type="button" size="sm" variant="outline" onClick={addFamilyMember}>
            <Plus className="mr-1 h-3 w-3" /> Añadir miembro
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Puedes añadir los datos de cada miembro ahora o completarlos más adelante desde el perfil.
        </p>

        {familyMembers.map((member, idx) => (
          <div key={idx} className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Miembro {idx + 1}</p>
              <Button type="button" size="sm" variant="ghost"
                onClick={() => removeFamilyMember(idx)}
                className="h-7 w-7 p-0 text-destructive">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Nombre</Label>
                <Input
                  value={member.nombre}
                  onChange={(e) => updateFamilyMember(idx, "nombre", e.target.value)}
                  placeholder="Nombre"
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Apellidos</Label>
                <Input
                  value={member.apellidos}
                  onChange={(e) => updateFamilyMember(idx, "apellidos", e.target.value)}
                  placeholder="Apellidos"
                  className="h-8 text-sm"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Fecha de nacimiento</Label>
                <Input
                  type="date"
                  value={member.fecha_nacimiento}
                  onChange={(e) => updateFamilyMember(idx, "fecha_nacimiento", e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Parentesco</Label>
                <Input
                  value={member.parentesco}
                  onChange={(e) => updateFamilyMember(idx, "parentesco", e.target.value)}
                  placeholder="Cónyuge, hijo/a..."
                  className="h-8 text-sm"
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
