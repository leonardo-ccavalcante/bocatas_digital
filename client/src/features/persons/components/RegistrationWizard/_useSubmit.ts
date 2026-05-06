import { useCallback, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import type { PersonCreate } from "../../schemas";
import type { ConsentTemplate } from "../../schemas";
import { useCreatePerson } from "../../hooks/useCreatePerson";
import { useEnrollPerson } from "../../hooks/useEnrollPerson";
import { trpc } from "@/lib/trpc";
import type { FamilyMember } from "./_shared";

interface UseSubmitArgs {
  groupAAccepted: boolean;
  getValues: () => PersonCreate;
  profilePhotoBase64: string | null;
  consentDocBase64: string | null;
  consentChoices: Record<string, boolean>;
  consentTemplatesEs: ConsentTemplate[];
  numeroSerie: string;
  groupAPurposes: string[];
  groupBPurposes: string[];
  groupCPurposes: string[];
  hasFamilia: boolean;
  familyMembers: FamilyMember[];
  numAdultos: number;
  numMenores: number;
}

export function useRegistrationSubmit(args: UseSubmitArgs) {
  const [, navigate] = useLocation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { mutateAsync: createPerson } = useCreatePerson();
  const { mutateAsync: enrollPerson } = useEnrollPerson();
  const { mutateAsync: saveConsents } = trpc.persons.saveConsents.useMutation();
  const { mutateAsync: createFamily } = trpc.persons.createFamily.useMutation();
  const { mutateAsync: uploadPhoto } = trpc.persons.uploadPhoto.useMutation();

  const handleFinalSubmit = useCallback(async () => {
    // Guard against multiple concurrent submissions (race condition fix)
    if (isSubmitting) {
      return;
    }

    if (!args.groupAAccepted) {
      toast.error("Debes aceptar los consentimientos del Grupo A para continuar.");
      return;
    }

    setIsSubmitting(true);
    try {
      const data = args.getValues();

      // 1. Upload profile photo if captured
      let fotoPerfilUrl: string | null = null;
      if (args.profilePhotoBase64) {
        try {
          const result = await uploadPhoto({
            bucket: "fotos-perfil",
            base64: args.profilePhotoBase64,
          });
          fotoPerfilUrl = result.url;
        } catch {
          toast.warning("Foto de perfil no guardada. Puedes añadirla desde el perfil.");
        }
      }

      // 2. Upload consent document if captured
      let consentDocUrl: string | null = null;
      if (args.consentDocBase64) {
        try {
          const result = await uploadPhoto({
            bucket: "documentos-consentimiento",
            base64: args.consentDocBase64,
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
      const allPurposes = [...args.groupAPurposes, ...args.groupBPurposes, ...args.groupCPurposes];
      const consentRows = allPurposes.map((purpose) => {
        const template = args.consentTemplatesEs.find((t) => t.purpose === purpose);
        return {
          purpose: purpose as "tratamiento_datos_bocatas" | "tratamiento_datos_banco_alimentos" | "compartir_datos_red" | "comunicaciones_whatsapp" | "fotografia",
          idioma: "es" as const,
          granted: args.consentChoices[purpose] === true,
          granted_at: new Date().toISOString(),
          consent_text: template?.text_content ?? "",
          consent_version: template?.version ?? "1.0",
          documento_foto_url: consentDocUrl,
          numero_serie: args.numeroSerie || null,
        };
      });

      await saveConsents({ personId: person.id, consents: consentRows });

      // 6. Create family record if applicable
      if (args.hasFamilia && person?.id) {
        try {
          await createFamily({
            titularId: person.id,
            miembros: args.familyMembers.filter((m) => m.nombre.trim() !== ""),
            numAdultos: args.numAdultos,
            numMenores: args.numMenores,
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
    isSubmitting, args, navigate,
    createPerson, enrollPerson, saveConsents, createFamily, uploadPhoto,
  ]);

  return { isSubmitting, handleFinalSubmit };
}
