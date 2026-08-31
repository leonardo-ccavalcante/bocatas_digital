/**
 * PersonDocumentViewer — la imagen, dentro de la app.
 *
 * Girar no es adorno: una foto de DNI hecha con el móvil sale casi siempre en
 * horizontal, y sin poder girarla no se lee. El zoom es un interruptor de dos
 * estados; nada de librerías de pan/pinch — el presupuesto de bundle de
 * Lighthouse es una puerta que bloquea el merge.
 */
import { useState } from "react";
import { RotateCw, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PersonDocumentViewerProps {
  url: string;
  /** Alt sin PII: describe el tipo de documento, nunca a la persona. */
  descripcion: string;
}

export function PersonDocumentViewer({ url, descripcion }: PersonDocumentViewerProps) {
  const [grados, setGrados] = useState(0);
  const [ampliado, setAmpliado] = useState(false);
  const [fallo, setFallo] = useState(false);

  if (fallo) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-body-sm dark:border-amber-700/60 dark:bg-amber-950/30">
        El enlace ha caducado o la imagen no se pudo cargar. Cierra y vuelve a abrir.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-end gap-2">
        <Button
          size="sm"
          variant="outline"
          aria-label="Girar el documento"
          onClick={() => setGrados((g) => (g + 90) % 360)}
        >
          <RotateCw className="h-4 w-4" />
        </Button>
        <Button
          size="sm"
          variant="outline"
          aria-label={ampliado ? "Reducir el documento" : "Ampliar el documento"}
          onClick={() => setAmpliado((v) => !v)}
        >
          {ampliado ? <ZoomOut className="h-4 w-4" /> : <ZoomIn className="h-4 w-4" />}
        </Button>
      </div>
      <div className="max-h-[65vh] overflow-auto rounded-lg border border-border bg-muted/30">
        <img
          src={url}
          alt={descripcion}
          draggable={false}
          onError={() => setFallo(true)}
          className="ph-no-capture mx-auto block w-full object-contain transition-transform"
          style={{ transform: `rotate(${grados}deg) scale(${ampliado ? 2 : 1})` }}
        />
      </div>
    </div>
  );
}
