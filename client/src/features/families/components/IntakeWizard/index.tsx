import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, ChevronRight, ChevronLeft, Users, FileText, Shield, User } from "lucide-react";
import { FamilyIntakeSchema, type FamilyIntake, type FamilyMember } from "../../schemas";
import { useCreateFamilia } from "../../hooks/useFamilias";
import { Step1Titular } from "./Step1Titular";
import { Step2Members } from "./Step2Members";
import { Step3Docs } from "./Step3Docs";
import { Step4Guf } from "./Step4Guf";
import { Step5Autorizado } from "./Step5Autorizado";

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

export function IntakeWizard({ titularId }: IntakeWizardProps) {
  const [, navigate] = useLocation();
  const [step, setStep] = useState(titularId ? 2 : 1);
  const [selectedTitular, setSelectedTitular] = useState<{ id: string; name: string } | null>(
    titularId ? { id: titularId, name: "" } : null
  );
  const [members, setMembers] = useState<FamilyMember[]>([]);

  const form = useForm<FamilyIntake>({
    // Supabase SDK boundary
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(FamilyIntakeSchema) as any,
    defaultValues: {
      titular_id: titularId ?? "",
      program_id: "",
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
  const programId = form.watch("program_id");

  const handleTitularSelect = (id: string, name: string) => {
    setSelectedTitular({ id, name });
    form.setValue("titular_id", id);
    // Do NOT auto-advance — programa selection is required before step 2
  };

  const handleProgramaSelect = (id: string) => {
    form.setValue("program_id", id);
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
        program_id: values.program_id,
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
            <Step1Titular
              titularId={titularId}
              selectedTitular={selectedTitular}
              programId={programId}
              onSelectTitular={handleTitularSelect}
              onSelectProgram={handleProgramaSelect}
            />
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
              if (step === 1) {
                if (!selectedTitular) {
                  toast.error("Selecciona un titular primero");
                  return;
                }
                if (!programId) {
                  toast.error("Selecciona un programa antes de continuar");
                  return;
                }
              }
              setStep((s) => s + 1);
            }}
            disabled={step === 1 && (!selectedTitular || !programId)}
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
