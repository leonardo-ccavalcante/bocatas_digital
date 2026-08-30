import type { UseFormRegister } from "react-hook-form";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle, ChevronDown } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { type PersonCreate } from "../../../schemas";
import { type ProgramRow } from "../_shared";

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
          <div className="space-y-2" data-testid="programas-raiz">
            {programs
              .filter((p) => !p.parent_id)
              .map((raiz) => {
                const hijos = descendientes(programs, raiz.id);
                if (hijos.length === 0) {
                  // Un contenedor sin hijos no es inscribible por diseño
                  // (ADR-0013): ofrecerlo como botón dejaba inscribir a alguien
                  // en el paraguas en vez de en un curso concreto.
                  if (raiz.inscribible === false) return null;
                  return (
                    <ProgramaBoton
                      key={raiz.id}
                      programa={raiz}
                      seleccionado={watchedProgramIds.includes(raiz.id)}
                      onToggle={toggleProgram}
                    />
                  );
                }
                return (
                  <GrupoPrograma
                    key={raiz.id}
                    raiz={raiz}
                    hijos={hijos}
                    watchedProgramIds={watchedProgramIds}
                    toggleProgram={toggleProgram}
                  />
                );
              })}
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

/** Todos los descendientes de un programa, en el orden en que llegan del servidor. */
function descendientes(programs: readonly ProgramRow[], raizId: string): ProgramRow[] {
  const directos = programs.filter((p) => p.parent_id === raizId);
  return directos.flatMap((h) => [h, ...descendientes(programs, h.id)]);
}

function ProgramaBoton({
  programa,
  seleccionado,
  onToggle,
}: {
  programa: ProgramRow;
  seleccionado: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(programa.id)}
      className={`flex w-full items-center gap-2 rounded-lg border p-3 text-left text-sm transition-colors ${
        seleccionado
          ? "border-primary bg-primary/10 font-medium text-primary"
          : "border-border hover:bg-muted"
      }`}
      aria-pressed={seleccionado}
    >
      <span className="text-lg">{programa.icon}</span>
      <span className="truncate">{programa.name}</span>
      {seleccionado && <CheckCircle className="ml-auto h-4 w-4 shrink-0 text-primary" />}
    </button>
  );
}

/**
 * Un programa con hijos se pinta como desplegable, que es justo lo que pidió el
 * equipo para Formación. La cabecera sólo es seleccionable si el propio nodo
 * admite inscripción: un contenedor no la admite por diseño (ADR-0013), y antes
 * se podía inscribir a alguien en él.
 */
function GrupoPrograma({
  raiz,
  hijos,
  watchedProgramIds,
  toggleProgram,
}: {
  raiz: ProgramRow;
  hijos: readonly ProgramRow[];
  watchedProgramIds: string[];
  toggleProgram: (id: string) => void;
}) {
  const algunHijoElegido = hijos.some((h) => watchedProgramIds.includes(h.id));
  const [abierto, setAbierto] = useState(algunHijoElegido);

  return (
    <Collapsible open={abierto} onOpenChange={setAbierto} className="rounded-lg border">
      <CollapsibleTrigger className="flex w-full items-center gap-2 p-3 text-left text-sm hover:bg-muted">
        <span className="text-lg">{raiz.icon}</span>
        <span className="truncate font-medium">{raiz.name}</span>
        <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          {algunHijoElegido && <CheckCircle className="h-4 w-4 text-primary" />}
          {hijos.length}
          <ChevronDown
            className={`h-4 w-4 transition-transform ${abierto ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-2 border-t p-2 pl-6" data-testid={`programa-hijos-${raiz.id}`}>
          {raiz.inscribible !== false && (
            <ProgramaBoton
              programa={{ ...raiz, name: `${raiz.name} (general)` }}
              seleccionado={watchedProgramIds.includes(raiz.id)}
              onToggle={toggleProgram}
            />
          )}
          {hijos
            .filter((h) => h.inscribible !== false)
            .map((h) => (
              <ProgramaBoton
                key={h.id}
                programa={h}
                seleccionado={watchedProgramIds.includes(h.id)}
                onToggle={toggleProgram}
              />
            ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
