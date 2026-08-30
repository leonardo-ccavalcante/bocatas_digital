# Runbook — LibreOffice for Derivar PDF generation

`server/_core/pdfFromDocx.ts` invokes `libreoffice --headless --convert-to pdf`
to turn the rendered Derivar `.docx` (Hoja de Registro de Derivaciones e
Intervenciones) into a print-ready PDF. LibreOffice is therefore a **host-level
dependency** wherever `derivar.generatePdf` runs.

> **Status:** Deferred infra decision (owner: Felix). The DOCX path
> (`derivar.generateDocx`) works without LibreOffice; only the PDF path needs it.

## Local development (macOS)

```bash
brew install --cask libreoffice
which libreoffice
# expected: /usr/local/bin/libreoffice or /opt/homebrew/bin/libreoffice
```

If `which libreoffice` prints nothing but the cask is installed, symlink the app binary:

```bash
ln -s "/Applications/LibreOffice.app/Contents/MacOS/soffice" /usr/local/bin/libreoffice
```

## Deploy host — two supported paths

1. **Install in the container/image** (`apt-get install -y libreoffice` — ~700 MB).
   Simplest, but inflates image size and cold-start.
2. **gotenberg sidecar** (~400 MB HTTP service). Smaller app image, one more
   service to run. **Ya está implementado** en `server/services/docxToPdf.ts`:
   define `LIBREOFFICE_WORKER_URL` y la conversión pasa por
   `POST {url}/forms/libreoffice/convert` (multipart, campo `files`) en vez de
   hacer spawn local. `LIBREOFFICE_WORKER_TOKEN`, si está, viaja como
   `Authorization: Bearer`.

Pick one before enabling `derivar.generatePdf` in production.

### El worker remoto tiene que ir por https

El cuerpo de esa petición es el informe de valoración social completo: nombre,
domicilio y situación familiar de una persona beneficiaria. `resolvePdfWorker`
(`server/services/pdfWorkerConfig.ts`) exige por eso `https://` para cualquier
host que no sea loopback, y **falla cerrado** — no cae al binario local — si la
configuración no cumple: quien la puso tiene que enterarse, porque un fallback
silencioso aquí no se nota nunca.

Admiten texto plano dos casos, porque en ninguno sale el tráfico a Internet:
`localhost` / `127.0.0.1`, y un nombre de una sola etiqueta como
`http://gotenberg:3000` — un host sin puntos no se resuelve fuera de la red de
contenedores. Un dominio público por `http://` se rechaza siempre.

> Aviso: `.env` llegó a traer `LIBREOFFICE_WORKER_URL=http://<ip>:7654`, texto
> plano hacia una IP remota, en un momento en que **ningún código leía la
> variable**. Ahora que sí se lee, esa configuración se rechaza. Apunta el worker
> a un endpoint https o borra la variable para usar el binario local.

## Concurrency

LibreOffice locks `~/.config/libreoffice` per profile. `pdfFromDocx.ts`
serializes conversions through an in-process Promise queue. If throughput
becomes a problem, pass `-env:UserInstallation=file:///tmp/<uuid>` per
invocation so each run uses an isolated profile.

## Verifying

```bash
echo "hello" > /tmp/t.txt && libreoffice --headless --convert-to pdf --outdir /tmp /tmp/t.txt
# expected: /tmp/t.pdf created, exit code 0
```

If the convert exits non-zero, `convertDocxToPdf` rejects with the captured
stderr — surface that to the caller, never the raw file paths.
