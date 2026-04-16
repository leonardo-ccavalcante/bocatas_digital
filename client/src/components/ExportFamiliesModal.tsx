import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Download, Loader2 } from "lucide-react";

interface ExportFamiliesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ExportMode = "update" | "audit" | "verify";

const EXPORT_MODES = {
  update: {
    title: "Actualización Completa",
    description: "Todos los campos (18+) para sincronización completa de datos",
    icon: "📋",
  },
  audit: {
    title: "Auditoría y Reportes",
    description: "Campos clave (11) para análisis y reportes",
    icon: "📊",
  },
  verify: {
    title: "Verificación Rápida",
    description: "Campos mínimos (4) para verificación de datos",
    icon: "✓",
  },
};

export function ExportFamiliesModal({ open, onOpenChange }: ExportFamiliesModalProps) {
  const [selectedMode, setSelectedMode] = useState<ExportMode>("update");
  const [isExporting, setIsExporting] = useState(false);

  const exportMutation = (trpc.families as any).exportFamilies.useQuery(
    { mode: selectedMode },
    { enabled: false }
  );

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const result = await exportMutation.refetch();
      if (result.data?.csv) {
        // Create blob and download
        const blob = new Blob([result.data.csv], { type: "text/csv;charset=utf-8;" });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `familias-export-${selectedMode}-${new Date().toISOString().split("T")[0]}.csv`);
        link.style.visibility = "hidden";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        toast.success(`${result.data.recordCount} familias exportadas exitosamente`);
        onOpenChange(false);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al exportar");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Exportar Familias</DialogTitle>
          <DialogDescription>
            Selecciona el modo de exportación según tu necesidad
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <RadioGroup value={selectedMode} onValueChange={(value) => setSelectedMode(value as ExportMode)}>
            {(Object.entries(EXPORT_MODES) as Array<[ExportMode, typeof EXPORT_MODES[ExportMode]]>).map(
              ([mode, config]) => (
                <div key={mode} className="flex items-center space-x-2">
                  <RadioGroupItem value={mode} id={mode} />
                  <Label htmlFor={mode} className="flex-1 cursor-pointer">
                    <Card className={`cursor-pointer transition ${selectedMode === mode ? "ring-2 ring-primary" : ""}`}>
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <CardTitle className="text-base">{config.icon} {config.title}</CardTitle>
                            <CardDescription className="text-xs mt-1">{config.description}</CardDescription>
                          </div>
                        </div>
                      </CardHeader>
                    </Card>
                  </Label>
                </div>
              )
            )}
          </RadioGroup>

          <div className="bg-muted p-4 rounded-lg text-sm">
            <p className="font-medium mb-2">Modo seleccionado: {EXPORT_MODES[selectedMode].title}</p>
            <p className="text-muted-foreground">{EXPORT_MODES[selectedMode].description}</p>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={handleExport} disabled={isExporting}>
              {isExporting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Exportando...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  Descargar CSV
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
