import { useEffect } from "react";
import { toast } from "sonner";
import { BarChart3 } from "lucide-react";

export default function Dashboard() {
  useEffect(() => {
    toast.info("Próximamente", {
      description: "El panel de estadísticas estará disponible en la próxima versión.",
    });
  }, []);

  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[60vh] text-center p-8">
      <BarChart3 className="h-16 w-16 text-gray-300 mb-4" />
      <h2 className="text-xl font-semibold text-gray-700">Dashboard</h2>
      <p className="text-gray-400 mt-2 max-w-sm">
        Estadísticas de asistencia, entregas y voluntarios. Disponible próximamente.
      </p>
    </div>
  );
}
