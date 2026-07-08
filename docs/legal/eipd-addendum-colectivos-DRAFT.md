# Adenda EIPD (DRAFT) — Recogida de "pertenencia a colectivo" (datos de categoría especial, RGPD Art. 9/10)

> **ESTADO: BORRADOR — NO APLICAR EN PRODUCCIÓN HASTA FIRMA.**
> Esta adenda debe ser revisada y firmada por el/la responsable legal (DPO/abogado
> RGPD de la Asociación Bocatas) **antes** de comenzar a tratar datos reales de
> beneficiarios en el campo `persons.colectivos` / `persons.colectivo_otros`.
> Sigue el patrón del precedente `docs/legal/eipd-addendum-derivar-DRAFT.md`.

## 1. Objeto y contexto

El formulario de inscripción incorpora un campo **"Pertenencia a colectivo"**
(sección "Otras características" del formulario del financiador IRPF/FSE) que
recoge:

- `colectivos` (multi-valor): `Población gitana`, `LGTBI`, `Sin hogar`,
  `Reclusos / exreclusos`.
- `colectivo_otros` (texto libre): otro colectivo especificado.

**Finalidad:** producir el **informe demográfico anual IRPF/FSE** exigido por el
financiador (justificación de subvención), con desglose por "otras
características" del colectivo atendido. El uso es **exclusivamente agregado y
anonimizado** (k-anonimato ≥ 3): ningún dato individual de colectivo abandona el
servidor en el informe.

## 2. Categorización RGPD

Estos datos son **categoría especial (Art. 9 RGPD)** y en parte **datos penales
(Art. 10 RGPD)**:

| Valor | Categoría RGPD |
|---|---|
| Población gitana | Art. 9 — origen étnico |
| LGTBI | Art. 9 — orientación sexual |
| Sin hogar | Dato de vulnerabilidad social (no Art. 9 per se, tratado con la misma cautela) |
| Reclusos / exreclusos | Art. 10 — datos relativos a condenas e infracciones penales |

Población destinataria: **personas vulnerables**. El riesgo de reidentificación y
de daño en caso de brecha es **alto**.

## 3. Base jurídica

- **Art. 9.2.a — consentimiento explícito** de la persona interesada. Es la base
  primaria: el campo solo se persiste si la persona otorga consentimiento
  explícito en el propio formulario (casilla dedicada, granular, en el punto de
  recogida). **Rehusar el consentimiento NO condiciona el acceso al servicio**
  (recusar ≠ negar servicio); si no consiente, no se guarda nada.
- Base secundaria a valorar por el/la DPO: Art. 9.2.g (interés público esencial,
  justificación de subvención pública) — a documentar si procede.

## 4. Principios aplicados

- **Minimización:** solo se recogen las 4 categorías del formulario IRPF/FSE + un
  "otros" opcional. Ningún dato de colectivo se recoge por defecto.
- **Limitación de la finalidad:** uso exclusivo para el informe agregado del
  financiador; prohibido su uso para decisiones individuales.
- **Exactitud:** dato declarado por la persona; editable/revocable.

## 5. Medidas técnicas y organizativas

- **Cifrado en reposo (texto libre):** `colectivo_otros` se cifra a nivel de
  aplicación con **AES-256-GCM** (`server/_core/pii-crypto.ts`); la clave
  (`PII_ENCRYPTION_KEY`) reside en el gestor de secretos (Manus IM), **nunca** en
  la base de datos, migraciones ni git. Diseño **fail-closed**: sin clave, el
  sistema **rehúsa** almacenar el dato (no guarda texto en claro).
- **`colectivos` (enum array):** NO se cifra a nivel de columna (debe poder
  agregarse para el informe). Se protege mediante: cifrado en disco por defecto
  de Supabase, **redacción a nivel de aplicación** (`redactHighRiskFields` — solo
  admin/superadmin), y **grants de columna** a `admin_role`/`superadmin_role`.
- **Control de acceso:** lectura restringida a admin/superadmin. El campo se
  excluye de la vista `persons_safe` y del generador de informes personalizados.
- **k-anonimato ≥ 3:** cualquier categoría con menos de 3 personas se suprime en
  el informe.
- **Registro de acceso (Art. 30):** los informes registran auditoría sin PII
  (solo IDs, año, recuentos de supresión).
- **Sin PII en logs:** política del proyecto (CLAUDE.md).

## 6. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Reidentificación de persona vulnerable vía cruce de dimensiones | k-anonimato ≥ 3; salida solo agregada |
| Brecha de base de datos (backup / acceso DBA) | Cifrado de disco + cifrado app-layer del texto libre + grants de columna |
| Compromiso del servidor de aplicación (tiene clave + service-role) | **Limitación honesta:** el cifrado NO protege frente a este vector; mitigar con endurecimiento de la superficie `select('*')` y aplicación en staging de la RLS a nivel de columna pendiente (`20260508000001`) |
| Recogida sin base jurídica | Casilla de consentimiento explícito obligatoria para persistir |
| Uso para decisiones individuales | Prohibición documentada; uso solo agregado |

## 7. Condición de activación (GATE)

- La recogida de datos reales **no comenzará** hasta que esta adenda esté
  **firmada** por el/la responsable legal.
- Antes del go-live en producción: (a) `PII_ENCRYPTION_KEY` configurada en Manus
  IM; (b) verificación en staging de que voluntarios NO ven el campo y
  admin/superadmin SÍ (redacción + descifrado); (c) revisión del texto de
  consentimiento por el/la DPO.

## 8. Derechos de las personas (ARCO / RGPD)

- Acceso, rectificación, supresión, oposición y retirada del consentimiento en
  cualquier momento. La supresión debe **purgar** también el valor cifrado.
- Retención: revisar con la periodicidad del EIPD base; no conservar más allá de
  la finalidad de justificación de subvención.

---

*Documento borrador generado como parte de la funcionalidad "demografía IRPF en
el formulario de inscripción". Pendiente de revisión y firma legal.*
