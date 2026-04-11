import { CheckCircle, Edit2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { OcrExtracted } from "../schemas";
import { TIPO_DOCUMENTO_LABELS } from "../schemas";

interface OCRConfirmationCardProps {
  data: OcrExtracted;
  onAccept: () => void;
  onEdit: () => void;
}

export function OCRConfirmationCard({ data, onAccept, onEdit }: OCRConfirmationCardProps) {
  const fields: { label: string; value: string | undefined }[] = [
    { label: "Nombre", value: data.nombre },
    { label: "Apellidos", value: data.apellidos },
    { label: "Fecha de nacimiento", value: data.fecha_nacimiento },
    { label: "Tipo de documento", value: data.tipo_documento ? TIPO_DOCUMENTO_LABELS[data.tipo_documento] : undefined },
    { label: "Número de documento", value: data.numero_documento },
    { label: "País de origen", value: data.pais_origen },
  ].filter((f) => f.value);

  return (
    <Card className="border-green-200 bg-green-50">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm text-green-700">
          <CheckCircle className="h-4 w-4" />
          Datos extraídos del documento
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          {fields.map(({ label, value }) => (
            <div key={label}>
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="font-medium">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-muted-foreground">
          Verifica que los datos son correctos antes de continuar.
        </p>
        <div className="flex gap-2 pt-1">
          <Button size="sm" onClick={onAccept} className="flex-1">
            <CheckCircle className="mr-1 h-3 w-3" /> Aceptar datos
          </Button>
          <Button size="sm" variant="outline" onClick={onEdit}>
            <Edit2 className="mr-1 h-3 w-3" /> Editar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
