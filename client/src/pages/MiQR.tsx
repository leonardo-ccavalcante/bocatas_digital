/**
 * MiQR.tsx — Beneficiario QR code page.
 *
 * Root cause of previous bug: the useEffect was drawing a fake canvas pattern
 * (hash-based pixel grid) that looked like a QR but was NOT a real QR code —
 * no QR reader could decode it.
 *
 * Fix: use the `qrcode` npm package (already installed) to generate a real,
 * standards-compliant QR code on the canvas element. The QR payload is the
 * user's openId, matching what QRScanner expects.
 */
import { useEffect, useRef } from "react";
import QRCode from "qrcode";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QrCode, Download, Info, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

export default function MiQR() {
  const { user } = useAuth();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isGenerating, setIsGenerating] = useState(true);
  const [genError, setGenError] = useState<string | null>(null);

  // The QR payload — must match what QRScanner decodes and CheckIn processes
  const qrPayload = user?.openId ?? "";

  useEffect(() => {
    if (!qrPayload || !canvasRef.current) return;

    setIsGenerating(true);
    setGenError(null);

    QRCode.toCanvas(canvasRef.current, qrPayload, {
      width: 240,
      margin: 2,
      color: {
        dark: "#1A1A1A",
        light: "#FFFFFF",
      },
      errorCorrectionLevel: "M",
    })
      .then(() => setIsGenerating(false))
      .catch((err: Error) => {
        setGenError(`Error al generar el QR: ${err.message}`);
        setIsGenerating(false);
      });
  }, [qrPayload]);

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `bocatas-qr-${user?.name?.replace(/\s+/g, "-").toLowerCase() ?? "mi-qr"}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  return (
    <div className="p-5 md:p-8 max-w-md mx-auto">
      <header className="mb-8 text-center">
        <div className="w-14 h-14 rounded-2xl bg-[#C41230] text-white flex items-center justify-center mx-auto mb-4">
          <QrCode className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">Mi código QR</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Muestra este código al voluntario para registrar tu asistencia
        </p>
      </header>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-base text-center">{user?.name ?? "Mi QR"}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          {/* QR Canvas */}
          <div className="relative p-4 bg-white rounded-2xl border-2 border-[#C41230]/20 shadow-inner">
            {isGenerating && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/80 rounded-2xl">
                <Loader2 className="h-6 w-6 animate-spin text-[#C41230]" />
              </div>
            )}
            {genError ? (
              <div className="w-[200px] h-[200px] flex items-center justify-center text-center text-sm text-destructive p-4">
                {genError}
              </div>
            ) : (
              <canvas
                ref={canvasRef}
                className="block"
                style={{ imageRendering: "pixelated", width: 200, height: 200 }}
                aria-label={`Código QR de ${user?.name}`}
              />
            )}
          </div>

          {/* ID display */}
          <div className="text-center w-full">
            <p className="text-xs text-muted-foreground font-mono bg-muted rounded-lg px-3 py-1.5 break-all">
              {qrPayload || "—"}
            </p>
          </div>

          {/* Download button */}
          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={handleDownload}
            disabled={isGenerating || !!genError}
          >
            <Download className="h-4 w-4" />
            Descargar QR
          </Button>
        </CardContent>
      </Card>

      {/* Info card */}
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="py-4 flex gap-3">
          <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
          <p className="text-sm text-blue-800">
            Guarda una captura de pantalla de tu QR para usarlo sin conexión a internet.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
