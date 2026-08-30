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

/** Sufijos DNS que, por definición, no se resuelven en Internet público. */
const SUFIJOS_PRIVADOS = [".internal", ".local"];

/** IPv4 privadas (RFC1918) y link-local (RFC3927). */
function esIpv4Privada(hostname: string): boolean {
  const partes = hostname.split(".");
  if (partes.length !== 4) return false;
  const [a, b] = partes.map(Number);
  if (partes.some((p) => !/^\d{1,3}$/.test(p)) || a === undefined || b === undefined) return false;
  if (a === 10 || a === 127) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true; // link-local
  return false;
}

/**
 * ¿El destino está fuera de Internet público?
 *
 * Los sidecars reales no se alcanzan por un nombre suelto: Railway los expone
 * como `gotenberg.railway.internal`, Fly como `gotenberg.internal`, Kubernetes
 * como `gotenberg.default.svc.cluster.local`, y un VPS con red privada por una
 * IP RFC1918. Aceptar sólo nombres sin puntos dejaba fuera todos esos casos y
 * empujaba al operador hacia el `http://` público, que es justo lo que hay que
 * evitar. IPv6 ULA (fd00::/8) y link-local (fe80::/10) entran también.
 */
function esRedPrivada(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, "");
  if (!h.includes(".") && !h.includes(":")) return true; // docker-compose
  if (SUFIJOS_PRIVADOS.some((suf) => h.endsWith(suf))) return true;
  if (esIpv4Privada(h)) return true;
  const sinCorchetes = h.replace(/^\[|\]$/g, "");
  return /^f[cd]/.test(sinCorchetes) || sinCorchetes.startsWith("fe80:");
}

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

  if (url.search || url.hash) {
    throw new PdfWorkerConfigError(
      "LIBREOFFICE_WORKER_URL no admite query ni fragmento: la ruta del worker se " +
        `añade al final y quedaría mal formada (${raw})`,
    );
  }

  if (
    url.protocol === "http:" &&
    !LOOPBACK.has(url.hostname) &&
    !esRedPrivada(url.hostname)
  ) {
    throw new PdfWorkerConfigError(
      `LIBREOFFICE_WORKER_URL apunta a ${url.hostname} por http sin cifrar. El cuerpo ` +
        "de esa petición es el informe social completo (datos personales de una persona " +
        "beneficiaria), así que hacia un host público sólo se admite https. El texto plano " +
        "queda reservado a redes que no salen a Internet: localhost, un nombre de servicio " +
        "de docker-compose, un sufijo .internal o .local (Railway, Fly, Kubernetes) o una " +
        "IP privada.",
    );
  }

  // Las credenciales embebidas en la URL no autentican nada aquí (undici no las
  // convierte en Authorization) y sólo servirían para acabar en un log.
  url.username = "";
  url.password = "";

  return {
    baseUrl: url.toString().replace(/\/+$/, ""),
    token: env.LIBREOFFICE_WORKER_TOKEN?.trim() || null,
  };
}
