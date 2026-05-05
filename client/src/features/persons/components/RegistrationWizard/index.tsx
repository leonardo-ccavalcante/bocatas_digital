/**
 * RegistrationWizard — 9-step person registration form.
 *
 * Steps:
 *   0 — Canal de llegada
 *   1 — Identidad (OCR optional — fills Step 1 + Step 2 fields)
 *   2 — Documento (OCR offered only if NOT already used in Step 1)
 *   3 — Contacto
 *   4 — Situación
 *   5 — Información social + Programas
 *   6 — Foto de perfil (optional)
 *   7 — Consentimiento RGPD (dynamic groups based on selected programs)
 *   8 — Programa Familias (only shown if familia program selected)
 *
 * OCR rules:
 *   - OCR is OPTIONAL and can be triggered in Step 1 or Step 2
 *   - Once OCR has been used, the "scan" UI is replaced by a "data extracted" banner
 *   - OCR fills: nombre, apellidos, fecha_nacimiento, tipo_documento, numero_documento
 *
 * RGPD rules (Step 7):
 *   - Group A (always required): tratamiento_datos_bocatas, fotografia, comunicaciones_whatsapp
 *   - Group B (if banco_alimentos program selected): tratamiento_datos_banco_alimentos
 *   - Group C (if familia program selected): compartir_datos_red
 *   - Declining Group A → submit button disabled
 *
 * Step 8 (Familias):
 *   - Only rendered if programa "familia" is selected
 *   - Collects: num_adultos, num_menores, and optional list of miembros
 */
import { useState, useCallback, useMemo, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ChevronLeft, ChevronRight, CheckCircle, Loader2 } from "lucide-react";
import {
  PersonCreateSchema,
  type PersonCreate,
  type OcrExtracted,
  type DuplicateCandidate,
} from "../../schemas";
import { useDuplicateCheck } from "../../hooks/useDuplicateCheck";
import { usePrograms } from "../../hooks/usePrograms";
import { useConsentTemplates } from "../../hooks/useConsentTemplates";
import { compressImage } from "../../utils/imageUtils";
import { type FamilyMember, SLUG_BANCO_ALIMENTOS, SLUG_FAMILIA } from "./_shared";
import { useRegistrationSubmit } from "./_useSubmit";
import { Step0Canal } from "./steps/Step0Canal";
import { Step1Identidad } from "./steps/Step1Identidad";
import { Step2Documento } from "./steps/Step2Documento";
import { Step3Contacto } from "./steps/Step3Contacto";
import { Step4Situacion } from "./steps/Step4Situacion";
import { Step5Social } from "./steps/Step5Social";
import { Step6Foto } from "./steps/Step6Foto";
import { Step7Consent } from "./steps/Step7Consent";
import { Step8Familia } from "./steps/Step8Familia";

export function RegistrationWizard() {
  const [step, setStep] = useState(0);
  const [duplicateDismissed, setDuplicateDismissed] = useState(false);

  // ── OCR shared state ──────────────────────────────────────────────────────
  // Once OCR is used (in Step 1 or 2), ocrUsed = true → no second scan offered
  const [ocrUsed, setOcrUsed] = useState(false);

  // ── Profile photo ─────────────────────────────────────────────────────────
  const [profilePhotoBase64, setProfilePhotoBase64] = useState<string | null>(null);
  const [profilePhotoPreview, setProfilePhotoPreview] = useState<string | null>(null);
  const profileInputRef = useRef<HTMLInputElement>(null);

  // ── Consent state ─────────────────────────────────────────────────────────
  const [consentChoices, setConsentChoices] = useState<Record<string, boolean>>({});
  const [consentDocBase64, setConsentDocBase64] = useState<string | null>(null);
  const [consentDocPreview, setConsentDocPreview] = useState<string | null>(null);
  const [numeroSerie, setNumeroSerie] = useState("");
  const consentDocInputRef = useRef<HTMLInputElement>(null);

  // ── Family members ────────────────────────────────────────────────────────
  const [numAdultos, setNumAdultos] = useState(1);
  const [numMenores, setNumMenores] = useState(0);
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);

  const { data: programs = [] } = usePrograms();

  // ── Form ──────────────────────────────────────────────────────────────────
  const {
    register,
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
  const watchedIdioma = (watch("idioma_principal") ?? "es") as "es" | "ar" | "fr" | "bm";

  // Consent templates
  const { data: consentTemplatesEs = [] } = useConsentTemplates("es");
  const { data: consentTemplatesLang = [] } = useConsentTemplates(
    watchedIdioma !== "es" ? watchedIdioma : "es"
  );

  // Duplicate check
  const { data: duplicates = [] } = useDuplicateCheck(
    watchedNombre,
    watchedApellidos,
    step >= 1 && !duplicateDismissed
  );
  const showDuplicateWarning = step === 1 && duplicates.length > 0 && !duplicateDismissed;

  // ── Derived: which programs are selected ─────────────────────────────────
  const selectedPrograms = useMemo(
    () => programs.filter((p) => watchedProgramIds.includes(p.id)),
    [programs, watchedProgramIds]
  );
  const hasBancoAlimentos = selectedPrograms.some((p) => p.slug === SLUG_BANCO_ALIMENTOS);
  const hasFamilia = selectedPrograms.some((p) => p.slug === SLUG_FAMILIA);

  // ── Dynamic consent groups ────────────────────────────────────────────────
  const groupAPurposes = ["tratamiento_datos_bocatas", "fotografia", "comunicaciones_whatsapp"];
  const groupBPurposes = hasBancoAlimentos ? ["tratamiento_datos_banco_alimentos"] : [];
  const groupCPurposes = hasFamilia ? ["compartir_datos_red"] : [];

  const groupAAccepted = groupAPurposes.every((p) => consentChoices[p] === true);

  // ── Total steps: 9 base, +1 if familia selected ───────────────────────────
  const TOTAL_STEPS = hasFamilia ? 9 : 8;

  const STEP_LABELS = useMemo(() => {
    const base = [
      "Canal de llegada",
      "Identidad",
      "Documento",
      "Contacto",
      "Situación",
      "Información social",
      "Foto de perfil",
      "Consentimiento RGPD",
    ];
    if (hasFamilia) base.push("Programa Familias");
    return base;
  }, [hasFamilia]);

  // ── OCR handler (shared between Step 1 and Step 2) ────────────────────────
  const handleOCRExtracted = useCallback((data: OcrExtracted) => {
    if (data.nombre) setValue("nombre", data.nombre);
    if (data.apellidos) setValue("apellidos", data.apellidos);
    if (data.fecha_nacimiento) setValue("fecha_nacimiento", data.fecha_nacimiento);
    if (data.numero_documento) setValue("numero_documento", data.numero_documento);
    if (data.tipo_documento) {
      const tipoMap: Record<string, PersonCreate["tipo_documento"]> = {
        DNI: "DNI", NIE: "NIE", Pasaporte: "Pasaporte", Documento_Extranjero: "Documento_Extranjero", Sin_Documentacion: "Sin_Documentacion",
        dni: "DNI", nie: "NIE", pasaporte: "Pasaporte", documento_extranjero: "Documento_Extranjero", otro: "Sin_Documentacion",
      };
      const normalized = tipoMap[data.tipo_documento];
      if (normalized) setValue("tipo_documento", normalized);
    }
    // Populate pais_documento from OCR if available
    if (data.pais_documento) setValue("pais_documento", data.pais_documento);
    setOcrUsed(true);
  }, [setValue]);

  // ── Step validation ───────────────────────────────────────────────────────
  const STEP_FIELDS = useMemo<(keyof PersonCreate)[][]>(() => [
    ["canal_llegada"],
    ["nombre", "apellidos", "fecha_nacimiento", "idioma_principal"],
    [], [], [], [], [], [], [],
  ], []);

  const goNext = useCallback(async () => {
    const fields = STEP_FIELDS[step] ?? [];
    if (fields.length > 0) {
      const valid = await trigger(fields as (keyof PersonCreate)[]);
      if (!valid) return;
    }
    // Step 5 (Programs): at least one program must be selected
    if (step === 5 && watchedProgramIds.length === 0) {
      toast.error("Debes seleccionar al menos un programa antes de continuar.");
      return;
    }
    if (showDuplicateWarning) return;
    setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
  }, [step, trigger, showDuplicateWarning, STEP_FIELDS, TOTAL_STEPS, watchedProgramIds]);

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

  // ── Profile photo ─────────────────────────────────────────────────────────
  const handleProfilePhotoFile = useCallback(async (file: File) => {
    try {
      const base64 = await compressImage(file, 800, 0.85);
      setProfilePhotoBase64(base64);
      setProfilePhotoPreview(`data:image/jpeg;base64,${base64}`);
    } catch {
      toast.error("Error al procesar la foto.");
    }
  }, []);

  const handleConsentDocFile = useCallback(async (file: File) => {
    try {
      const base64 = await compressImage(file, 1200, 0.85);
      setConsentDocBase64(base64);
      setConsentDocPreview(`data:image/jpeg;base64,${base64}`);
    } catch {
      toast.error("Error al procesar el documento.");
    }
  }, []);

  // ── Family members helpers ────────────────────────────────────────────────
  const addFamilyMember = useCallback(() => {
    setFamilyMembers((prev) => [
      ...prev,
      { nombre: "", apellidos: "", fecha_nacimiento: "", parentesco: "" },
    ]);
  }, []);

  const removeFamilyMember = useCallback((idx: number) => {
    setFamilyMembers((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const updateFamilyMember = useCallback((idx: number, field: keyof FamilyMember, value: string) => {
    setFamilyMembers((prev) =>
      prev.map((m, i) => (i === idx ? { ...m, [field]: value } : m))
    );
  }, []);

  // ── Final submit ──────────────────────────────────────────────────────────
  const { isSubmitting, handleFinalSubmit } = useRegistrationSubmit({
    groupAAccepted,
    getValues,
    profilePhotoBase64,
    consentDocBase64,
    consentChoices,
    consentTemplatesEs,
    numeroSerie,
    groupAPurposes,
    groupBPurposes,
    groupCPurposes,
    hasFamilia,
    familyMembers,
    numAdultos,
    numMenores,
  });

  const progress = ((step + 1) / TOTAL_STEPS) * 100;
  const isLastStep = step === TOTAL_STEPS - 1;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-lg md:max-w-2xl lg:max-w-4xl space-y-6 p-4">
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

      <div className="space-y-4">
        {step === 0 && (
          <Step0Canal register={register} watch={watch} setValue={setValue} errors={errors} />
        )}
        {step === 1 && (
          <Step1Identidad
            register={register}
            watch={watch}
            setValue={setValue}
            errors={errors}
            ocrUsed={ocrUsed}
            handleOCRExtracted={handleOCRExtracted}
            showDuplicateWarning={showDuplicateWarning}
            duplicates={duplicates as DuplicateCandidate[]}
            onDismissDuplicate={() => setDuplicateDismissed(true)}
          />
        )}
        {step === 2 && (
          <Step2Documento
            register={register}
            watch={watch}
            setValue={setValue}
            handleOCRExtracted={handleOCRExtracted}
          />
        )}
        {step === 3 && <Step3Contacto register={register} errors={errors} />}
        {step === 4 && <Step4Situacion watch={watch} setValue={setValue} />}
        {step === 5 && (
          <Step5Social
            register={register}
            programs={programs}
            watchedProgramIds={watchedProgramIds}
            toggleProgram={toggleProgram}
            hasFamilia={hasFamilia}
          />
        )}
        {step === 6 && (
          <Step6Foto
            profilePhotoPreview={profilePhotoPreview}
            setProfilePhotoBase64={setProfilePhotoBase64}
            setProfilePhotoPreview={setProfilePhotoPreview}
            profileInputRef={profileInputRef}
            handleProfilePhotoFile={handleProfilePhotoFile}
          />
        )}
        {step === 7 && (
          <Step7Consent
            consentChoices={consentChoices}
            setConsentChoices={setConsentChoices}
            groupAPurposes={groupAPurposes}
            groupBPurposes={groupBPurposes}
            groupCPurposes={groupCPurposes}
            groupAAccepted={groupAAccepted}
            consentTemplatesEs={consentTemplatesEs}
            consentTemplatesLang={consentTemplatesLang}
            numeroSerie={numeroSerie}
            setNumeroSerie={setNumeroSerie}
            consentDocPreview={consentDocPreview}
            setConsentDocBase64={setConsentDocBase64}
            setConsentDocPreview={setConsentDocPreview}
            consentDocInputRef={consentDocInputRef}
            handleConsentDocFile={handleConsentDocFile}
          />
        )}
        {step === 8 && hasFamilia && (
          <Step8Familia
            numAdultos={numAdultos}
            setNumAdultos={setNumAdultos}
            numMenores={numMenores}
            setNumMenores={setNumMenores}
            familyMembers={familyMembers}
            addFamilyMember={addFamilyMember}
            removeFamilyMember={removeFamilyMember}
            updateFamilyMember={updateFamilyMember}
          />
        )}

        {/* Navigation buttons */}
        <div className="sticky bottom-0 flex gap-3 pt-2 pb-2 bg-background border-t">
          {step > 0 && (
            <Button type="button" variant="outline" onClick={goBack} className="flex-1">
              <ChevronLeft className="mr-1 h-4 w-4" /> Anterior
            </Button>
          )}
          {!isLastStep ? (
            <Button
              type="button"
              onClick={goNext}
              disabled={showDuplicateWarning}
              className="flex-1"
            >
              Siguiente <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          ) : (
            <Button
              type="button"
              onClick={handleFinalSubmit}
              disabled={isSubmitting || !groupAAccepted}
              className="flex-1"
            >
              {isSubmitting ? (
                <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Guardando...</>
              ) : (
                <><CheckCircle className="mr-1 h-4 w-4" /> Registrar persona</>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
