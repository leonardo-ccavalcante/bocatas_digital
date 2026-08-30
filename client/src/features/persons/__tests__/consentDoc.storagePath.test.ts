/**
 * consentDoc.storagePath.test.ts — el documento de consentimiento se guarda como
 * PATH de Storage, nunca como URL.
 *
 * `ConsentModal` subía el papel firmado a `documentos-consentimiento` y guardaba
 * en `consents.documento_foto_url` el resultado de `getPublicUrl()`. Dos fallos
 * a la vez:
 *
 *   · El bucket es PRIVADO (como todos los que guardan datos de personas
 *     beneficiarias; el único público es `announcement-images`), así que esa URL
 *     pública no resuelve: el enlace guardado está muerto.
 *   · Y aunque resolviera, sería el hallazgo CAS-02: una URL almacenada es un
 *     enlace reenviable al consentimiento escaneado de una persona beneficiaria.
 *     La regla del proyecto es persistir el PATH y firmarlo en el servidor, en el
 *     resolver que ya selecciona la columna.
 *
 * Guarda a nivel de fuente, como `server/__tests__/large-payload-paths.test.ts`:
 * la regla es "no llames a esto aquí", y un test de comportamiento no impediría
 * que reaparezca en otro punto del mismo fichero.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const FICHEROS = [
  "../components/ConsentModal.tsx",
  "../components/RegistrationWizard/_useSubmit.ts",
];

describe("consentimiento firmado — PATH, no URL", () => {
  it.each(FICHEROS)("%s no usa getPublicUrl", (rel) => {
    const src = readFileSync(resolve(__dirname, rel), "utf8");
    expect(
      src.includes("getPublicUrl"),
      `${rel} llama a getPublicUrl. Los buckets con datos de personas ` +
        `beneficiarias son privados: guarda el path y fírmalo en el servidor.`
    ).toBe(false);
  });

  it("ConsentModal persiste el path que devuelve el upload", () => {
    const src = readFileSync(resolve(__dirname, "../components/ConsentModal.tsx"), "utf8");
    expect(src).toMatch(/documentoFotoUrl:\s*data\.path/);
  });
});
