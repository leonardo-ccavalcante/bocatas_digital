/**
 * pdfWorkerConfig.test.ts — a dónde se puede mandar un informe social a convertir.
 *
 * `.env` traía `LIBREOFFICE_WORKER_URL=http://35.231.120.16:7654` y ningún
 * código lo leía. Cablearlo tal cual habría sido peor que dejarlo muerto: el
 * cuerpo de esa petición es el informe de valoración social — nombre, domicilio,
 * situación familiar de una persona beneficiaria — y `http://` lo manda en claro
 * por Internet abierto hacia una IP sin certificado ni identidad verificable.
 *
 * Regla: texto plano sólo contra loopback (un sidecar en la propia máquina).
 * Cualquier otro host tiene que ser HTTPS. Falla cerrado y nombrando el motivo,
 * porque un fallo silencioso aquí es una fuga de PII.
 */
import { describe, it, expect } from "vitest";
import { resolvePdfWorker, PdfWorkerConfigError } from "../pdfWorkerConfig";

describe("resolvePdfWorker", () => {
  it("sin variable no hay worker: se convierte en local", () => {
    expect(resolvePdfWorker({})).toBeNull();
    expect(resolvePdfWorker({ LIBREOFFICE_WORKER_URL: "   " })).toBeNull();
  });

  it("acepta HTTPS", () => {
    expect(
      resolvePdfWorker({ LIBREOFFICE_WORKER_URL: "https://pdf.bocatas.org" })
    ).toEqual({ baseUrl: "https://pdf.bocatas.org", token: null });
  });

  it("normaliza la barra final para no generar // al unir la ruta", () => {
    expect(
      resolvePdfWorker({ LIBREOFFICE_WORKER_URL: "https://pdf.bocatas.org/" })?.baseUrl
    ).toBe("https://pdf.bocatas.org");
  });

  it("acepta texto plano SOLO en loopback", () => {
    for (const host of ["http://localhost:7654", "http://127.0.0.1:7654"]) {
      expect(resolvePdfWorker({ LIBREOFFICE_WORKER_URL: host })?.baseUrl).toBe(host);
    }
  });

  it("rechaza texto plano hacia una IP remota, que es lo que había en .env", () => {
    expect(() =>
      resolvePdfWorker({ LIBREOFFICE_WORKER_URL: "http://35.231.120.16:7654" })
    ).toThrow(PdfWorkerConfigError);
  });

  it("el error explica que el cuerpo lleva datos de la persona", () => {
    try {
      resolvePdfWorker({ LIBREOFFICE_WORKER_URL: "http://35.231.120.16:7654" });
      expect.fail("debería haber lanzado");
    } catch (err) {
      expect((err as Error).message).toMatch(/https/i);
      expect((err as Error).message).toMatch(/informe social|datos personales|PII/i);
    }
  });

  it("rechaza un esquema que no sea http(s)", () => {
    expect(() =>
      resolvePdfWorker({ LIBREOFFICE_WORKER_URL: "file:///etc/passwd" })
    ).toThrow(PdfWorkerConfigError);
  });

  it("rechaza una URL que no se puede interpretar", () => {
    expect(() => resolvePdfWorker({ LIBREOFFICE_WORKER_URL: "no-es-una-url" })).toThrow(
      PdfWorkerConfigError
    );
  });

  // Hallazgos de revisión adversarial.
  it("admite texto plano hacia un nombre de servicio de una sola etiqueta", () => {
    // El runbook propone un sidecar en docker-compose, que se alcanza como
    // `http://gotenberg:3000`. Un nombre sin puntos no es resoluble en Internet
    // público: es una red de contenedores. Rechazarlo dejaba el runbook
    // documentando un caso que el código tumbaba.
    expect(resolvePdfWorker({ LIBREOFFICE_WORKER_URL: "http://gotenberg:3000" })?.baseUrl).toBe(
      "http://gotenberg:3000"
    );
  });

  // Los sidecars reales no se alcanzan por un nombre suelto: Railway usa
  // `*.railway.internal`, Fly `*.internal`, Kubernetes `*.svc.cluster.local`, y
  // un VPS con red privada una IP RFC1918. Ninguno es enrutable en Internet.
  it("admite texto plano por las redes privadas de las plataformas", () => {
    for (const url of [
      "http://gotenberg.railway.internal:3000",
      "http://gotenberg.internal:3000",
      "http://gotenberg.default.svc.cluster.local:3000",
      "http://gotenberg.local:3000",
      "http://10.0.0.5:3000",
      "http://172.16.4.9:3000",
      "http://192.168.1.20:3000",
    ]) {
      expect(resolvePdfWorker({ LIBREOFFICE_WORKER_URL: url })?.baseUrl).toBe(url);
    }
  });

  // La comprobación de IPv6 ULA corría contra CUALQUIER hostname, no sólo contra
  // literales IPv6: `/^f[cd]/` daba positivo con `fcm.googleapis.com`. Un agujero
  // abierto dentro del propio endurecimiento.
  it("un dominio público que empieza por fc o fd NO es una red privada", () => {
    for (const host of ["fcm.googleapis.com", "fcbarcelona.com", "fd-agency.co.uk"]) {
      expect(() =>
        resolvePdfWorker({ LIBREOFFICE_WORKER_URL: `http://${host}` })
      ).toThrow(PdfWorkerConfigError);
    }
  });

  it("no confunde una IP pública con una privada", () => {
    for (const url of [
      "http://35.231.120.16:7654", // el valor que traía .env
      "http://172.32.0.1:3000", // fuera del rango 172.16–172.31
      "http://11.0.0.1:3000",
    ]) {
      expect(() => resolvePdfWorker({ LIBREOFFICE_WORKER_URL: url })).toThrow(
        PdfWorkerConfigError
      );
    }
  });

  it("sigue rechazando texto plano hacia un dominio público", () => {
    expect(() =>
      resolvePdfWorker({ LIBREOFFICE_WORKER_URL: "http://pdf.example.com" })
    ).toThrow(PdfWorkerConfigError);
  });

  it("no arrastra credenciales embebidas en la URL", () => {
    // `url.toString()` las conserva, y no autentican nada: sólo se filtrarían.
    const cfg = resolvePdfWorker({ LIBREOFFICE_WORKER_URL: "https://tok:sec@pdf.bocatas.org" });
    expect(cfg?.baseUrl).toBe("https://pdf.bocatas.org");
    expect(cfg?.baseUrl).not.toMatch(/sec/);
  });

  it("rechaza una URL con query, que rompería el join de la ruta", () => {
    expect(() =>
      resolvePdfWorker({ LIBREOFFICE_WORKER_URL: "https://pdf.bocatas.org/gw?x=1" })
    ).toThrow(PdfWorkerConfigError);
  });

  it("recoge el token compartido cuando está definido", () => {
    expect(
      resolvePdfWorker({
        LIBREOFFICE_WORKER_URL: "https://pdf.bocatas.org",
        LIBREOFFICE_WORKER_TOKEN: "s3cr3t",
      })?.token
    ).toBe("s3cr3t");
  });
});
