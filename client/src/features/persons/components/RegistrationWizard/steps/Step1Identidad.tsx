import type { UseFormRegister, UseFormWatch, UseFormSetValue, FieldErrors } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle } from "lucide-react";
import {
  type PersonCreate,
  type OcrExtracted,
  type DuplicateCandidate,
  GENERO_LABELS,
  IDIOMA_LABELS,
  PAIS_LABELS,
} from "../../../schemas";
import { DocumentCaptureInline } from "../../DocumentCaptureInline";
import { DuplicateWarningCard } from "../../DuplicateWarningCard";
import { SelectField, FieldError } from "../_shared";

interface Step1IdentidadProps {
  register: UseFormRegister<PersonCreate>;
  watch: UseFormWatch<PersonCreate>;
  setValue: UseFormSetValue<PersonCreate>;
  errors: FieldErrors<PersonCreate>;
  ocrUsed: boolean;
  handleOCRExtracted: (data: OcrExtracted) => void;
  showDuplicateWarning: boolean;
  duplicates: DuplicateCandidate[];
  onDismissDuplicate: () => void;
}

export function Step1Identidad({
  register, watch, setValue, errors,
  ocrUsed, handleOCRExtracted,
  showDuplicateWarning, duplicates, onDismissDuplicate,
}: Step1IdentidadProps) {
  return (
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
          candidates={duplicates}
          onContinueAnyway={onDismissDuplicate}
        />
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="nombre">Nombre <span className="text-destructive">*</span></Label>
          <Input id="nombre" {...register("nombre")} autoComplete="given-name"
            aria-describedby={errors.nombre ? "nombre-error" : undefined}
            aria-invalid={!!errors.nombre} />
          <FieldError id="nombre-error" message={errors.nombre?.message} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="apellidos">Apellidos <span className="text-destructive">*</span></Label>
          <Input id="apellidos" {...register("apellidos")} autoComplete="family-name"
            aria-describedby={errors.apellidos ? "apellidos-error" : undefined}
            aria-invalid={!!errors.apellidos} />
          <FieldError id="apellidos-error" message={errors.apellidos?.message} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="fecha_nacimiento">Fecha de nacimiento <span className="text-destructive">*</span></Label>
          <Input id="fecha_nacimiento" type="date" {...register("fecha_nacimiento")}
            aria-describedby={errors.fecha_nacimiento ? "fecha_nacimiento-error" : undefined}
            aria-invalid={!!errors.fecha_nacimiento} />
          <FieldError id="fecha_nacimiento-error" message={errors.fecha_nacimiento?.message} />
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
          aria-describedby={errors.idioma_principal ? "idioma_principal-error" : undefined}
          aria-invalid={!!errors.idioma_principal}
        />
      </div>
      <FieldError id="idioma_principal-error" message={errors.idioma_principal?.message} />
    </div>
  );
}
