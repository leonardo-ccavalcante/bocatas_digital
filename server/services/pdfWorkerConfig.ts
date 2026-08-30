/**
 * pdfWorkerConfig — política de a dónde se puede mandar un .docx a convertir.
 *
 * El runbook (docs/runbooks/libreoffice-setup.md) contempla dos caminos para el
 * PDF: LibreOffice instalado en el host, o un sidecar HTTP tipo gotenberg.
 * `LIBREOFFICE_WORKER_URL` es ese segundo camino.
 *
 * Módulo puro y aparte porque lo que decide NO es una URL, es si un informe de
 * valoración social —nombre, domicilio y situación familiar de una persona
 * beneficiaria— puede salir de esta máquina y por dónde. Eso merece test propio.
 */

export class PdfWorkerConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfWorkerConfigError";
  }
}

export interface PdfWorkerConfig {
  /** Base sin barra final. */
  baseUrl: string;
  /** Secreto compartido para el worker, si lo hay. */
  token: string | null;
}

/** Hosts donde el texto plano no sale de la máquina. */
const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export type WorkerEnv = Record<string, string | undefined>;

/**
 * Resuelve el worker remoto, o null si no hay ninguno configurado (entonces se
 * convierte con el LibreOffice local).
 *
 * Lanza si la configuración existe pero no es segura: preferimos quedarnos sin
 * PDF a mandar la ficha social de alguien en claro por Internet. Un fallo
 * silencioso aquí no se nota nunca — que es justo lo que lo hace peligroso.
 */
export function resolvePdfWorker(env: WorkerEnv): PdfWorkerConfig | null {
  const raw = env.LIBREOFFICE_WORKER_URL?.trim();
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new PdfWorkerConfigError(
      `LIBREOFFICE_WORKER_URL no es una URL válida: ${raw}`,
    );
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new PdfWorkerConfigError(
      `LIBREOFFICE_WORKER_URL debe ser http(s); recibido: ${url.protocol}`,
    );
  }

  if (url.protocol === "http:" && !LOOPBACK.has(url.hostname)) {
    throw new PdfWorkerConfigError(
      `LIBREOFFICE_WORKER_URL apunta a ${url.hostname} por http sin cifrar. El cuerpo ` +
        "de esa petición es el informe social completo (datos personales de una persona " +
        "beneficiaria), así que sólo se admite https hacia un host remoto; el texto plano " +
        "queda reservado a un sidecar en la propia máquina (localhost).",
    );
  }

  return {
    baseUrl: url.toString().replace(/\/+$/, ""),
    token: env.LIBREOFFICE_WORKER_TOKEN?.trim() || null,
  };
}
