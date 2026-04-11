import { useEffect } from "react";
import { toast } from "sonner";
import { QrCode } from "lucide-react";

export default function Checkin() {
  useEffect(() => {
    toast.info("Próximamente", {
      description: "El módulo de check-in con QR estará disponible en la próxima versión.",
    });
  }, []);

  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[60vh] text-center p-8">
      <QrCode className="h-16 w-16 text-gray-300 mb-4" />
      <h2 className="text-xl font-semibold text-gray-700">Check-in Comedor</h2>
      <p className="text-gray-400 mt-2 max-w-sm">
        Registro de asistencia por QR, NFC o búsqueda manual. Disponible próximamente.
      </p>
    </div>
  );
}
