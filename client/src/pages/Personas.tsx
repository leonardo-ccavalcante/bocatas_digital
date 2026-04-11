import { useEffect } from "react";
import { toast } from "sonner";
import { Users } from "lucide-react";

export default function Personas() {
  useEffect(() => {
    toast.info("Próximamente", {
      description: "El módulo de personas estará disponible en la próxima versión.",
    });
  }, []);

  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[60vh] text-center p-8">
      <Users className="h-16 w-16 text-gray-300 mb-4" />
      <h2 className="text-xl font-semibold text-gray-700">Módulo de Personas</h2>
      <p className="text-gray-400 mt-2 max-w-sm">
        Registro, búsqueda y gestión de fichas de personas. Disponible próximamente.
      </p>
    </div>
  );
}
