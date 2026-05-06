import type { UseFormRegister, UseFormWatch, UseFormSetValue } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle } from "lucide-react";
import {
  type PersonCreate,
  type OcrExtracted,
  TIPO_DOCUMENTO_LABELS,
  PAIS_DOCUMENTO_LABELS,
  SITUACION_LEGAL_LABELS,
} from "../../../schemas";
import { DocumentCaptureInline } from "../../DocumentCaptureInline";
import { SelectField } from "../_shared";

interface Step2DocumentoProps {
  register: UseFormRegister<PersonCreate>;
  watch: UseFormWatch<PersonCreate>;
  setValue: UseFormSetValue<PersonCreate>;
  handleOCRExtracted: (data: OcrExtracted) => void;
}

export function Step2Documento({
  register, watch, setValue, handleOCRExtracted,
}: Step2DocumentoProps) {
  return (
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
  );
}
