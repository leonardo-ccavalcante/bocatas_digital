import { useEffect } from "react";
import { toast } from "sonner";
import { FileText } from "lucide-react";

export default function AdminConsentimientos() {
  useEffect(() => {
    toast.info("Próximamente", {
      description: "La gestión de plantillas de consentimiento estará disponible en la próxima versión.",
    });
  }, []);

  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[60vh] text-center p-8">
      <FileText className="h-16 w-16 text-gray-300 mb-4" />
      <h2 className="text-xl font-semibold text-gray-700">Gestión de Consentimientos</h2>
      <p className="text-gray-400 mt-2 max-w-sm">
        Administración de plantillas RGPD y versiones de consentimiento. Disponible próximamente.
      </p>
    </div>
  );
}
