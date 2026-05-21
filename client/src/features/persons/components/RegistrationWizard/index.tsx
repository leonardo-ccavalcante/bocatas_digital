/**
 * RegistrationWizard — person registration as a 4-phase editorial wizard.
 *
 * The v4 prototype (persona-nueva.jsx) shows a 4-step stepper:
 *   1 · Identidad   2 · Contacto   3 · Programa   4 · Resumen
 *
 * The underlying form keeps ALL existing functionality (OCR, duplicate
 * detection, dynamic RGPD consent groups, profile photo, family members) by
 * grouping the 9 functional steps into those 4 visual phases:
 *
 *   Phase 1 (Identidad) → Canal + Identidad + Documento
 *   Phase 2 (Contacto)  → Contacto + Situación
 *   Phase 3 (Programa)  → Social/Programas + Foto + Consentimiento [+ Familias]
 *   Phase 4 (Resumen)   → read-only review before submit
 *
 * Per-phase gating is driven by the EXISTING Zod schema (PersonCreateSchema)
 * via react-hook-form `trigger()` on the fields owned by each phase — no
 * validation logic is duplicated in this component.
 *
 * Submission path is unchanged: useRegistrationSubmit → createPerson +
 * enrollPerson + saveConsents + createFamily (see _useSubmit.ts).
 */
import { useState, useCallback, useMemo, useRef } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CheckCircle, Loader2 } from "lucide-react";
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
import {
  type FamilyMember,
  SLUG_BANCO_ALIMENTOS,
  SLUG_FAMILIA,
  TEMPLATE_LANGUAGES,
} from "./_shared";
import { useRegistrationSubmit } from "./_useSubmit";
import { type StepperPhase } from "../registration/WizardStepper";
import { WizardHeader } from "../registration/WizardHeader";
import { WizardPhases } from "../registration/WizardPhases";
import { StepResumen } from "../registration/StepResumen";
import { SectionTitle } from "../registration/SectionTitle";

const PHASES: readonly StepperPhase[] = [
  { n: 1, label: "Identidad" },
  { n: 2, label: "Contacto" },
  { n: 3, label: "Programa" },
  { n: 4, label: "Resumen" },
];
const TOTAL_PHASES = PHASES.length;

// Per-phase validation fields (derived from PersonCreateSchema keys). Phase 1
// gate = identity required fields; phases 2/3 have no hard-required fields
// beyond the program rule (handled in goNext). Static → module-level.
// 3 entries only (phases 1-3); phase 4 (Resumen) submits via handleFinalSubmit
// and is never reached by goNext.
const PHASE_FIELDS: readonly (keyof PersonCreate)[][] = [
  ["canal_llegada", "nombre", "apellidos", "fecha_nacimiento", "idioma_principal"],
  [],
  [],
];

// OCR returns tipo_documento in mixed/lowercase casing (LLM output); map to the
// DB enum values. Static lookup → module-level.
const OCR_TIPO_DOC_MAP: Record<string, PersonCreate["tipo_documento"]> = {
  DNI: "DNI", NIE: "NIE", Pasaporte: "Pasaporte",
  Documento_Extranjero: "Documento_Extranjero", Sin_Documentacion: "Sin_Documentacion",
  dni: "DNI", nie: "NIE", pasaporte: "Pasaporte",
  documento_extranjero: "Documento_Extranjero", otro: "Sin_Documentacion",
};

// Image compression budgets (px = longest edge, quality = JPEG quality 0-1).
const PROFILE_PHOTO_MAX_PX = 800;
const DOC_PHOTO_MAX_PX = 1200;
const PHOTO_QUALITY = 0.85;

export function RegistrationWizard() {
  const [phase, setPhase] = useState(1);
  const [duplicateDismissed, setDuplicateDismissed] = useState(false);
  const [, navigate] = useLocation();

  // ── OCR shared state ──────────────────────────────────────────────────────
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
  const rawProgramIds = watch("program_ids");
  const watchedProgramIds = useMemo(() => rawProgramIds ?? [], [rawProgramIds]);
  const watchedIdioma = (watch("idioma_principal") ?? "es") as PersonCreate["idioma_principal"];

  // Consent fallback: no active template in the person's language → show
  // Spanish + verbal-translation banner (never silently render Spanish).
  const needsVerbalFallback = !TEMPLATE_LANGUAGES.has(watchedIdioma);
  const langForTemplates = (TEMPLATE_LANGUAGES.has(watchedIdioma) ? watchedIdioma : "es") as
    | "es"
    | "ar"
    | "fr"
    | "bm";

  // Consent templates
  const { data: consentTemplatesEs = [] } = useConsentTemplates("es");
  const { data: consentTemplatesLang = [] } = useConsentTemplates(langForTemplates);

  // Duplicate check belongs to the identity phase (phase 1) — matches the
  // showDuplicateWarning gate below.
  const { data: duplicates = [] } = useDuplicateCheck(
    watchedNombre,
    watchedApellidos,
    phase === 1 && !duplicateDismissed
  );
  const showDuplicateWarning = phase === 1 && duplicates.length > 0 && !duplicateDismissed;

  // ── Derived: selected programs ──────────────────────────────────────────────
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

  // ── OCR handler ─────────────────────────────────────────────────────────────
  const handleOCRExtracted = useCallback(
    (data: OcrExtracted) => {
      if (data.nombre) setValue("nombre", data.nombre);
      if (data.apellidos) setValue("apellidos", data.apellidos);
      if (data.fecha_nacimiento) setValue("fecha_nacimiento", data.fecha_nacimiento);
      if (data.numero_documento) setValue("numero_documento", data.numero_documento);
      if (data.tipo_documento) {
        const normalized = OCR_TIPO_DOC_MAP[data.tipo_documento];
        if (normalized) setValue("tipo_documento", normalized);
      }
      if (data.pais_documento) setValue("pais_documento", data.pais_documento);
      setOcrUsed(true);
    },
    [setValue]
  );

  // ── Navigation ──────────────────────────────────────────────────────────────
  const goNext = useCallback(async () => {
    // PHASE_FIELDS has 3 entries (phases 1-3); phase 4 (Resumen) submits via
    // handleFinalSubmit and is never reached by goNext.
    const fields = PHASE_FIELDS[phase - 1] ?? [];
    if (fields.length > 0) {
      const valid = await trigger(fields);
      if (!valid) return;
    }
    // Phase 3 requires at least one program before advancing to Resumen.
    if (phase === 3 && watchedProgramIds.length === 0) {
      toast.error("Debes seleccionar al menos un programa antes de continuar.");
      return;
    }
    if (showDuplicateWarning) return;
    setPhase((p) => Math.min(p + 1, TOTAL_PHASES));
  }, [phase, trigger, showDuplicateWarning, watchedProgramIds]);

  const goBack = useCallback(() => {
    setPhase((p) => Math.max(p - 1, 1));
  }, []);

  const toggleProgram = useCallback(
    (id: string) => {
      const current = (getValues("program_ids") as string[]) ?? [];
      const updated = current.includes(id)
        ? current.filter((p) => p !== id)
        : [...current, id];
      setValue("program_ids", updated, { shouldDirty: true });
    },
    [getValues, setValue]
  );

  // ── Profile photo / consent doc handlers ────────────────────────────────────
  const handleProfilePhotoFile = useCallback(async (file: File) => {
    try {
      const base64 = await compressImage(file, PROFILE_PHOTO_MAX_PX, PHOTO_QUALITY);
      setProfilePhotoBase64(base64);
      setProfilePhotoPreview(`data:image/jpeg;base64,${base64}`);
    } catch {
      toast.error("Error al procesar la foto.");
    }
  }, []);

  const handleConsentDocFile = useCallback(async (file: File) => {
    try {
      const base64 = await compressImage(file, DOC_PHOTO_MAX_PX, PHOTO_QUALITY);
      setConsentDocBase64(base64);
      setConsentDocPreview(`data:image/jpeg;base64,${base64}`);
    } catch {
      toast.error("Error al procesar el documento.");
    }
  }, []);

  // ── Family member helpers ────────────────────────────────────────────────────
  const addFamilyMember = useCallback(() => {
    setFamilyMembers((prev) => [
      ...prev,
      { nombre: "", apellidos: "", fecha_nacimiento: "", parentesco: "" },
    ]);
  }, []);
  const removeFamilyMember = useCallback((idx: number) => {
    setFamilyMembers((prev) => prev.filter((_, i) => i !== idx));
  }, []);
  const updateFamilyMember = useCallback(
    (idx: number, field: keyof FamilyMember, value: string) => {
      setFamilyMembers((prev) => prev.map((m, i) => (i === idx ? { ...m, [field]: value } : m)));
    },
    []
  );

  // ── Submit ───────────────────────────────────────────────────────────────────
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

  const isResumen = phase === TOTAL_PHASES;

  return (
    <div className="flex min-h-full flex-col bg-background">
      <WizardHeader phases={PHASES} current={phase} />

      {/* Body card */}
      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-8">
        <div className="bocatas-card overflow-hidden">
          <div className="px-5 py-6 sm:px-8">
            {isResumen ? (
              <>
                <SectionTitle
                  eyebrow="Resumen"
                  title="Revisa antes de crear"
                  sub="Si todo está correcto, pulsa Registrar persona. Podrás editar después."
                />
                <StepResumen
                  values={getValues()}
                  programs={programs}
                  consentChoices={consentChoices}
                  groupAPurposes={groupAPurposes}
                  groupBPurposes={groupBPurposes}
                  groupCPurposes={groupCPurposes}
                  hasFamilia={hasFamilia}
                  numAdultos={numAdultos}
                  numMenores={numMenores}
                />
              </>
            ) : (
              <WizardPhases
                phase={phase}
                register={register}
                watch={watch}
                setValue={setValue}
                getValues={getValues}
                errors={errors}
                ocrUsed={ocrUsed}
                handleOCRExtracted={handleOCRExtracted}
                showDuplicateWarning={showDuplicateWarning}
                duplicates={duplicates as DuplicateCandidate[]}
                onDismissDuplicate={() => setDuplicateDismissed(true)}
                programs={programs}
                watchedProgramIds={watchedProgramIds}
                toggleProgram={toggleProgram}
                hasFamilia={hasFamilia}
                profilePhotoPreview={profilePhotoPreview}
                setProfilePhotoBase64={setProfilePhotoBase64}
                setProfilePhotoPreview={setProfilePhotoPreview}
                profileInputRef={profileInputRef}
                handleProfilePhotoFile={handleProfilePhotoFile}
                consentChoices={consentChoices}
                setConsentChoices={setConsentChoices}
                groupAPurposes={groupAPurposes}
                groupBPurposes={groupBPurposes}
                groupCPurposes={groupCPurposes}
                groupAAccepted={groupAAccepted}
                consentTemplatesEs={consentTemplatesEs}
                consentTemplatesLang={consentTemplatesLang}
                needsVerbalFallback={needsVerbalFallback}
                numeroSerie={numeroSerie}
                setNumeroSerie={setNumeroSerie}
                consentDocPreview={consentDocPreview}
                setConsentDocBase64={setConsentDocBase64}
                setConsentDocPreview={setConsentDocPreview}
                consentDocInputRef={consentDocInputRef}
                handleConsentDocFile={handleConsentDocFile}
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
          </div>

          {/* Editorial footer */}
          <div className="flex items-center justify-between gap-3 border-t border-border bg-background px-5 py-4 sm:px-8">
            {phase === 1 ? (
              <Button type="button" variant="outline" onClick={() => navigate("/personas")}>
                Cancelar
              </Button>
            ) : (
              <Button type="button" variant="outline" onClick={goBack}>
                Atrás
              </Button>
            )}
            <span className="text-eyebrow text-muted-foreground">
              Paso {phase}/{TOTAL_PHASES}
            </span>
            {!isResumen ? (
              <Button type="button" onClick={goNext} disabled={showDuplicateWarning}>
                Continuar →
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleFinalSubmit}
                disabled={isSubmitting || !groupAAccepted}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" /> Guardando...
                  </>
                ) : (
                  <>
                    <CheckCircle className="mr-1 h-4 w-4" /> Registrar persona
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
