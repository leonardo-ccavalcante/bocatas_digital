/**
 * ArchivarDocumentoCheckbox — decidir si la foto del documento se guarda.
 *
 * Vive en el PASO, no dentro de DocumentCaptureInline, y la razón es un fallo
 * real que costó una ronda de CI: en cuanto el OCR tiene éxito, `onExtracted`
 * marca `ocrUsed` (Step1) o rellena `numero_documento` (Step2), y eso DESMONTA
 * el componente de captura. Una casilla dentro de él era inalcanzable justo en
 * el único camino que la necesita — el escaneo con éxito.
 *
 * Aquí se pinta junto al aviso de "datos extraídos", que es donde quien atiende
 * está mirando en ese momento.
 *
 * Se muestra sólo si hay imagen capturada y viene MARCADA: la puerta real es el
 * consentimiento `archivo_documento_identidad`, que se pide en la fase 3 y se
 * comprueba al enviar. Sin él la imagen no se guarda aunque esto esté marcado,
 * así que apagarla por defecto no añadiría ninguna garantía — sólo garantizaría
 * que, con prisa, no se archive nunca. Esto es el opt-out del caso concreto:
 * foto ilegible, documento de un tercero, duda.
 */
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface ArchivarDocumentoCheckboxProps {
  /** Hay una imagen capturada que se podría archivar. */
  hayImagen: boolean;
  archivar: boolean;
  onChange: (archivar: boolean) => void;
}

export function ArchivarDocumentoCheckbox({
  hayImagen,
  archivar,
  onChange,
}: ArchivarDocumentoCheckboxProps) {
  if (!hayImagen) return null;

  return (
    <div className="flex items-start gap-2 rounded-lg border border-border p-3">
      <Checkbox
        id="archivar_documento"
        className="mt-0.5"
        checked={archivar}
        onCheckedChange={(v) => onChange(v === true)}
      />
      <Label htmlFor="archivar_documento" className="cursor-pointer text-xs font-normal">
        <span className="font-medium">Archivar la foto del documento en la ficha.</span>{" "}
        Queda guardada de forma privada y sólo la ve superadministración. Se
        pedirá la autorización de la persona más adelante: sin ella no se
        archiva. Desmárcalo si la foto no sirve o no es su documento.
      </Label>
    </div>
  );
}
