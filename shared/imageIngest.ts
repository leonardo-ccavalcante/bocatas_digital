// shared/imageIngest.ts
//
// MYTHOS: MYT-129C — shared home for the signature/image ingest helpers that
// were duplicated verbatim across server/routers/families/rounds-signature.ts
// and server/routers/entregas/signature.ts (issue #129).
//
// Node `Buffer` is used deliberately: this file follows the same precedent as
// shared/ipHash.ts (node:crypto), which lives under shared/ but is only ever
// imported by server-side routers — never reachable from a client entry point,
// so it never enters the browser bundle despite shared/'s Vite alias.
//
// Behavioural reference: server/routers/families/rounds-signature.ts (the one
// pre-existing named implementation) — ported here unchanged.

/** Sniff the real decoded bytes for PNG/JPEG magic numbers (defence-in-depth
 * over any Zod dataURL-shape regex). */
export function sniffImage(buffer: Buffer): "png" | "jpeg" | null {
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  )
    return "png";
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff)
    return "jpeg";
  return null;
}

/** Strip a `data:image/<type>;base64,` prefix (if present) and decode the
 * base64 payload into a Buffer. */
export function dataUrlToImageBuffer(dataUrl: string): Buffer {
  const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, "");
  return Buffer.from(base64, "base64");
}
