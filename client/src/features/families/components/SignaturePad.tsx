// client/src/features/families/components/SignaturePad.tsx
/**
 * SignaturePad — touch/mouse/stylus-drawable canvas that exports a PNG dataURL.
 *
 * Props (unchanged public API — shared by reparto + entregas):
 *   onCapture: (dataUrl: string) => void   — called when "Firmar" is clicked
 *   className?: string
 *
 * Quality (matters for legal signature evidence):
 *   · devicePixelRatio scaling — crisp, high-res export on mobile.
 *   · quadratic-midpoint smoothing (+ coalesced pointer events) — no polygonal look.
 *   · the dashed baseline is a CSS layer, NOT drawn on the canvas → never exported.
 *   · resize preserves the drawn ink (snapshot/restore) instead of wiping it.
 *   · a minimum ink length is required before "Firmar" enables (rejects a dot).
 *   · onPointerCancel ends the stroke cleanly.
 * Primary target: low-end Android.
 */
import { useRef, useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CheckCircle2 } from "lucide-react";

interface SignaturePadProps {
  onCapture: (dataUrl: string) => void;
  className?: string;
}

const HEIGHT = 200;
const MIN_INK = 60; // px of total path length — a single tap/dot stays below this.

interface Pt { x: number; y: number }

export function SignaturePad({ onCapture, className }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const isDrawing = useRef(false);
  const last = useRef<Pt>({ x: 0, y: 0 });
  const ink = useRef(0);
  const [hasInk, setHasInk] = useState(false); // enough ink to submit (>= MIN_INK)
  const [hasAnyInk, setHasAnyInk] = useState(false); // any mark at all → Borrar usable
  const [preview, setPreview] = useState<string | null>(null);

  const configureCtx = (ctx: CanvasRenderingContext2D) => {
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111827";
  };

  // Size the canvas to its container at device resolution, preserving any ink.
  const setupCanvas = useCallback((preserve: boolean) => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const cssW = wrap.getBoundingClientRect().width;
    if (cssW === 0) return;
    const dpr = window.devicePixelRatio || 1;
    // We already track drawn length in the `ink` ref — no need to scan pixels.
    const snapshot = preserve && ink.current > 0 ? canvas.toDataURL() : null;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(HEIGHT * dpr);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${HEIGHT}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    configureCtx(ctx);
    if (snapshot) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, cssW, HEIGHT);
      img.src = snapshot;
    }
  }, []);

  useEffect(() => {
    setupCanvas(false);
    const onResize = () => setupCanvas(true);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [setupCanvas]);

  const getPos = (e: React.PointerEvent<HTMLCanvasElement>): Pt => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    isDrawing.current = true;
    last.current = getPos(e);
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) { ctx.beginPath(); ctx.moveTo(last.current.x, last.current.y); }
  }, []);

  const strokeTo = (ctx: CanvasRenderingContext2D, p: Pt) => {
    const l = last.current;
    const mid = { x: (l.x + p.x) / 2, y: (l.y + p.y) / 2 };
    ctx.quadraticCurveTo(l.x, l.y, mid.x, mid.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(mid.x, mid.y);
    ink.current += Math.hypot(p.x - l.x, p.y - l.y);
    last.current = p;
  };

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    // Coalesced events give the intermediate points the browser batched — smoother.
    const native = e.nativeEvent as PointerEvent & { getCoalescedEvents?: () => PointerEvent[] };
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const events = native.getCoalescedEvents?.() ?? [native];
    for (const ev of events) strokeTo(ctx, { x: ev.clientX - rect.left, y: ev.clientY - rect.top });
    if (!hasAnyInk) setHasAnyInk(true);
    if (ink.current >= MIN_INK && !hasInk) setHasInk(true);
  }, [hasInk, hasAnyInk]);

  const endStroke = useCallback(() => { isDrawing.current = false; }, []);

  const handleClear = useCallback(() => {
    // Reset state unconditionally — when invoked from "Repetir" the canvas is
    // unmounted (preview shown), so an early return would leave stale ink state.
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    ink.current = 0;
    setHasInk(false);
    setHasAnyInk(false);
    setPreview(null);
  }, []);

  const handleCapture = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !hasInk) return;
    const dataUrl = canvas.toDataURL("image/png");
    setPreview(dataUrl);
    onCapture(dataUrl);
  }, [onCapture, hasInk]);

  if (preview) {
    return (
      <div className={cn("rounded-lg border p-3 space-y-2", className)}>
        <div className="flex items-center gap-2 text-sm text-emerald-700">
          <CheckCircle2 className="w-4 h-4" />
          <span>Firma capturada</span>
          <button
            type="button"
            onClick={handleClear}
            className="ml-auto text-xs text-muted-foreground underline min-h-11 px-2"
          >
            Repetir
          </button>
        </div>
        <img src={preview} alt="Firma capturada" className="w-full h-24 object-contain border rounded bg-white" />
      </div>
    );
  }

  return (
    <div className={cn("rounded-lg border space-y-2", className)}>
      <div
        id="signature-pad-hint"
        role="status"
        aria-live="polite"
        className={cn("px-3 pt-3 text-xs", hasAnyInk && !hasInk ? "text-amber-600" : "text-muted-foreground")}
      >
        {hasAnyInk && !hasInk
          ? "La firma es muy corta — dibuje un poco más o pulse Borrar."
          : "Dibuje su firma con el dedo, el lápiz o el ratón"}
      </div>
      {/* Wrapper carries the white bg + dashed baseline as a CSS layer, so the
          guide is NEVER part of the exported canvas ink. */}
      <div ref={wrapRef} className="relative mx-3 bg-white" style={{ height: HEIGHT }}>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-3 border-b border-dashed border-gray-300"
          style={{ top: 120 }}
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 touch-none cursor-crosshair"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endStroke}
          onPointerCancel={endStroke}
          onPointerLeave={endStroke}
          aria-label="Área de firma"
          aria-describedby="signature-pad-hint"
          role="img"
        />
      </div>
      <div className="flex gap-2 px-3 pb-3">
        <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={handleClear} disabled={!hasAnyInk}>
          Borrar
        </Button>
        <Button type="button" size="sm" className="flex-1 min-h-11" disabled={!hasInk} onClick={handleCapture}>
          Firmar
        </Button>
      </div>
    </div>
  );
}
