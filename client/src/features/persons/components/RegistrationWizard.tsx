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
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ChevronLeft, ChevronRight, CheckCircle, Loader2, Camera, ImageIcon,
  AlertCircle, ShieldCheck, ShieldX, Upload, X, Plus, Trash2, Users,
} from "lucide-react";
import {
  PersonCreateSchema,
  type PersonCreate,
  CANAL_LLEGADA_LABELS,
  GENERO_LABELS,
  IDIOMA_LABELS,
  TIPO_DOCUMENTO_LABELS,
  PAIS_DOCUMENTO_LABELS,
  SITUACION_LEGAL_LABELS,
  TIPO_VIVIENDA_LABELS,
  NIVEL_ESTUDIOS_LABELS,
  SITUACION_LABORAL_LABELS,
  NIVEL_INGRESOS_LABELS,
  PAIS_LABELS,
  type OcrExtracted,
  type DuplicateCandidate,
} from "../schemas";
import { useCreatePerson } from "../hooks/useCreatePerson";
import { useEnrollPerson } from "../hooks/useEnrollPerson";
import { useDuplicateCheck } from "../hooks/useDuplicateCheck";
import { usePrograms } from "../hooks/usePrograms";
import { useConsentTemplates } from "../hooks/useConsentTemplates";
import { DocumentCaptureInline } from "./DocumentCaptureInline";
import { DuplicateWarningCard } from "./DuplicateWarningCard";
import { compressImage } from "../utils/imageUtils";
import { trpc } from "@/lib/trpc";

// ─── Constants ────────────────────────────────────────────────────────────────

const CONSENT_PURPOSE_LABELS: Record<string, string> = {
  tratamiento_datos_bocatas: "Tratamiento de datos — Bocatas Digital",
  tratamiento_datos_banco_alimentos: "Tratamiento de datos — Banco de Alimentos",
  compartir_datos_red: "Compartir datos en red (Programa Familias)",
  comunicaciones_whatsapp: "Comunicaciones por WhatsApp",
  fotografia: "Uso de fotografía e imagen",
};

// Slugs that trigger extra consent groups
const SLUG_BANCO_ALIMENTOS = "comedor"; // Comedor Social uses Banco de Alimentos data
const SLUG_FAMILIA = "familia";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FamilyMember {
  nombre: string;
  apellidos: string;
  fecha_nacimiento: string;
  parentesco: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function SelectField({
  label, id, value, onChange, options, placeholder, required,
}: {
  label: string; id: string; value: string; onChange: (v: string) => void;
  options: Record<string, string>; placeholder?: string; required?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>
        {label}
        {required && <span className="ml-1 text-destructive">*</span>}
      </Label>
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

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-0.5 text-xs text-destructive">{message}</p>;
}

// ─── Wizard ───────────────────────────────────────────────────────────────────

export function RegistrationWizard() {
  const [, navigate] = useLocation();
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

  // ── Submit state ──────────────────────────────────────────────────────────
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── tRPC ──────────────────────────────────────────────────────────────────
  const { mutateAsync: createPerson } = useCreatePerson();
  const { mutateAsync: enrollPerson } = useEnrollPerson();
  const { mutateAsync: saveConsents } = trpc.persons.saveConsents.useMutation();
  const { mutateAsync: createFamily } = trpc.persons.createFamily.useMutation();
  const { mutateAsync: uploadPhoto } = trpc.persons.uploadPhoto.useMutation();
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
  const allRequiredPurposes = [...groupAPurposes]; // only A is required
  const allOptionalPurposes = [...groupBPurposes, ...groupCPurposes];

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
  const handleFinalSubmit = useCallback(async () => {
    // Guard against multiple concurrent submissions (race condition fix)
    if (isSubmitting) {
      return;
    }

    if (!groupAAccepted) {
      toast.error("Debes aceptar los consentimientos del Grupo A para continuar.");
      return;
    }

    setIsSubmitting(true);
    try {
      const data = getValues();

      // 1. Upload profile photo if captured
      let fotoPerfilUrl: string | null = null;
      if (profilePhotoBase64) {
        try {
          const result = await uploadPhoto({
            bucket: "fotos-perfil",
            base64: profilePhotoBase64,
          });
          fotoPerfilUrl = result.url;
        } catch {
          toast.warning("Foto de perfil no guardada. Puedes añadirla desde el perfil.");
        }
      }

      // 2. Upload consent document if captured
      let consentDocUrl: string | null = null;
      if (consentDocBase64) {
        try {
          const result = await uploadPhoto({
            bucket: "documentos-consentimiento",
            base64: consentDocBase64,
          });
          consentDocUrl = result.url;
        } catch {
          toast.warning("Foto del documento de consentimiento no guardada.");
        }
      }

      // 3. Create person
      const person = await createPerson({
        data: { ...data, foto_perfil_url: fotoPerfilUrl },
      });

      // 4. Enroll in programs
      if (data.program_ids.length > 0 && person?.id) {
        try {
          await enrollPerson({ personId: person.id, programIds: data.program_ids });
        } catch {
          toast.warning("Programas no asignados. Puedes asignarlos desde el perfil.");
        }
      }

      // 5. Save consents
      const allPurposes = [...groupAPurposes, ...groupBPurposes, ...groupCPurposes];
      const consentRows = allPurposes.map((purpose) => {
        const template = consentTemplatesEs.find((t) => t.purpose === purpose);
        return {
          purpose: purpose as "tratamiento_datos_bocatas" | "tratamiento_datos_banco_alimentos" | "compartir_datos_red" | "comunicaciones_whatsapp" | "fotografia",
          idioma: "es" as const,
          granted: consentChoices[purpose] === true,
          granted_at: new Date().toISOString(),
          consent_text: template?.text_content ?? "",
          consent_version: template?.version ?? "1.0",
          documento_foto_url: consentDocUrl,
          numero_serie: numeroSerie || null,
        };
      });

      await saveConsents({ personId: person.id, consents: consentRows });

      // 6. Create family record if applicable
      if (hasFamilia && person?.id) {
        try {
          await createFamily({
            titularId: person.id,
            miembros: familyMembers.filter((m) => m.nombre.trim() !== ""),
            numAdultos,
            numMenores,
          });
        } catch {
          toast.warning("Registro de familia no completado. Puedes completarlo desde el perfil.");
        }
      }

      toast.success("Persona registrada correctamente");
      navigate(`/personas/${person.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error desconocido";
      toast.error(`Error al registrar: ${message}`);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    groupAAccepted, getValues, profilePhotoBase64, consentDocBase64,
    createPerson, enrollPerson, saveConsents, createFamily,
    consentChoices, consentTemplatesEs, numeroSerie,
    groupAPurposes, groupBPurposes, groupCPurposes,
    hasFamilia, familyMembers, numAdultos, numMenores, navigate,
  ]);

  const progress = ((step + 1) / TOTAL_STEPS) * 100;
  const isLastStep = step === TOTAL_STEPS - 1;

  // ── Render ────────────────────────────────────────────────────────────────
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

      <div className="space-y-4">

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
            <FieldError message={errors.canal_llegada?.message} />
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

        {/* ── Step 1: Identidad (OCR optional) ── */}
        {step === 1 && (
          <div className="space-y-4">
            {/* OCR — offered here if not yet used */}
            {!ocrUsed ? (
              <DocumentCaptureInline onExtracted={handleOCRExtracted} />
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
                <CheckCircle className="h-4 w-4 shrink-0" />
                <span>Datos extraídos del documento. Revisa y edita si es necesario.</span>
              </div>
            )}

            {showDuplicateWarning && (
              <DuplicateWarningCard
                candidates={duplicates as DuplicateCandidate[]}
                onContinueAnyway={() => setDuplicateDismissed(true)}
              />
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="nombre">Nombre <span className="text-destructive">*</span></Label>
                <Input id="nombre" {...register("nombre")} autoComplete="given-name" />
                <FieldError message={errors.nombre?.message} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="apellidos">Apellidos <span className="text-destructive">*</span></Label>
                <Input id="apellidos" {...register("apellidos")} autoComplete="family-name" />
                <FieldError message={errors.apellidos?.message} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="fecha_nacimiento">Fecha de nacimiento <span className="text-destructive">*</span></Label>
                <Input id="fecha_nacimiento" type="date" {...register("fecha_nacimiento")} />
                <FieldError message={errors.fecha_nacimiento?.message} />
              </div>
              <SelectField
                label="Género"
                id="genero"
                value={watch("genero") ?? ""}
                onChange={(v) => setValue("genero", v as PersonCreate["genero"])}
                options={GENERO_LABELS}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <SelectField
                label="País de origen"
                id="pais_origen"
                value={watch("pais_origen") ?? ""}
                onChange={(v) => setValue("pais_origen", v || null)}
                options={PAIS_LABELS}
                placeholder="Seleccionar país..."
              />
              <SelectField
                label="Idioma principal"
                id="idioma_principal"
                value={watch("idioma_principal") ?? "es"}
                onChange={(v) => setValue("idioma_principal", v as PersonCreate["idioma_principal"])}
                options={IDIOMA_LABELS}
                required
              />
            </div>
            <FieldError message={errors.idioma_principal?.message} />
          </div>
        )}

        {/* ── Step 2: Documento (OCR offered only if not yet used) ── */}
        {step === 2 && (
          <div className="space-y-4">
            {/* Check if OCR data is already populated in form fields */}
            {watch("numero_documento") || watch("tipo_documento") ? (
              <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
                <CheckCircle className="h-4 w-4 shrink-0" />
                <span>Datos del documento ya extraídos. Revisa y edita si es necesario.</span>
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Puedes escanear el documento para rellenar los campos automáticamente.
                </p>
                <DocumentCaptureInline onExtracted={handleOCRExtracted} />
              </>
            )}

            <div className="grid grid-cols-2 gap-3">
              <SelectField
                label="Tipo de documento"
                id="tipo_documento"
                value={watch("tipo_documento") ?? ""}
                onChange={(v) => setValue("tipo_documento", v as PersonCreate["tipo_documento"])}
                options={TIPO_DOCUMENTO_LABELS}
              />
              {watch("tipo_documento") === "Documento_Extranjero" && (
                <SelectField
                  label="País del documento"
                  id="pais_documento"
                  value={watch("pais_documento") ?? ""}
                  onChange={(v) => setValue("pais_documento", v || null)}
                  options={PAIS_DOCUMENTO_LABELS}
                  placeholder="Seleccionar país..."
                />
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="numero_documento">Número de documento</Label>
              <Input id="numero_documento" {...register("numero_documento")} placeholder="12345678A" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <SelectField
                label="Situación legal"
                id="situacion_legal"
                value={watch("situacion_legal") ?? ""}
                onChange={(v) => setValue("situacion_legal", v as PersonCreate["situacion_legal"])}
                options={SITUACION_LEGAL_LABELS}
              />
              <div className="space-y-1">
                <Label htmlFor="fecha_llegada_espana">Llegada a España</Label>
                <Input id="fecha_llegada_espana" type="date" {...register("fecha_llegada_espana")} />
              </div>
            </div>
          </div>
        )}

        {/* ── Step 3: Contacto ── */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="telefono">Teléfono</Label>
                <Input id="telefono" type="tel" {...register("telefono")} placeholder="+34 612 345 678" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" {...register("email")} placeholder="correo@ejemplo.com" />
                <FieldError message={errors.email?.message} />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="direccion">Dirección</Label>
              <Input id="direccion" {...register("direccion")} placeholder="Calle Mayor 1, 2ºA" />
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
            <div className="grid grid-cols-2 gap-3">
              <SelectField
                label="Tipo de vivienda"
                id="tipo_vivienda"
                value={watch("tipo_vivienda") ?? ""}
                onChange={(v) => setValue("tipo_vivienda", v as PersonCreate["tipo_vivienda"])}
                options={Object.fromEntries(
                  Object.entries(TIPO_VIVIENDA_LABELS).map(([k, v]) => [
                    k,
                    typeof v === "object" && "label" in v ? `${(v as {icon:string;label:string}).icon} ${(v as {icon:string;label:string}).label}` : String(v),
                  ])
                )}
              />
              <SelectField
                label="Nivel de estudios"
                id="nivel_estudios"
                value={watch("nivel_estudios") ?? ""}
                onChange={(v) => setValue("nivel_estudios", v as PersonCreate["nivel_estudios"])}
                options={NIVEL_ESTUDIOS_LABELS}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <SelectField
                label="Situación laboral"
                id="situacion_laboral"
                value={watch("situacion_laboral") ?? ""}
                onChange={(v) => setValue("situacion_laboral", v as PersonCreate["situacion_laboral"])}
                options={SITUACION_LABORAL_LABELS}
              />
              <SelectField
                label="Ingresos aproximados"
                id="nivel_ingresos"
                value={watch("nivel_ingresos") ?? ""}
                onChange={(v) => setValue("nivel_ingresos", v as PersonCreate["nivel_ingresos"])}
                options={NIVEL_INGRESOS_LABELS}
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="empadronado"
                checked={watch("empadronado") ?? false}
                onCheckedChange={(v) => setValue("empadronado", v === true)}
              />
              <Label htmlFor="empadronado" className="cursor-pointer">Empadronado/a en Madrid</Label>
            </div>
          </div>
        )}

        {/* ── Step 5: Información social + Programas ── */}
        {step === 5 && (
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
        )}

        {/* ── Step 6: Foto de perfil ── */}
        {step === 6 && (
          <div className="space-y-4">
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Camera className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">Foto de perfil (opcional)</p>
                  <p className="text-xs text-muted-foreground">Ayuda a identificar a la persona en el check-in</p>
                </div>
              </div>

              {profilePhotoPreview ? (
                <div className="space-y-2">
                  <img
                    src={profilePhotoPreview}
                    alt="Vista previa"
                    className="h-36 w-36 rounded-full object-cover mx-auto border-2 border-primary"
                  />
                  <div className="flex gap-2 justify-center">
                    <Button type="button" size="sm" variant="outline"
                      onClick={() => { setProfilePhotoBase64(null); setProfilePhotoPreview(null); }}>
                      <X className="mr-1 h-3 w-3" /> Eliminar
                    </Button>
                    <Button type="button" size="sm" variant="outline"
                      onClick={() => profileInputRef.current?.click()}>
                      <Camera className="mr-1 h-3 w-3" /> Repetir
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button type="button" variant="outline" className="flex-1"
                    onClick={() => {
                      if (profileInputRef.current) {
                        profileInputRef.current.accept = "image/*";
                        profileInputRef.current.setAttribute("capture", "user");
                        profileInputRef.current.click();
                      }
                    }}>
                    <Camera className="mr-2 h-4 w-4" /> Usar cámara
                  </Button>
                  <Button type="button" variant="outline" className="flex-1"
                    onClick={() => {
                      if (profileInputRef.current) {
                        profileInputRef.current.accept = "image/*";
                        profileInputRef.current.removeAttribute("capture");
                        profileInputRef.current.click();
                      }
                    }}>
                    <ImageIcon className="mr-2 h-4 w-4" /> Desde galería
                  </Button>
                </div>
              )}

              <input ref={profileInputRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleProfilePhotoFile(file);
                  e.target.value = "";
                }} />
            </div>
            <p className="text-xs text-center text-muted-foreground">
              Puedes añadir o cambiar la foto más adelante desde el perfil.
            </p>
          </div>
        )}

        {/* ── Step 7: Consentimiento RGPD ── */}
        {step === 7 && (
          <div className="space-y-4 pb-16">
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
              <p className="text-sm font-medium text-blue-800">🔒 Protección de datos (RGPD Art. 7)</p>
              <p className="text-xs text-blue-700 mt-1">
                El Grupo A es obligatorio. Sin su aceptación no se puede completar el registro.
              </p>
            </div>

            {/* Group A — Required */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="font-semibold">Grupo A — Obligatorio</Label>
                <div className="flex gap-1">
                  <Button type="button" size="sm" variant="outline" className="h-7 text-xs"
                    onClick={() => {
                      const all = { ...consentChoices };
                      groupAPurposes.forEach((p) => { all[p] = true; });
                      setConsentChoices(all);
                    }}>
                    <ShieldCheck className="mr-1 h-3 w-3 text-green-600" /> Aceptar todo
                  </Button>
                  <Button type="button" size="sm" variant="outline" className="h-7 text-xs"
                    onClick={() => {
                      const all = { ...consentChoices };
                      groupAPurposes.forEach((p) => { all[p] = false; });
                      setConsentChoices(all);
                    }}>
                    <ShieldX className="mr-1 h-3 w-3 text-destructive" /> Denegar todo
                  </Button>
                </div>
              </div>

              <ScrollArea className="max-h-52 rounded-md border">
                <div className="p-3 space-y-3">
                  {groupAPurposes.map((purpose) => {
                    const templateEs = consentTemplatesEs.find((t) => t.purpose === purpose);
                    const templateLang = consentTemplatesLang.find((t) => t.purpose === purpose);
                    return (
                      <div key={purpose} className="space-y-1">
                        <div className="flex items-start gap-3">
                          <Checkbox
                            id={`ca-${purpose}`}
                            checked={consentChoices[purpose] === true}
                            onCheckedChange={(v) =>
                              setConsentChoices((prev) => ({ ...prev, [purpose]: v === true }))
                            }
                            className="mt-0.5"
                          />
                          <div className="flex-1 space-y-1">
                            <Label htmlFor={`ca-${purpose}`} className="cursor-pointer font-medium text-sm">
                              {CONSENT_PURPOSE_LABELS[purpose]}
                            </Label>
                            <Badge variant="outline" className="text-xs">Requerido</Badge>
                            <div className={`grid gap-2 mt-1 ${templateLang && templateLang.idioma !== "es" ? "grid-cols-2" : "grid-cols-1"}`}>
                              {templateEs && (
                                <div className="rounded bg-muted p-2">
                                  <p className="text-xs font-medium mb-1">🇪🇸 Español</p>
                                  <p className="text-xs text-muted-foreground line-clamp-3">{templateEs.text_content}</p>
                                </div>
                              )}
                              {templateLang && templateLang.idioma !== "es" && (
                                <div className="rounded bg-muted p-2">
                                  <p className="text-xs font-medium mb-1">🌐 {templateLang.idioma.toUpperCase()}</p>
                                  <p className="text-xs text-muted-foreground line-clamp-3">{templateLang.text_content}</p>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>

            {/* Group B — Banco de Alimentos (if comedor selected) */}
            {groupBPurposes.length > 0 && (
              <div className="space-y-2">
                <Label className="font-semibold">Grupo B — Banco de Alimentos</Label>
                {groupBPurposes.map((purpose) => {
                  const templateEs = consentTemplatesEs.find((t) => t.purpose === purpose);
                  return (
                    <div key={purpose} className="rounded-lg border p-3 space-y-1">
                      <div className="flex items-start gap-3">
                        <Checkbox
                          id={`cb-${purpose}`}
                          checked={consentChoices[purpose] === true}
                          onCheckedChange={(v) =>
                            setConsentChoices((prev) => ({ ...prev, [purpose]: v === true }))
                          }
                          className="mt-0.5"
                        />
                        <div className="flex-1 space-y-1">
                          <Label htmlFor={`cb-${purpose}`} className="cursor-pointer font-medium text-sm">
                            {CONSENT_PURPOSE_LABELS[purpose]}
                          </Label>
                          <Badge variant="secondary" className="text-xs">Requerido para Comedor Social</Badge>
                          {templateEs && (
                            <p className="text-xs text-muted-foreground line-clamp-2">{templateEs.text_content}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Group C — Familias (if familia selected) */}
            {groupCPurposes.length > 0 && (
              <div className="space-y-2">
                <Label className="font-semibold">Grupo C — Programa Familias</Label>
                {groupCPurposes.map((purpose) => {
                  const templateEs = consentTemplatesEs.find((t) => t.purpose === purpose);
                  return (
                    <div key={purpose} className="rounded-lg border p-3 space-y-1">
                      <div className="flex items-start gap-3">
                        <Checkbox
                          id={`cc-${purpose}`}
                          checked={consentChoices[purpose] === true}
                          onCheckedChange={(v) =>
                            setConsentChoices((prev) => ({ ...prev, [purpose]: v === true }))
                          }
                          className="mt-0.5"
                        />
                        <div className="flex-1 space-y-1">
                          <Label htmlFor={`cc-${purpose}`} className="cursor-pointer font-medium text-sm">
                            {CONSENT_PURPOSE_LABELS[purpose]}
                          </Label>
                          <Badge variant="secondary" className="text-xs">Opcional</Badge>
                          {templateEs && (
                            <p className="text-xs text-muted-foreground line-clamp-2">{templateEs.text_content}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Physical document (optional) */}
            {groupAAccepted && (
              <div className="rounded-lg border p-3 space-y-3">
                <p className="text-sm font-medium">📄 Documento firmado (opcional)</p>
                <div className="space-y-1">
                  <Label htmlFor="numero_serie">Nº de serie del formulario</Label>
                  <Input
                    id="numero_serie"
                    value={numeroSerie}
                    onChange={(e) => setNumeroSerie(e.target.value)}
                    placeholder="BCT-2026-00142"
                  />
                </div>
                {consentDocPreview ? (
                  <div className="space-y-2">
                    <img src={consentDocPreview} alt="Documento" className="w-full rounded border object-cover max-h-32" />
                    <div className="flex gap-2">
                      <Button type="button" size="sm" variant="outline"
                        onClick={() => { setConsentDocBase64(null); setConsentDocPreview(null); }}>
                        <X className="mr-1 h-3 w-3" /> Eliminar
                      </Button>
                      <Button type="button" size="sm" variant="outline"
                        onClick={() => consentDocInputRef.current?.click()}>
                        <Camera className="mr-1 h-3 w-3" /> Repetir
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button type="button" size="sm" variant="outline" className="flex-1"
                      onClick={() => {
                        if (consentDocInputRef.current) {
                          consentDocInputRef.current.setAttribute("capture", "environment");
                          consentDocInputRef.current.click();
                        }
                      }}>
                      <Camera className="mr-1 h-3 w-3" /> Cámara
                    </Button>
                    <Button type="button" size="sm" variant="outline" className="flex-1"
                      onClick={() => {
                        if (consentDocInputRef.current) {
                          consentDocInputRef.current.removeAttribute("capture");
                          consentDocInputRef.current.click();
                        }
                      }}>
                      <Upload className="mr-1 h-3 w-3" /> Subir imagen
                    </Button>
                  </div>
                )}
                <input ref={consentDocInputRef} type="file" accept="image/*" className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleConsentDocFile(file);
                    e.target.value = "";
                  }} />
              </div>
            )}

            {/* Decline warning */}
            {!groupAAccepted && Object.keys(consentChoices).length > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <p className="text-sm text-destructive">
                  Sin aceptar el Grupo A no es posible completar el registro.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── Step 8: Programa Familias (conditional) ── */}
        {step === 8 && hasFamilia && (
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
        )}

        {/* Navigation buttons */}
        <div className="flex gap-3 pt-2">
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
