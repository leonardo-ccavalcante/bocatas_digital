import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Search, UserPlus } from "lucide-react";
import type { FamilyMember } from "../../schemas";

interface Step2MembersProps {
  members: FamilyMember[];
  onChange: (members: FamilyMember[]) => void;
}

export function Step2Members({ members, onChange }: Step2MembersProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [, setEditingIdx] = useState<number | null>(null);
  const [newMember, setNewMember] = useState<Partial<FamilyMember>>({});

  const { data: searchResults } = trpc.persons.search.useQuery(
    { query: searchQuery },
    { enabled: searchQuery.length >= 2 }
  );

  const addMember = (m: FamilyMember) => {
    onChange([...members, m]);
    setNewMember({});
    setSearchQuery("");
    setEditingIdx(null);
  };

  const removeMember = (idx: number) => {
    onChange(members.filter((_, i) => i !== idx));
  };

  const PARENTESCOS = ["esposo_a", "hijo_a", "madre", "padre", "suegro_a", "hermano_a", "abuelo_a", "otro"];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Añade los miembros del hogar. Para cada uno, busca primero si ya existe en el registro.
      </p>

      {/* Existing members list */}
      {members.length > 0 && (
        <div className="space-y-2">
          {members.map((m, idx) => (
            <div key={idx} className="flex items-center gap-3 p-3 border rounded-lg">
              <div className="flex-1">
                <p className="font-medium text-sm">{m.nombre} {m.apellidos}</p>
                <p className="text-xs text-muted-foreground">{m.parentesco} {m.es_menor ? "· Menor" : ""}</p>
              </div>
              {m.person_id && <Badge variant="secondary" className="text-xs">Registrado</Badge>}
              <Button variant="ghost" size="sm" onClick={() => removeMember(idx)}>✕</Button>
            </div>
          ))}
        </div>
      )}

      <Separator />

      {/* Add new member */}
      <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
        <p className="text-sm font-medium flex items-center gap-2">
          <UserPlus className="h-4 w-4" /> Añadir miembro
        </p>

        {/* Person search */}
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar en el registro (nombre)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {searchResults && searchResults.length > 0 && (
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {searchResults.map((p) => (
              <button
                key={p.id}
                className="w-full text-left p-2 text-sm border rounded hover:bg-accent"
                onClick={() => {
                  setNewMember({
                    person_id: p.id,
                    nombre: p.nombre,
                    apellidos: p.apellidos ?? "",
                    fecha_nacimiento: p.fecha_nacimiento ?? undefined,
                  });
                  setSearchQuery(`${p.nombre} ${p.apellidos ?? ""}`);
                }}
              >
                <span className="font-medium">{p.nombre} {p.apellidos}</span>
                <Badge variant="outline" className="ml-2 text-xs">Ya registrado</Badge>
              </button>
            ))}
          </div>
        )}

        {/* Manual fields */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Nombre *</Label>
            <Input
              value={newMember.nombre ?? ""}
              onChange={(e) => setNewMember({ ...newMember, nombre: e.target.value })}
              placeholder="Nombre"
            />
          </div>
          <div>
            <Label className="text-xs">Apellidos *</Label>
            <Input
              value={newMember.apellidos ?? ""}
              onChange={(e) => setNewMember({ ...newMember, apellidos: e.target.value })}
              placeholder="Apellidos"
            />
          </div>
          <div>
            <Label className="text-xs">Fecha nacimiento</Label>
            <Input
              type="date"
              value={newMember.fecha_nacimiento ?? ""}
              onChange={(e) => setNewMember({ ...newMember, fecha_nacimiento: e.target.value })}
            />
          </div>
          <div>
            <Label className="text-xs">Parentesco *</Label>
            <Select
              value={newMember.parentesco ?? ""}
              onValueChange={(v) => setNewMember({ ...newMember, parentesco: v })}
            >
              <SelectTrigger><SelectValue placeholder="Parentesco" /></SelectTrigger>
              <SelectContent>
                {PARENTESCOS.map((p) => (
                  <SelectItem key={p} value={p}>{p.replace("_", "/")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Nº Documento</Label>
            <Input
              value={newMember.numero_documento ?? ""}
              onChange={(e) => setNewMember({ ...newMember, numero_documento: e.target.value })}
              placeholder="DNI/NIE/Pasaporte"
            />
          </div>
          <div className="flex items-center gap-2 pt-5">
            <Switch
              checked={newMember.es_menor ?? false}
              onCheckedChange={(v) => setNewMember({ ...newMember, es_menor: v })}
            />
            <Label className="text-xs">Es menor de edad</Label>
          </div>
        </div>

        <Button
          size="sm"
          disabled={!newMember.nombre || !newMember.apellidos || !newMember.parentesco}
          onClick={() => addMember({
            person_id: newMember.person_id ?? null,
            nombre: newMember.nombre!,
            apellidos: newMember.apellidos!,
            fecha_nacimiento: newMember.fecha_nacimiento ?? null,
            tipo_documento: newMember.tipo_documento ?? null,
            numero_documento: newMember.numero_documento ?? null,
            parentesco: newMember.parentesco!,
            es_menor: newMember.es_menor === true,
          })}
        >
          <UserPlus className="mr-2 h-4 w-4" /> Añadir al hogar
        </Button>
      </div>
    </div>
  );
}
