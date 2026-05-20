import type { Dispatch, RefObject, SetStateAction } from "react";
import type {
  UseFormRegister,
  UseFormWatch,
  UseFormSetValue,
  UseFormGetValues,
  FieldErrors,
} from "react-hook-form";
import {
  type PersonCreate,
  type OcrExtracted,
  type DuplicateCandidate,
  type ConsentTemplate,
} from "../../schemas";
import { Step0Canal } from "../RegistrationWizard/steps/Step0Canal";
import { Step1Identidad } from "../RegistrationWizard/steps/Step1Identidad";
import { Step2Documento } from "../RegistrationWizard/steps/Step2Documento";
import { Step3Contacto } from "../RegistrationWizard/steps/Step3Contacto";
import { Step4Situacion } from "../RegistrationWizard/steps/Step4Situacion";
import { Step5Social } from "../RegistrationWizard/steps/Step5Social";
import { Step6Foto } from "../RegistrationWizard/steps/Step6Foto";
import { Step7Consent } from "../RegistrationWizard/steps/Step7Consent";
import { Step8Familia } from "../RegistrationWizard/steps/Step8Familia";
import type { FamilyMember, ProgramRow } from "../RegistrationWizard/_shared";
import { SectionTitle } from "./SectionTitle";

/**
 * WizardPhases — composes the 9 existing functional step components into the
 * 4 editorial phases shown by the v4 prototype's stepper:
 *
 *   Phase 1 · Identidad → Canal (0) + Identidad (1) + Documento (2)
 *   Phase 2 · Contacto  → Contacto (3) + Situación (4)
 *   Phase 3 · Programa  → Social/Programas (5) + Foto (6) + Consentimiento (7)
 *                         [+ Familias (8) when a familia program is selected]
 *
 * Each existing step component is reused verbatim (no logic change); only the
 * grouping + editorial section dividers are new. Phase 4 (Resumen) is rendered
 * separately by index.tsx.
 */
export interface WizardPhasesProps {
  phase: number;
  // form
  register: UseFormRegister<PersonCreate>;
  watch: UseFormWatch<PersonCreate>;
  setValue: UseFormSetValue<PersonCreate>;
  getValues: UseFormGetValues<PersonCreate>;
  errors: FieldErrors<PersonCreate>;
  // OCR
  ocrUsed: boolean;
  handleOCRExtracted: (data: OcrExtracted) => void;
  // duplicates
  showDuplicateWarning: boolean;
  duplicates: DuplicateCandidate[];
  onDismissDuplicate: () => void;
  // programs
  programs: readonly ProgramRow[];
  watchedProgramIds: string[];
  toggleProgram: (id: string) => void;
  hasFamilia: boolean;
  // photo
  profilePhotoPreview: string | null;
  setProfilePhotoBase64: (v: string | null) => void;
  setProfilePhotoPreview: (v: string | null) => void;
  profileInputRef: RefObject<HTMLInputElement | null>;
  handleProfilePhotoFile: (file: File) => Promise<void>;
  // consent
  consentChoices: Record<string, boolean>;
  setConsentChoices: Dispatch<SetStateAction<Record<string, boolean>>>;
  groupAPurposes: string[];
  groupBPurposes: string[];
  groupCPurposes: string[];
  groupAAccepted: boolean;
  consentTemplatesEs: ConsentTemplate[];
  consentTemplatesLang: ConsentTemplate[];
  needsVerbalFallback: boolean;
  numeroSerie: string;
  setNumeroSerie: (v: string) => void;
  consentDocPreview: string | null;
  setConsentDocBase64: (v: string | null) => void;
  setConsentDocPreview: (v: string | null) => void;
  consentDocInputRef: RefObject<HTMLInputElement | null>;
  handleConsentDocFile: (file: File) => Promise<void>;
  // family
  numAdultos: number;
  setNumAdultos: (n: number) => void;
  numMenores: number;
  setNumMenores: (n: number) => void;
  familyMembers: FamilyMember[];
  addFamilyMember: () => void;
  removeFamilyMember: (idx: number) => void;
  updateFamilyMember: (idx: number, field: keyof FamilyMember, value: string) => void;
}

export function WizardPhases(props: WizardPhasesProps) {
  const { phase } = props;

  if (phase === 1) {
    return (
      <div className="space-y-8">
        <section>
          <SectionTitle
            eyebrow="Canal de llegada"
            title="¿Cómo ha llegado?"
            sub="Vía de derivación y persona de referencia."
          />
          <Step0Canal
            register={props.register}
            watch={props.watch}
            setValue={props.setValue}
            errors={props.errors}
          />
        </section>
        <section>
          <SectionTitle
            eyebrow="Identidad"
            title="¿Quién es?"
            sub="Nombre, apellidos y fecha de nacimiento son obligatorios."
          />
          <Step1Identidad
            register={props.register}
            watch={props.watch}
            setValue={props.setValue}
            errors={props.errors}
            ocrUsed={props.ocrUsed}
            handleOCRExtracted={props.handleOCRExtracted}
            showDuplicateWarning={props.showDuplicateWarning}
            duplicates={props.duplicates}
            onDismissDuplicate={props.onDismissDuplicate}
          />
        </section>
        <section>
          <SectionTitle
            eyebrow="Documentación"
            title="Documentación"
            sub="Opcional. Puedes escanear el documento para autocompletar."
          />
          <Step2Documento
            register={props.register}
            watch={props.watch}
            setValue={props.setValue}
            handleOCRExtracted={props.handleOCRExtracted}
          />
        </section>
      </div>
    );
  }

  if (phase === 2) {
    return (
      <div className="space-y-8">
        <section>
          <SectionTitle
            eyebrow="Contacto"
            title="¿Cómo la contactamos?"
            sub="Teléfono, email o dirección."
          />
          <Step3Contacto register={props.register} errors={props.errors} />
        </section>
        <section>
          <SectionTitle
            eyebrow="Situación actual"
            title="Situación actual"
            sub="Vivienda, estudios y empleo. Todo opcional."
          />
          <Step4Situacion watch={props.watch} setValue={props.setValue} />
        </section>
      </div>
    );
  }

  if (phase === 3) {
    return (
      <div className="space-y-8">
        <section>
          <SectionTitle
            eyebrow="Programa e información social"
            title="Programa e información social"
            sub="Selecciona al menos un programa para continuar."
          />
          <Step5Social
            register={props.register}
            programs={props.programs}
            watchedProgramIds={props.watchedProgramIds}
            toggleProgram={props.toggleProgram}
            hasFamilia={props.hasFamilia}
          />
        </section>
        <section>
          <SectionTitle
            eyebrow="Foto de perfil"
            title="Foto de perfil"
            sub="Opcional. Ayuda a identificar a la persona en el check-in."
          />
          <Step6Foto
            profilePhotoPreview={props.profilePhotoPreview}
            setProfilePhotoBase64={props.setProfilePhotoBase64}
            setProfilePhotoPreview={props.setProfilePhotoPreview}
            profileInputRef={props.profileInputRef}
            handleProfilePhotoFile={props.handleProfilePhotoFile}
          />
        </section>
        <section>
          <SectionTitle
            eyebrow="Consentimientos"
            title="Protección de datos (RGPD)"
            sub="El Grupo A es obligatorio para completar el registro."
          />
          {props.needsVerbalFallback && (
            <div
              className="mb-4 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-body-sm text-amber-800"
              data-testid="verbal-translation-banner"
              role="status"
            >
              <span aria-hidden="true">⚠️</span>
              <span>
                No hay plantilla de consentimiento en el idioma de la persona. Pide a tu
                volunteer una traducción verbal antes de firmar. El consentimiento se muestra
                en español.
              </span>
            </div>
          )}
          <Step7Consent
            consentChoices={props.consentChoices}
            setConsentChoices={props.setConsentChoices}
            groupAPurposes={props.groupAPurposes}
            groupBPurposes={props.groupBPurposes}
            groupCPurposes={props.groupCPurposes}
            groupAAccepted={props.groupAAccepted}
            consentTemplatesEs={props.consentTemplatesEs}
            consentTemplatesLang={props.consentTemplatesLang}
            numeroSerie={props.numeroSerie}
            setNumeroSerie={props.setNumeroSerie}
            consentDocPreview={props.consentDocPreview}
            setConsentDocBase64={props.setConsentDocBase64}
            setConsentDocPreview={props.setConsentDocPreview}
            consentDocInputRef={props.consentDocInputRef}
            handleConsentDocFile={props.handleConsentDocFile}
          />
        </section>
        {props.hasFamilia && (
          <section>
            <SectionTitle
              eyebrow="Composición del hogar"
              title="Composición del hogar"
              sub="Necesario para el Programa Familias."
            />
            <Step8Familia
              numAdultos={props.numAdultos}
              setNumAdultos={props.setNumAdultos}
              numMenores={props.numMenores}
              setNumMenores={props.setNumMenores}
              familyMembers={props.familyMembers}
              addFamilyMember={props.addFamilyMember}
              removeFamilyMember={props.removeFamilyMember}
              updateFamilyMember={props.updateFamilyMember}
            />
          </section>
        )}
      </div>
    );
  }

  return null;
}
