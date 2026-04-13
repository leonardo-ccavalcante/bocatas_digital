/**
 * QRScanner.tsx — Camera-based QR scanner using html5-qrcode.
 *
 * Renders a camera viewfinder and calls onDecoded when a QR code is found.
 * Calls onError on unrecoverable camera errors.
 */
import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Button } from "@/components/ui/button";
import { Camera, X } from "lucide-react";

interface QRScannerProps {
  onDecoded: (value: string) => void;
  onCancel: () => void;
  isDemoMode?: boolean;
}

const SCANNER_ID = "bocatas-qr-scanner";

export function QRScanner({ onDecoded, onCancel, isDemoMode = false }: QRScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(true);
  const hasDecodedRef = useRef(false);

  useEffect(() => {
    // Demo mode: simulate a QR scan after 1.5s
    if (isDemoMode) {
      const timer = setTimeout(() => {
        if (!hasDecodedRef.current) {
          hasDecodedRef.current = true;
          onDecoded("bocatas://person/b0000000-0000-0000-0000-000000000002");
        }
      }, 1500);
      setIsStarting(false);
      return () => clearTimeout(timer);
    }

    const scanner = new Html5Qrcode(SCANNER_ID);
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
        },
        (decodedText) => {
          if (hasDecodedRef.current) return;
          hasDecodedRef.current = true;
          scanner.stop().catch(() => {});
          onDecoded(decodedText);
        },
        () => {
          // QR not found in frame — ignore
        }
      )
      .then(() => setIsStarting(false))
      .catch((err) => {
        setError(
          err?.message?.includes("Permission")
            ? "Permiso de cámara denegado. Activa el acceso a la cámara en la configuración del navegador."
            : "No se pudo iniciar la cámara. Intenta el modo manual."
        );
        setIsStarting(false);
      });

    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
        scannerRef.current = null;
      }
    };
  }, [isDemoMode]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Scanner viewfinder */}
      {!isDemoMode && (
        <div
          id={SCANNER_ID}
          className="w-full rounded-xl overflow-hidden border-2 border-primary/30"
          style={{ minHeight: "60vh", background: "transparent" }}
        />
      )}

      {/* Demo mode placeholder */}
      {isDemoMode && (
        <div className="w-full rounded-xl overflow-hidden border-2 border-amber-400/50 bg-amber-950/20 flex items-center justify-center"
          style={{ minHeight: "60vh" }}>
          <div className="text-center p-6">
            <Camera className="w-12 h-12 text-amber-400 mx-auto mb-3 animate-pulse" />
            <p className="text-amber-300 font-medium">Modo Demo</p>
            <p className="text-amber-400/70 text-sm mt-1">Simulando escaneo de QR...</p>
          </div>
        </div>
      )}

      {/* Loading */}
      {isStarting && !isDemoMode && (
        <p className="text-sm text-muted-foreground animate-pulse">Iniciando cámara...</p>
      )}

      {/* Error */}
      {error && (
        <div className="w-full max-w-sm rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Hint */}
      {!error && !isStarting && (
        <p className="text-sm text-muted-foreground text-center">
          Apunta la cámara al código QR de la tarjeta del beneficiario
        </p>
      )}

      {/* Cancel */}
      <Button variant="outline" onClick={onCancel} className="gap-2">
        <X className="w-4 h-4" />
        Cancelar
      </Button>
    </div>
  );
}
