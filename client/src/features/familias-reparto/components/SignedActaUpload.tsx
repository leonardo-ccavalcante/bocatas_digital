import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Upload, FileCheck2 } from "lucide-react";
import { toast } from "sonner";
import { compressImage } from "@/features/persons/utils/imageUtils";
import { getSignedDocUrl } from "@/features/families/utils/signedUrl";
import { CameraCaptureButton } from "@/features/persons/components/CameraCaptureButton";
import { useAttachSignedActa } from "../hooks/useReparto";
import type { Turno } from "../schemas";

interface Props {
  roundId: string;
  slotId: string;
  day: string;
  turno: Turno;
  /** existing signed-acta storage path for this slot */
  existingPath?: string | null;
}

/**
 * T-Doc-3: photograph the SIGNED Hoja de Firmas for a (day × turno) slot.
 * The bytes travel as base64 through families.attachSignedActa, which writes
 * the PRIVATE family-documents bucket SERVER-SIDE (service role, ADR-0002 —
 * the bucket has no storage policies, so a browser anon-key upload always
 * 403s) and records path + audit fields on the slot. Retrieved via signed URL.
 */
export function SignedActaUpload({ roundId, slotId, existingPath }: Props) {
  const attach = useAttachSignedActa();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const processFile = async (file: File) => {
    setBusy(true);
    try {
      // 2000px @ 0.9 keeps signatures legible for the OCR close-out review.
      const base64 = await compressImage(file, 2000, 0.9);
      await attach.mutateAsync({ round_id: roundId, slot_id: slotId, base64 });
      toast.success("Acta firmada guardada");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar el acta firmada");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void processFile(file);
  };

  const view = async () => {
    const url = await getSignedDocUrl(existingPath);
    if (url) window.open(url, "_blank", "noopener");
    else toast.error("No se pudo abrir el acta firmada");
  };

  return (
    <div className="flex items-center gap-2 print:hidden">
      {/* Real getUserMedia camera (works on laptops too); `capture` was only an
          advisory hint desktop browsers ignore (#178). File upload kept as an
          output — on Android the native picker still offers the camera app,
          whose focus matters for the legal signature sheet. */}
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
      <CameraCaptureButton
        facingMode="environment"
        label={busy ? "Guardando…" : existingPath ? "Reemplazar acta firmada" : "Fotografiar acta firmada"}
        onCapture={(file) => void processFile(file)}
      />
      <Button size="sm" variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
        <Upload className="mr-2 h-4 w-4" aria-hidden />
        Subir imagen
      </Button>
      {existingPath && (
        <Button size="sm" variant="ghost" onClick={view}>
          <FileCheck2 className="mr-2 h-4 w-4 text-green-600" aria-hidden />
          Ver acta firmada
        </Button>
      )}
    </div>
  );
}
