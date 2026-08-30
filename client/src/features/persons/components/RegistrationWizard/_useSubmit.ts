import { useCallback, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { PersonCreateSchema, type ConsentTemplate, type PersonCreate } from "../../schemas";
import { useCreatePerson } from "../../hooks/useCreatePerson";
import { useEnrollPerson } from "../../hooks/useEnrollPerson";
import { trpc } from "@/lib/trpc";
import type { FamilyMember } from "./_shared";
import { buildConsentRows, puedeGuardarFoto } from "./_consentRows";
import {
  describirErrores,
  mensajeDeErrores,
  primeraFaseConError,
} from "./_formErrors";

interface UseSubmitArgs {
  groupAAccepted: boolean;
  getValues: () => PersonCreate;
  profilePhotoBase64: string | null;
  /** Foto del documento a archivar; null si no se marcó archivarla. */
  documentoBase64: string | null;
  consentDocBase64: string | null;
  consentChoices: Record<string, boolean>;
  consentTemplatesEs: ConsentTemplate[];
  consentTemplatesLang: ConsentTemplate[];
  personLanguage: string | null | undefined;
  numeroSerie: string;
  groupAPurposes: string[];
  groupBPurposes: string[];
  groupCPurposes: string[];
  hasFamilia: boolean;
  familyMembers: FamilyMember[];
  numAdultos: number;
  numMenores: number;
  /** Lleva al paso donde está el campo que falla, para no buscarlo a ciegas. */
  irAFase?: (fase: number) => void;
}

export function useRegistrationSubmit(args: UseSubmitArgs) {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "superadmin";
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

    // Submit the Zod-PARSED values, never the raw form values: the schema's
    // transforms (e.g. fecha_llegada_espana "" → null) only run through parse,
    // and the server copy rejects what the transform would have fixed (F024).
    const parsed = PersonCreateSchema.safeParse(args.getValues());
    if (!parsed.success) {
      // Nombre en pantalla + motivo + paso, en vez de la lista de columnas:
      // el aviso anterior no permitía saber ni qué fallaba ni dónde mirar.
      const campos = describirErrores(parsed.error.issues);
      toast.error(mensajeDeErrores(campos));
      const fase = primeraFaseConError(campos);
      if (fase !== null) args.irAFase?.(fase);
      return;
    }
    const data = parsed.data;

    setIsSubmitting(true);
    try {
      // 1. Upload profile photo if captured AND the person consented to it.
      // `fotografia` es opcional desde ALTAS-8: sin esta puerta se guardaría la
      // cara de quien acaba de denegar el uso de imagen.
      let fotoPerfilUrl: string | null = null;
      if (args.profilePhotoBase64 && !puedeGuardarFoto(args.consentChoices)) {
        toast.info("La foto no se guarda: no se autorizó el uso de imagen.");
      }
      if (args.profilePhotoBase64 && puedeGuardarFoto(args.consentChoices)) {
        try {
          const result = await uploadPhoto({
            bucket: "fotos-perfil",
            base64: args.profilePhotoBase64,
          });
          fotoPerfilUrl = result.path;
        } catch {
          toast.warning("Foto de perfil no guardada. La ficha se crea igualmente.");
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
          consentDocUrl = result.path;
        } catch {
          toast.warning("Foto del documento de consentimiento no guardada.");
        }
      }

      // 2b. Foto del documento — sólo si se marcó archivarla en el escaneo.
      // Bucket propio y privado; se guarda el PATH, nunca una URL firmada.
      let fotoDocumentoUrl: string | null = null;
      if (args.documentoBase64) {
        try {
          const result = await uploadPhoto({
            bucket: "documentos-identidad",
            base64: args.documentoBase64,
          });
          fotoDocumentoUrl = result.path;
        } catch {
          toast.warning("Foto del documento no archivada. La ficha se crea igualmente.");
        }
      }

      // 3. Create person
      const person = await createPerson({
        data: { ...data, foto_perfil_url: fotoPerfilUrl, foto_documento_url: fotoDocumentoUrl },
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
      const consentRows = buildConsentRows({
        purposes: allPurposes,
        consentChoices: args.consentChoices,
        consentTemplatesEs: args.consentTemplatesEs,
        consentTemplatesLang: args.consentTemplatesLang,
        personLanguage: args.personLanguage,
        consentDocUrl,
        numeroSerie: args.numeroSerie,
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
      // Voluntarios no pueden abrir la ficha (persons.getById es admin-only,
      // #46): aterrizan en la tarjeta QR imprimible, que sí es voluntario-safe.
      navigate(isAdmin ? `/personas/${person.id}` : `/personas/${person.id}/qr`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error desconocido";
      toast.error(`Error al registrar: ${message}`);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    isSubmitting, args, navigate, isAdmin,
    createPerson, enrollPerson, saveConsents, createFamily, uploadPhoto,
  ]);

  return { isSubmitting, handleFinalSubmit };
}
