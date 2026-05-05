/**
 * QRCodeCard — printable QR card for admin/voluntario view.
 *
 * QA-1A (Phase 6): the QR payload is now a server-signed canonical URI
 * `bocatas://person/<uuid>?sig=<hmac8>` produced by `persons.getQrPayload`.
 * It contains zero PII. The on-screen header still renders the full name
 * for sighted operators (already on the page DOM); the QR module itself
 * is RGPD-clean.
 *
 * Share fallback: clipboard receives the URI (PII-free), not JSON of the
 * person fields. Print HTML keeps the visible name for the printed card
 * legend; the QR pixels never carry PII.
 */
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Printer, Share2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import type { Database } from "@/lib/database.types";

type PersonRow = Database["public"]["Tables"]["persons"]["Row"];

interface QRCodeCardProps {
  person: PersonRow;
}

export function QRCodeCard({ person }: QRCodeCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const { data, isLoading, isError } = trpc.persons.getQrPayload.useQuery(
    { personId: person.id },
    { staleTime: 5 * 60_000 }
  );
  const qrPayload = data?.payload ?? "";

  useEffect(() => {
    if (!canvasRef.current || !qrPayload) return;
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
        // Generic title — never carry PII into a system share dialog.
        const file = new File([blob], `bocatas-qr-${person.id}.png`, { type: "image/png" });
        await navigator.share({ files: [file], title: "Código QR de Bocatas" });
      } catch {
        // User cancelled share
      }
    } else {
      // Clipboard receives the signed URI (no PII), not a JSON of person fields.
      await navigator.clipboard.writeText(qrPayload);
      toast.success("Código QR copiado al portapapeles");
    }
  };

  const fullName = `${person.nombre} ${person.apellidos ?? ""}`.trim();

  return (
    <Card className="mx-auto max-w-sm">
      <CardHeader>
        <CardTitle className="text-center text-base">Código QR — {fullName}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4">
        {isLoading && (
          <div className="h-[256px] w-[256px] flex items-center justify-center text-sm text-muted-foreground">
            Generando…
          </div>
        )}
        {isError && (
          <div className="h-[256px] w-[256px] flex items-center justify-center text-sm text-destructive p-4 text-center">
            No se pudo generar el QR. Verifica permisos o intenta de nuevo.
          </div>
        )}
        <canvas
          ref={canvasRef}
          aria-label={`Código QR de ${fullName}`}
          className={`rounded-lg border ${!qrPayload ? "hidden" : ""}`}
        />
        <p className="text-center text-xs text-muted-foreground">
          Escanea este código para hacer check-in rápido en el comedor.
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={handleDownload} disabled={!qrDataUrl} aria-label="Descargar QR">
            <Download className="mr-1 h-4 w-4" /> Descargar
          </Button>
          <Button size="sm" variant="outline" onClick={handlePrint} disabled={!qrDataUrl} aria-label="Imprimir QR">
            <Printer className="mr-1 h-4 w-4" /> Imprimir
          </Button>
          <Button size="sm" variant="outline" onClick={handleShare} disabled={!qrDataUrl} aria-label="Compartir QR">
            <Share2 className="mr-1 h-4 w-4" /> Compartir
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
