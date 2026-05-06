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

  // Supabase SDK boundary — opaque join result
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const exportMutation = (trpc.families as any).exportFamiliesWithMembers.useMutation();

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const result = await exportMutation.mutateAsync({ mode: selectedMode });
      if (result?.csv) {
        // Create blob and download
        const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8;" });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `familias-export-${selectedMode}-${new Date().toISOString().split("T")[0]}.csv`);
        link.style.visibility = "hidden";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        toast.success(`${result.recordCount} familias exportadas exitosamente`);
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
                <div key={mode} className="flex items-start space-x-3">
                  <div className="pt-3">
                    <RadioGroupItem value={mode} id={mode} />
                  </div>
                  {/* QA-6 (F-W2G-03): replace clickable <div> with semantic
                      <label htmlFor={mode}> — keyboard-focusable, screen-
                      reader announces as part of the radio group, click
                      forwards to the matching RadioGroupItem natively. */}
                  <label htmlFor={mode} className="flex-1 cursor-pointer">
                    <Card className={`cursor-pointer transition hover:shadow-md ${selectedMode === mode ? "ring-2 ring-primary" : ""}`}>
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <CardTitle className="text-base">{config.icon} {config.title}</CardTitle>
                            <CardDescription className="text-sm mt-2">{config.description}</CardDescription>
                          </div>
                        </div>
                      </CardHeader>
                    </Card>
                  </label>
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
