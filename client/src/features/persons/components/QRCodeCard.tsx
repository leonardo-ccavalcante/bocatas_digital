import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Printer, Share2 } from "lucide-react";
import { toast } from "sonner";
import type { Database } from "@/lib/database.types";

type PersonRow = Database["public"]["Tables"]["persons"]["Row"];

interface QRCodeCardProps {
  person: PersonRow;
}

export function QRCodeCard({ person }: QRCodeCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const qrPayload = JSON.stringify({
    id: person.id,
    nombre: person.nombre,
    apellidos: person.apellidos,
    v: 1,
  });

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, qrPayload, {
      width: 256,
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" },
    })
      .then(() => {
        setQrDataUrl(canvasRef.current?.toDataURL("image/png") ?? null);
      })
      .catch(() => {
        toast.error("Error al generar el código QR");
      });
  }, [qrPayload]);

  const handleDownload = () => {
    if (!qrDataUrl) return;
    const a = document.createElement("a");
    a.href = qrDataUrl;
    a.download = `bocatas-qr-${person.id}.png`;
    a.click();
  };

  const handlePrint = () => {
    if (!qrDataUrl) return;
    const win = window.open("", "_blank");
    if (!win) return;
    const fullName = `${person.nombre} ${person.apellidos ?? ""}`.trim();
    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>QR — ${fullName}</title>
          <style>
            body { display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:100vh; font-family:sans-serif; gap:16px; }
            img { width:256px; height:256px; }
            h2 { margin:0; font-size:18px; }
            p { margin:0; color:#666; font-size:13px; }
          </style>
        </head>
        <body>
          <img src="${qrDataUrl}" alt="QR Code" />
          <h2>${fullName}</h2>
          <p>Bocatas Digital · ID: ${person.id.slice(0, 8)}</p>
          <script>window.onload=()=>{window.print();window.close();}</script>
        </body>
      </html>
    `);
    win.document.close();
  };

  const handleShare = async () => {
    if (!qrDataUrl) return;
    if (navigator.share) {
      try {
        const blob = await (await fetch(qrDataUrl)).blob();
        const file = new File([blob], `bocatas-qr-${person.id}.png`, { type: "image/png" });
        await navigator.share({ files: [file], title: `QR — ${person.nombre}` });
      } catch {
        // User cancelled share
      }
    } else {
      await navigator.clipboard.writeText(qrPayload);
      toast.success("Datos QR copiados al portapapeles");
    }
  };

  const fullName = `${person.nombre} ${person.apellidos ?? ""}`.trim();

  return (
    <Card className="mx-auto max-w-sm">
      <CardHeader>
        <CardTitle className="text-center text-base">Código QR — {fullName}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4">
        <canvas
          ref={canvasRef}
          aria-label={`Código QR de ${fullName}`}
          className="rounded-lg border"
        />
        <p className="text-center text-xs text-muted-foreground">
          Escanea este código para hacer check-in rápido en el comedor.
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={handleDownload} aria-label="Descargar QR">
            <Download className="mr-1 h-4 w-4" /> Descargar
          </Button>
          <Button size="sm" variant="outline" onClick={handlePrint} aria-label="Imprimir QR">
            <Printer className="mr-1 h-4 w-4" /> Imprimir
          </Button>
          <Button size="sm" variant="outline" onClick={handleShare} aria-label="Compartir QR">
            <Share2 className="mr-1 h-4 w-4" /> Compartir
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
