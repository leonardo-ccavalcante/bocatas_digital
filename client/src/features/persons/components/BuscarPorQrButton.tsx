/**
 * BuscarPorQrButton — punto de búsqueda por QR en «Personas».
 *
 * La persona llega a Bocatas con su código: se lee y se abre su ficha. El QR
 * canónico (`shared/qr/payload.ts`) lleva el `persons.id`, así que el escaneo
 * resuelve la identidad sin roundtrip al servidor.
 *
 * No se verifica la firma HMAC: la ficha destino ya es admin-only y ese rol
 * puede abrir cualquier ficha buscando por nombre, así que comprobarla no
 * añadiría autorización, sólo espera. La firma sigue siendo obligatoria en el
 * check-in, que sí escribe.
 *
 * El escáner es el mismo de comedor (ATL-01: ~49KB gzip de librería de cámara
 * que sólo deben bajarse al abrir el diálogo, nunca con el listado).
 */
import { useState, lazy, Suspense } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { QrCode, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { parseQrPayload } from "@shared/qr/payload";

const QRScanner = lazy(() =>
  import("@/features/checkin/components/QRScanner").then((m) => ({ default: m.QRScanner }))
);

export function BuscarPorQrButton() {
  const [abierto, setAbierto] = useState(false);
  const [, navigate] = useLocation();

  const alLeer = (valor: string) => {
    const parsed = parseQrPayload(valor);
    if (!parsed) {
      toast.error("QR no válido — no es un código de Bocatas.");
      return;
    }
    setAbierto(false);
    navigate(`/personas/${parsed.uuid}`);
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setAbierto(true)}>
        <QrCode className="mr-1 h-4 w-4" aria-hidden="true" /> Escanear QR
      </Button>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Buscar persona por QR</DialogTitle>
          </DialogHeader>
          {abierto ? (
            <Suspense
              fallback={
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
                </div>
              }
            >
              <QRScanner onDecoded={alLeer} onCancel={() => setAbierto(false)} />
            </Suspense>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
