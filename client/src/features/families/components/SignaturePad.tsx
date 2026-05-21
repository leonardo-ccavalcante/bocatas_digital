// client/src/features/families/components/SignaturePad.tsx
/**
 * SignaturePad — touch/mouse-drawable canvas that exports a PNG dataURL.
 *
 * Props:
 *   onCapture: (dataUrl: string) => void   — called when "Firmar" is clicked
 *   className?: string
 *
 * Pointer events are used (not touch/mouse directly) for broad device support.
 * Canvas is 200px tall × full container width. Primary target: low-end Android.
 */
import { useRef, useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CheckCircle2 } from "lucide-react";

interface SignaturePadProps {
  onCapture: (dataUrl: string) => void;
  className?: string;
}

export function SignaturePad({ onCapture, className }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const [isEmpty, setIsEmpty] = useState(true);
  const [preview, setPreview] = useState<string | null>(null);

  // Size canvas to match container on mount and resize.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (!rect) return;
      canvas.width = rect.width;
      canvas.height = 200;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      // Draw guide line.
      ctx.strokeStyle = "#d1d5db";
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(12, 120);
      ctx.lineTo(rect.width - 12, 120);
      ctx.stroke();
      ctx.setLineDash([]);
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  const getPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      isDrawing.current = true;
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) return;
      const { x, y } = getPos(e);
      ctx.beginPath();
      ctx.moveTo(x, y);
    },
    []
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isDrawing.current) return;
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) return;
      const { x, y } = getPos(e);
      ctx.lineTo(x, y);
      ctx.strokeStyle = "#111827";
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();
      setIsEmpty(false);
    },
    []
  );

  const handlePointerUp = useCallback(() => {
    isDrawing.current = false;
  }, []);

  const handleClear = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Redraw guide line.
    ctx.strokeStyle = "#d1d5db";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(12, 120);
    ctx.lineTo(canvas.width - 12, 120);
    ctx.stroke();
    ctx.setLineDash([]);
    setIsEmpty(true);
    setPreview(null);
  }, []);

  const handleCapture = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    setPreview(dataUrl);
    onCapture(dataUrl);
  }, [onCapture]);

  if (preview) {
    return (
      <div className={cn("rounded-lg border p-3 space-y-2", className)}>
        <div className="flex items-center gap-2 text-sm text-emerald-700">
          <CheckCircle2 className="w-4 h-4" />
          <span>Firma capturada</span>
          <button
            type="button"
            onClick={() => {
              setPreview(null);
              setIsEmpty(true);
            }}
            className="ml-auto text-xs text-muted-foreground underline"
          >
            Repetir
          </button>
        </div>
        <img
          src={preview}
          alt="Firma capturada"
          className="w-full h-24 object-contain border rounded bg-white"
        />
      </div>
    );
  }

  return (
    <div className={cn("rounded-lg border space-y-2", className)}>
      <div
        id="signature-pad-hint"
        className="px-3 pt-3 text-xs text-muted-foreground"
      >
        Dibuje su firma con el dedo o el ratón
      </div>
      <canvas
        ref={canvasRef}
        className="w-full touch-none cursor-crosshair bg-white"
        style={{ height: 200 }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        aria-label="Área de firma"
        aria-describedby="signature-pad-hint"
        role="img"
      />
      <div className="flex gap-2 px-3 pb-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleClear}
          disabled={isEmpty}
        >
          Borrar
        </Button>
        <Button
          type="button"
          size="sm"
          className="flex-1"
          disabled={isEmpty}
          onClick={handleCapture}
        >
          Firmar
        </Button>
      </div>
    </div>
  );
}
