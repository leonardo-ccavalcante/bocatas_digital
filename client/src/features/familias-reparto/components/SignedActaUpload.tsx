import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera, FileCheck2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { getSignedDocUrl } from "@/features/families/utils/signedUrl";
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

const BUCKET = "family-documents";

/**
 * T-Doc-3: photograph the SIGNED Hoja de Firmas for a (day × turno) slot.
 * The image goes to the private family-documents bucket; the path + audit fields
 * are recorded on the slot via attachSignedActa. Retrievable via signed URL.
 */
export function SignedActaUpload({ roundId, slotId, day, turno, existingPath }: Props) {
  const attach = useAttachSignedActa();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `actas-firmadas/${roundId}/${day}-${turno}.${ext}`;
    setBusy(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type || "image/jpeg", upsert: true });
      if (error) {
        toast.error(error.message || "Error al subir la foto");
        return;
      }
      await attach.mutateAsync({ round_id: roundId, slot_id: slotId, documento_url: path });
      toast.success("Acta firmada guardada");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al guardar el acta firmada");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const view = async () => {
    const url = await getSignedDocUrl(existingPath);
    if (url) window.open(url, "_blank", "noopener");
    else toast.error("No se pudo abrir el acta firmada");
  };

  return (
    <div className="flex items-center gap-2 print:hidden">
      <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
      <Button size="sm" variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
        <Camera className="mr-2 h-4 w-4" aria-hidden />
        {busy ? "Guardando…" : existingPath ? "Reemplazar acta firmada" : "Fotografiar acta firmada"}
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
