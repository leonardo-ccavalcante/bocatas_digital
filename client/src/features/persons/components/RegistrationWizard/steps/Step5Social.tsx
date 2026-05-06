import type { UseFormRegister } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle } from "lucide-react";
import { type PersonCreate } from "../../../schemas";

interface ProgramRow {
  id: string;
  name: string;
  icon: string | null;
  slug: string;
}

interface Step5SocialProps {
  register: UseFormRegister<PersonCreate>;
  programs: readonly ProgramRow[];
  watchedProgramIds: string[];
  toggleProgram: (id: string) => void;
  hasFamilia: boolean;
}

export function Step5Social({
  register, programs, watchedProgramIds, toggleProgram, hasFamilia,
}: Step5SocialProps) {
  return (
    <div className="space-y-4">
      {/* Food safety — prominent */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-1">
        <Label htmlFor="restricciones_alimentarias" className="font-semibold text-amber-800">
          ⚠️ Alergias / Restricciones alimentarias
        </Label>
        <p className="text-xs text-amber-700">Se mostrará en el check-in de comedor</p>
        <Input
          id="restricciones_alimentarias"
          {...register("restricciones_alimentarias")}
          placeholder="Sin gluten, halal, vegetariano, alergia a frutos secos..."
          className="bg-white"
        />
      </div>

      {/* Programs */}
      <div className="space-y-2">
        <Label className="font-semibold">
          Programas al alta <span className="text-destructive">*</span>
        </Label>
        {watchedProgramIds.length === 0 && (
          <p className="text-xs text-destructive font-medium">
            Selecciona al menos un programa para continuar.
          </p>
        )}
        {programs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Cargando programas...</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {programs.map((prog) => (
              <button
                key={prog.id}
                type="button"
                onClick={() => toggleProgram(prog.id)}
                className={`flex items-center gap-2 rounded-lg border p-3 text-left text-sm transition-colors ${
                  watchedProgramIds.includes(prog.id)
                    ? "border-primary bg-primary/10 font-medium text-primary"
                    : "border-border hover:bg-muted"
                }`}
                aria-pressed={watchedProgramIds.includes(prog.id)}
              >
                <span className="text-lg">{prog.icon}</span>
                <span className="truncate">{prog.name}</span>
                {watchedProgramIds.includes(prog.id) && (
                  <CheckCircle className="ml-auto h-4 w-4 shrink-0 text-primary" />
                )}
              </button>
            ))}
          </div>
        )}
        {hasFamilia && (
          <p className="text-xs text-primary font-medium">
            ℹ️ Se añadirá un paso de registro familiar al final del formulario.
          </p>
        )}
      </div>

      <div className="space-y-1">
        <Label htmlFor="necesidades_principales">Necesidades principales</Label>
        <Textarea
          id="necesidades_principales"
          {...register("necesidades_principales")}
          rows={2}
          placeholder="Describe las necesidades más urgentes..."
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="observaciones">Observaciones del entrevistador</Label>
        <Textarea
          id="observaciones"
          {...register("observaciones")}
          rows={2}
          placeholder="Información adicional relevante..."
        />
      </div>
    </div>
  );
}
