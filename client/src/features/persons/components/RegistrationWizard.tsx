import { useState, useCallback, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { ChevronLeft, ChevronRight, Camera, CheckCircle, Loader2 } from "lucide-react";
import {
  PersonCreateSchema,
  type PersonCreate,
  CANAL_LLEGADA_LABELS,
  GENERO_LABELS,
  IDIOMA_LABELS,
  TIPO_DOCUMENTO_LABELS,
  SITUACION_LEGAL_LABELS,
  TIPO_VIVIENDA_LABELS,
  NIVEL_ESTUDIOS_LABELS,
  SITUACION_LABORAL_LABELS,
  NIVEL_INGRESOS_LABELS,
  type OcrExtracted,
  type DuplicateCandidate,
} from "../schemas";
import { useCreatePerson } from "../hooks/useCreatePerson";
import { useEnrollPerson } from "../hooks/useEnrollPerson";
import { useDuplicateCheck } from "../hooks/useDuplicateCheck";
import { usePrograms } from "../hooks/usePrograms";
import { DocumentCaptureModal } from "./DocumentCaptureModal";
import { OCRConfirmationCard } from "./OCRConfirmationCard";
import { DuplicateWarningCard } from "./DuplicateWarningCard";

const TOTAL_STEPS = 7;
const STEP_LABELS = [
  "Canal de llegada",
  "Identidad",
  "Documento",
  "Contacto",
  "Situación",
  "Información social",
  "Programas y foto",
];

// Helper: select field wrapper
function SelectField({
  label, id, value, onChange, options, placeholder, required,
}: {
  label: string; id: string; value: string; onChange: (v: string) => void;
  options: Record<string, string>; placeholder?: string; required?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}{required && <span className="ml-1 text-destructive">*</span>}</Label>
      <Select value={value ?? ""} onValueChange={onChange}>
        <SelectTrigger id={id}>
          <SelectValue placeholder={placeholder ?? "Seleccionar..."} />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(options).map(([k, v]) => (
            <SelectItem key={k} value={k}>{v}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function RegistrationWizard() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState(0);
  const [showDocCapture, setShowDocCapture] = useState(false);
  const [ocrData, setOcrData] = useState<OcrExtracted | null>(null);
  const [ocrAccepted, setOcrAccepted] = useState(false);
  const [duplicateDismissed, setDuplicateDismissed] = useState(false);

  const { mutateAsync: createPerson, isPending: isCreating } = useCreatePerson();
  const { mutateAsync: enrollPerson } = useEnrollPerson();
  const { data: programs = [] } = usePrograms();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    getValues,
    trigger,
    formState: { errors },
  } = useForm<PersonCreate>({
    resolver: zodResolver(PersonCreateSchema),
    defaultValues: {
      canal_llegada: undefined,
      idioma_principal: "es",
      program_ids: [] as string[],
      fase_itinerario: "acogida",
    },
  });

  const watchedNombre = watch("nombre") ?? "";
  const watchedApellidos = watch("apellidos") ?? "";
  const watchedProgramIds = watch("program_ids") ?? [];

  // Duplicate check — only enabled after step 1 is filled
  const { data: duplicates = [] } = useDuplicateCheck(
    watchedNombre,
    watchedApellidos,
    step >= 1 && !duplicateDismissed
  );

  const showDuplicateWarning =
    step === 1 && duplicates.length > 0 && !duplicateDismissed;

  // Apply OCR data to form
  const handleOCRExtracted = useCallback((data: OcrExtracted) => {
    setOcrData(data);
    if (data.nombre) setValue("nombre", data.nombre);
    if (data.apellidos) setValue("apellidos", data.apellidos);
    if (data.fecha_nacimiento) setValue("fecha_nacimiento", data.fecha_nacimiento);
    if (data.tipo_documento) {
      // Normalize OCR lowercase to DB enum values
      const tipoMap: Record<string, "DNI" | "NIE" | "Pasaporte" | "Sin_Documentacion"> = {
        dni: "DNI", nie: "NIE", pasaporte: "Pasaporte", otro: "Sin_Documentacion",
      };
      const normalized = tipoMap[data.tipo_documento];
      if (normalized) setValue("tipo_documento", normalized);
    }
    if (data.numero_documento) setValue("numero_documento", data.numero_documento);
    if (data.pais_origen) setValue("pais_origen", data.pais_origen);
  }, [setValue]);

  const handleOCRAccept = useCallback(() => {
    setOcrAccepted(true);
    setOcrData(null);
  }, []);

  // Step navigation with validation
  const STEP_FIELDS = useMemo<(keyof PersonCreate)[][]>(() => [
    ["canal_llegada"],
    ["nombre", "apellidos", "fecha_nacimiento", "idioma_principal"],
    ["tipo_documento", "numero_documento"],
    ["telefono", "email"],
    ["tipo_vivienda", "nivel_estudios", "situacion_laboral"],
    ["necesidades_principales"],
    ["program_ids"],
  ], []);

  const goNext = useCallback(async () => {
    const fields = STEP_FIELDS[step];
    const valid = await trigger(fields as (keyof PersonCreate)[]);
    if (!valid) return;
    if (showDuplicateWarning) return; // must dismiss first
    setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
  }, [step, trigger, showDuplicateWarning, STEP_FIELDS]);

  const goBack = useCallback(() => {
    setStep((s) => Math.max(s - 1, 0));
  }, []);

  const toggleProgram = useCallback((id: string) => {
    const current = (getValues("program_ids") as string[]) ?? [];
    const updated = current.includes(id)
      ? current.filter((p) => p !== id)
      : [...current, id];
    setValue("program_ids", updated, { shouldDirty: true });
  }, [getValues, setValue]);

  const onSubmit = useCallback(async (data: PersonCreate) => {
    try {
      const person = await createPerson({ data });
      if (data.program_ids.length > 0 && person?.id) {
        await enrollPerson({ personId: person.id, programIds: data.program_ids });
      }
      toast.success("Persona registrada correctamente");
      navigate(`/personas/${person?.id ?? ""}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error desconocido";
      toast.error(`Error al registrar: ${message}`);
    }
  }, [createPerson, enrollPerson, navigate]);

  const progress = ((step + 1) / TOTAL_STEPS) * 100;

  return (
    <div className="mx-auto max-w-lg space-y-6 p-4">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Registrar persona</h1>
          <span className="text-sm text-muted-foreground">
            Paso {step + 1} de {TOTAL_STEPS}
          </span>
        </div>
        <Progress value={progress} className="h-2" />
        <p className="text-sm font-medium text-primary">{STEP_LABELS[step]}</p>
      </div>

        <form onSubmit={handleSubmit(onSubmit as unknown as Parameters<typeof handleSubmit>[0])} className="space-y-4" noValidate>
        {/* ── Step 0: Canal de llegada ── */}
        {step === 0 && (
          <div className="space-y-4">
            <SelectField
              label="Canal de llegada"
              id="canal_llegada"
              value={watch("canal_llegada") ?? ""}
              onChange={(v) => setValue("canal_llegada", v as PersonCreate["canal_llegada"])}
              options={CANAL_LLEGADA_LABELS}
              required
            />
            {errors.canal_llegada && (
              <p className="text-xs text-destructive">{errors.canal_llegada.message}</p>
            )}
            <div className="space-y-1">
              <Label htmlFor="entidad_derivadora">Entidad derivadora (opcional)</Label>
              <Input id="entidad_derivadora" {...register("entidad_derivadora")} placeholder="Cruz Roja, Servicios Sociales..." />
            </div>
            <div className="space-y-1">
              <Label htmlFor="persona_referencia">Persona de referencia (opcional)</Label>
              <Input id="persona_referencia" {...register("persona_referencia")} placeholder="Nombre del referente" />
            </div>
          </div>
        )}

        {/* ── Step 1: Identidad ── */}
        {step === 1 && (
          <div className="space-y-4">
            {/* OCR capture button */}
            <Button
              type="button"
              variant="outline"
              className="w-full gap-2"
              onClick={() => setShowDocCapture(true)}
            >
              <Camera className="h-4 w-4" />
              Escanear documento de identidad
            </Button>

            {/* OCR confirmation */}
            {ocrData && !ocrAccepted && (
              <OCRConfirmationCard
                data={ocrData}
                onAccept={handleOCRAccept}
                onEdit={() => setOcrData(null)}
              />
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="nombre">Nombre <span className="text-destructive">*</span></Label>
                <Input id="nombre" {...register("nombre")} autoComplete="given-name" />
                {errors.nombre && <p className="text-xs text-destructive">{errors.nombre.message}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="apellidos">Apellidos <span className="text-destructive">*</span></Label>
                <Input id="apellidos" {...register("apellidos")} autoComplete="family-name" />
                {errors.apellidos && <p className="text-xs text-destructive">{errors.apellidos.message}</p>}
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="fecha_nacimiento">Fecha de nacimiento <span className="text-destructive">*</span></Label>
              <Input id="fecha_nacimiento" type="date" {...register("fecha_nacimiento")} />
              {errors.fecha_nacimiento && <p className="text-xs text-destructive">{errors.fecha_nacimiento.message}</p>}
            </div>

            <SelectField
              label="Género"
              id="genero"
              value={watch("genero") ?? ""}
              onChange={(v) => setValue("genero", v as PersonCreate["genero"])}
              options={GENERO_LABELS}
            />

            <div className="space-y-1">
              <Label htmlFor="pais_origen">País de origen</Label>
              <Input id="pais_origen" {...register("pais_origen")} placeholder="España, Marruecos..." />
            </div>

            <SelectField
              label="Idioma principal"
              id="idioma_principal"
              value={watch("idioma_principal") ?? "es"}
              onChange={(v) => setValue("idioma_principal", v as PersonCreate["idioma_principal"])}
              options={IDIOMA_LABELS}
              required
            />

            {/* Duplicate warning */}
            {showDuplicateWarning && (
              <DuplicateWarningCard
                candidates={duplicates as DuplicateCandidate[]}
                onContinueAnyway={() => setDuplicateDismissed(true)}
              />
            )}
          </div>
        )}

        {/* ── Step 2: Documento ── */}
        {step === 2 && (
          <div className="space-y-4">
            <SelectField
              label="Tipo de documento"
              id="tipo_documento"
              value={watch("tipo_documento") ?? ""}
              onChange={(v) => setValue("tipo_documento", v as PersonCreate["tipo_documento"])}
              options={TIPO_DOCUMENTO_LABELS}
            />
            <div className="space-y-1">
              <Label htmlFor="numero_documento">Número de documento</Label>
              <Input id="numero_documento" {...register("numero_documento")} placeholder="12345678A" />
            </div>
            <SelectField
              label="Situación legal"
              id="situacion_legal"
              value={watch("situacion_legal") ?? ""}
              onChange={(v) => setValue("situacion_legal", v as PersonCreate["situacion_legal"])}
              options={SITUACION_LEGAL_LABELS}
            />
            <div className="space-y-1">
              <Label htmlFor="fecha_llegada_espana">Fecha de llegada a España</Label>
              <Input id="fecha_llegada_espana" type="date" {...register("fecha_llegada_espana")} />
            </div>
          </div>
        )}

        {/* ── Step 3: Contacto ── */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="telefono">Teléfono</Label>
              <Input id="telefono" type="tel" {...register("telefono")} placeholder="+34 612 345 678" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" {...register("email")} placeholder="persona@ejemplo.com" />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="direccion">Dirección</Label>
              <Input id="direccion" {...register("direccion")} placeholder="Calle, número, piso..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="municipio">Municipio</Label>
                <Input id="municipio" {...register("municipio")} placeholder="Madrid" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="barrio_zona">Barrio / Zona</Label>
                <Input id="barrio_zona" {...register("barrio_zona")} placeholder="Vallecas" />
              </div>
            </div>
          </div>
        )}

        {/* ── Step 4: Situación ── */}
        {step === 4 && (
          <div className="space-y-4">
            <SelectField
              label="Tipo de vivienda"
              id="tipo_vivienda"
              value={watch("tipo_vivienda") ?? ""}
              onChange={(v) => setValue("tipo_vivienda", v as PersonCreate["tipo_vivienda"])}
              options={Object.fromEntries(
                Object.entries(TIPO_VIVIENDA_LABELS).map(([k, v]) => [k, `${v.icon} ${v.label}`])
              )}
            />
            <div className="flex items-center gap-2">
              <Checkbox
                id="empadronado"
                checked={watch("empadronado") ?? false}
                onCheckedChange={(v) => setValue("empadronado", v === true)}
              />
              <Label htmlFor="empadronado" className="cursor-pointer">Empadronado/a</Label>
            </div>
            <SelectField
              label="Nivel de estudios"
              id="nivel_estudios"
              value={watch("nivel_estudios") ?? ""}
              onChange={(v) => setValue("nivel_estudios", v as PersonCreate["nivel_estudios"])}
              options={NIVEL_ESTUDIOS_LABELS}
            />
            <SelectField
              label="Situación laboral"
              id="situacion_laboral"
              value={watch("situacion_laboral") ?? ""}
              onChange={(v) => setValue("situacion_laboral", v as PersonCreate["situacion_laboral"])}
              options={SITUACION_LABORAL_LABELS}
            />
            <SelectField
              label="Nivel de ingresos"
              id="nivel_ingresos"
              value={watch("nivel_ingresos") ?? ""}
              onChange={(v) => setValue("nivel_ingresos", v as PersonCreate["nivel_ingresos"])}
              options={NIVEL_INGRESOS_LABELS}
            />
          </div>
        )}

        {/* ── Step 5: Información social ── */}
        {step === 5 && (
          <div className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="necesidades_principales">Necesidades principales</Label>
              <Textarea
                id="necesidades_principales"
                {...register("necesidades_principales")}
                rows={3}
                placeholder="Describe las necesidades más urgentes..."
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="restricciones_alimentarias">Restricciones alimentarias</Label>
              <Input id="restricciones_alimentarias" {...register("restricciones_alimentarias")} placeholder="Sin gluten, halal, vegetariano..." />
            </div>
            <div className="space-y-1">
              <Label htmlFor="observaciones">Observaciones</Label>
              <Textarea
                id="observaciones"
                {...register("observaciones")}
                rows={3}
                placeholder="Información adicional relevante..."
              />
            </div>
          </div>
        )}

        {/* ── Step 6: Programas y foto ── */}
        {step === 6 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Programas a los que se inscribe</Label>
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
            </div>
          </div>
        )}

        {/* Navigation buttons */}
        <div className="flex gap-3 pt-2">
          {step > 0 && (
            <Button type="button" variant="outline" onClick={goBack} className="flex-1">
              <ChevronLeft className="mr-1 h-4 w-4" /> Anterior
            </Button>
          )}
          {step < TOTAL_STEPS - 1 ? (
            <Button
              type="button"
              onClick={goNext}
              disabled={showDuplicateWarning}
              className="flex-1"
            >
              Siguiente <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          ) : (
            <Button type="submit" disabled={isCreating} className="flex-1">
              {isCreating ? (
                <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Guardando...</>
              ) : (
                <><CheckCircle className="mr-1 h-4 w-4" /> Registrar persona</>
              )}
            </Button>
          )}
        </div>
      </form>

      {/* Document capture modal */}
      <DocumentCaptureModal
        open={showDocCapture}
        onClose={() => setShowDocCapture(false)}
        onExtracted={handleOCRExtracted}
      />
    </div>
  );
}
