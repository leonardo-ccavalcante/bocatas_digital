import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { FamilyIntakeSchema, type FamilyIntake, type FamilyMember } from "../schemas";
import { useCreateFamilia } from "../hooks/useFamilias";
import { CheckCircle, ChevronRight, ChevronLeft, Search, UserPlus, Users, FileText, Shield, User } from "lucide-react";

interface IntakeWizardProps {
  /** Pre-loaded titular person ID (from /familias/nueva?titular_id=:id) */
  titularId?: string;
}

const STEPS = [
  { id: 1, label: "Titular", icon: User },
  { id: 2, label: "Miembros", icon: Users },
  { id: 3, label: "Documentación", icon: FileText },
  { id: 4, label: "GUF", icon: Shield },
  { id: 5, label: "Autorizado", icon: CheckCircle },
];

// ─── Step 1: Titular search/select ───────────────────────────────────────────
function Step1Titular({
  titularId,
  onSelect,
}: {
  titularId?: string;
  onSelect: (id: string, name: string) => void;
}) {
  const [query, setQuery] = useState("");
  const { data: results, isLoading } = trpc.persons.search.useQuery(
    { query },
    { enabled: query.length >= 2, staleTime: 5_000 }
  );
  const { data: preloaded } = trpc.persons.getById.useQuery(
    { id: titularId! },
    { enabled: !!titularId }
  );

  if (titularId && preloaded) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 p-4 border rounded-lg bg-green-50 dark:bg-green-950">
          <CheckCircle className="h-5 w-5 text-green-600" />
          <div>
            <p className="font-medium">{preloaded.nombre} {preloaded.apellidos}</p>
            <p className="text-sm text-muted-foreground">
              {preloaded.tipo_documento && preloaded.numero_documento
                ? `${preloaded.tipo_documento}: ${preloaded.numero_documento}`
                : "Sin documento registrado"}
            </p>
          </div>
          <Badge variant="secondary" className="ml-auto">Ya registrado</Badge>
        </div>
        <Button onClick={() => onSelect(preloaded.id, `${preloaded.nombre} ${preloaded.apellidos}`)}>
          Confirmar titular <ChevronRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar por nombre o apellidos..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {isLoading && <p className="text-sm text-muted-foreground">Buscando...</p>}
      {results && results.length > 0 && (
        <div className="space-y-2">
          {results.map((p) => (
            <button
              key={p.id}
              className="w-full text-left p-3 border rounded-lg hover:bg-accent transition-colors"
              onClick={() => onSelect(p.id, `${p.nombre} ${p.apellidos}`)}
            >
              <p className="font-medium">{p.nombre} {p.apellidos}</p>
              <p className="text-xs text-muted-foreground">
                {p.fecha_nacimiento ? `Nac: ${p.fecha_nacimiento}` : "Sin fecha de nacimiento"}
              </p>
            </button>
          ))}
        </div>
      )}
      {results && results.length === 0 && query.length >= 2 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          No se encontró ninguna persona con ese nombre. El titular debe estar registrado en el sistema.
        </p>
      )}
    </div>
  );
}

// ─── Step 2: Members ─────────────────────────────────────────────────────────
function Step2Members({
  members,
  onChange,
}: {
  members: FamilyMember[];
  onChange: (members: FamilyMember[]) => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
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

// ─── Step 3: Documentation ───────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function Step3Docs({ form }: { form: any }) {
  const fields: { key: keyof FamilyIntake; label: string }[] = [
    { key: "docs_identidad", label: "Documentos de identidad recibidos" },
    { key: "padron_recibido", label: "Padrón municipal recibido" },
    { key: "justificante_recibido", label: "Justificante de ingresos recibido" },
    { key: "informe_social", label: "Informe social recibido" },
    { key: "consent_bocatas", label: "Consentimiento Bocatas firmado" },
    { key: "consent_banco_alimentos", label: "Consentimiento Banco de Alimentos firmado" },
  ];

  return (
    <div className="space-y-3">
      {fields.map(({ key, label }) => (
        <div key={key} className="flex items-center justify-between p-3 border rounded-lg">
          <Label className="text-sm">{label}</Label>
          <Switch
            checked={!!form.watch(key)}
            onCheckedChange={(v) => form.setValue(key, v as never)}
          />
        </div>
      ))}
      {form.watch("informe_social") && (
        <div>
          <Label className="text-xs">Fecha del informe social</Label>
          <Input
            type="date"
            {...form.register("informe_social_fecha")}
          />
        </div>
      )}
    </div>
  );
}

// ─── Step 4: GUF ─────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function Step4Guf({ form }: { form: any }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between p-3 border rounded-lg">
        <div>
          <Label className="text-sm font-medium">Alta en GUF</Label>
          <p className="text-xs text-muted-foreground">Gestión Unificada de Familias</p>
        </div>
        <Switch
          checked={!!form.watch("alta_en_guf")}
          onCheckedChange={(v) => form.setValue("alta_en_guf", v)}
        />
      </div>
      {form.watch("alta_en_guf") && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Fecha de alta GUF</Label>
            <Input type="date" {...form.register("fecha_alta_guf")} />
          </div>
          <div>
            <Label className="text-xs">Día de corte mensual (1-31)</Label>
            <Input
              type="number"
              min={1}
              max={31}
              {...form.register("guf_cutoff_day", { valueAsNumber: true })}
              placeholder="Ej: 15"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Step 5: Authorized person ───────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function Step5Autorizado({ form }: { form: any }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between p-3 border rounded-lg">
        <div>
          <Label className="text-sm font-medium">¿Tiene persona autorizada para recoger?</Label>
          <p className="text-xs text-muted-foreground">Persona distinta al titular</p>
        </div>
        <Switch
          checked={!!form.watch("autorizado")}
          onCheckedChange={(v) => form.setValue("autorizado", v)}
        />
      </div>
      {form.watch("autorizado") && (
        <div>
          <Label className="text-xs">Nombre de la persona autorizada</Label>
          <Input
            {...form.register("persona_recoge")}
            placeholder="Nombre completo"
          />
        </div>
      )}
    </div>
  );
}

// ─── Main Wizard ──────────────────────────────────────────────────────────────
export function IntakeWizard({ titularId }: IntakeWizardProps) {
  const [, navigate] = useLocation();
  const [step, setStep] = useState(titularId ? 2 : 1);
  const [selectedTitular, setSelectedTitular] = useState<{ id: string; name: string } | null>(
    titularId ? { id: titularId, name: "" } : null
  );
  const [members, setMembers] = useState<FamilyMember[]>([]);

  const form = useForm<FamilyIntake>({
    resolver: zodResolver(FamilyIntakeSchema) as any,
    defaultValues: {
      titular_id: titularId ?? "",
      num_adultos: 1,
      num_menores_18: 0,
      miembros: [],
      docs_identidad: false,
      padron_recibido: false,
      justificante_recibido: false,
      informe_social: false,
      consent_bocatas: false,
      consent_banco_alimentos: false,
      alta_en_guf: false,
      autorizado: false,
    },
  });

  const createFamilia = useCreateFamilia();

  const handleTitularSelect = (id: string, name: string) => {
    setSelectedTitular({ id, name });
    form.setValue("titular_id", id);
    setStep(2);
  };

  const handleSubmit = async () => {
    const values = form.getValues();
    const adultos = members.filter((m) => !m.es_menor).length + 1; // +1 for titular
    const menores = members.filter((m) => m.es_menor).length;

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (createFamilia.mutateAsync as any)({
        titular_id: values.titular_id,
        miembros: members.map((m) => ({
          nombre: m.nombre,
          apellidos: m.apellidos,
          parentesco: m.parentesco as "esposo_a" | "hijo_a" | "madre" | "padre" | "suegro_a" | "hermano_a" | "abuelo_a" | "otro",
          fecha_nacimiento: m.fecha_nacimiento ?? undefined,
          documento: m.numero_documento ?? undefined,
          person_id: m.person_id ?? undefined,
        })),
        num_adultos: adultos,
        num_menores_18: menores,
        docs_identidad: values.docs_identidad,
        padron_recibido: values.padron_recibido,
        justificante_recibido: values.justificante_recibido,
        informe_social: values.informe_social,
        informe_social_fecha: values.informe_social_fecha ?? undefined,
        consent_bocatas: values.consent_bocatas,
        consent_banco_alimentos: values.consent_banco_alimentos,
        autorizado: values.autorizado,
        persona_recoge: values.persona_recoge ?? "",
        program_id: "00000000-0000-0000-0000-000000000000", // TODO: select program
      });
      toast.success(`Familia #${result.familia_numero} registrada correctamente`);
      navigate(`/familias/${result.id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al registrar la familia";
      toast.error(msg);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Step indicators */}
      <div className="flex items-center justify-between">
        {STEPS.map((s, idx) => (
          <div key={s.id} className="flex items-center">
            <div
              className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-medium transition-colors ${
                step === s.id
                  ? "bg-primary text-primary-foreground"
                  : step > s.id
                  ? "bg-green-500 text-white"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {step > s.id ? <CheckCircle className="h-4 w-4" /> : s.id}
            </div>
            <span className={`ml-1 text-xs hidden sm:block ${step === s.id ? "font-medium" : "text-muted-foreground"}`}>
              {s.label}
            </span>
            {idx < STEPS.length - 1 && (
              <div className={`h-px w-8 mx-2 ${step > s.id ? "bg-green-500" : "bg-muted"}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {STEPS[step - 1]?.label}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {step === 1 && (
            <Step1Titular titularId={titularId} onSelect={handleTitularSelect} />
          )}
          {step === 2 && (
            <Step2Members members={members} onChange={setMembers} />
          )}
          {step === 3 && <Step3Docs form={form} />}
          {step === 4 && <Step4Guf form={form} />}
          {step === 5 && <Step5Autorizado form={form} />}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={() => setStep((s) => Math.max(1, s - 1))}
          disabled={step === 1}
        >
          <ChevronLeft className="mr-2 h-4 w-4" /> Anterior
        </Button>

        {step < 5 ? (
          <Button
            onClick={() => {
              if (step === 1 && !selectedTitular) {
                toast.error("Selecciona un titular primero");
                return;
              }
              setStep((s) => s + 1);
            }}
          >
            Siguiente <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        ) : (
          <Button
            onClick={handleSubmit}
            disabled={createFamilia.isPending}
          >
            {createFamilia.isPending ? "Registrando..." : "Registrar familia"}
          </Button>
        )}
      </div>
    </div>
  );
}
