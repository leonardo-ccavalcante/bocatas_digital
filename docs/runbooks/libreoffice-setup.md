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
2. **gotenberg sidecar** (~400 MB HTTP service). Se evaluó y se DESCARTÓ: mete
   una petición de red que lleva el informe social completo —datos personales de
   una persona beneficiaria— y con ella toda una política de qué destinos son
   aceptables. A este volumen (decenas de informes al mes) no compra nada: el
   único beneficio real es el tamaño de imagen. Si algún día el volumen lo pide,
   el historial de la rama `fix/libreoffice-worker` tiene la implementación.

Pick one before enabling `derivar.generatePdf` in production.

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
