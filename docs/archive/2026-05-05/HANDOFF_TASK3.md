# Handoff — Task 3: Epic B — QR Check-in

**Fecha:** 2026-04-11  
**Commit:** `a41e2e0`  
**Rama:** `main`  
**Repositorio:** [leonardo-ccavalcante/bocatas_digital](https://github.com/leonardo-ccavalcante/bocatas_digital)

---

## Alcance implementado

El Epic B implementa el flujo completo de **registro de asistencia por QR** para el comedor de Bocatas Digital, conforme al spec `TASK3_EPIC_B_CHECKIN.md`.

### Nuevas rutas

| Ruta | Componente | Descripción |
|---|---|---|
| `/checkin` | `client/src/pages/CheckIn.tsx` | Página principal de check-in |

### Nuevos archivos

```
client/src/features/checkin/
  machine/checkinMachine.ts       ← XState machine (8 estados)
  store/useCheckinStore.ts        ← Zustand: locationId, programaId, pendingQueue
  hooks/useCheckin.ts             ← Bridge XState ↔ tRPC
  components/
    QRScanner.tsx                 ← html5-qrcode wrapper
    ResultCard.tsx                ← green/amber/red/grey + dietary badge
    ManualSearchModal.tsx         ← fuzzy search con debounce 300ms
    LocationSelector.tsx          ← selector de sede
    ProgramSelector.tsx           ← selector de programa
    DemoModeBanner.tsx            ← banner modo demo (toggle switch)
    OfflinePendingBadge.tsx       ← badge contador de cola offline

client/src/hooks/useDebounce.ts   ← hook genérico de debounce

server/routers/checkin.ts         ← tRPC router (verifyAndInsert, searchPersons,
                                     getLocations, anonymousCheckin)
server/checkin.test.ts            ← 23 tests (XState + router)

drizzle/seeds/epic_b_checkin.sql  ← SQL artifact: constraint, view, locations, Maria
```

---

## XState Machine — 8 estados

```
idle → scanning → verifying → registered   (verde: check-in exitoso)
                             → duplicate    (ámbar: ya registrado hoy)
                             → not_found    (rojo: QR no reconocido)
                             → error        (rojo: error de red/servidor)
                             → offline      (gris: sin conexión → cola)
```

**Transiciones clave:**
- `SCAN_QR` / `MANUAL_SELECT` → `verifying`
- `SUCCESS` → `registered` (auto-reset a `idle` en 3s)
- `DUPLICATE` → `duplicate` (auto-reset a `idle` en 3s)
- `NOT_FOUND` → `not_found`
- `NETWORK_ERROR` → `offline` (guarda en pendingQueue)
- `RESET` → `idle`

---

## DB — Cambios aplicados

Todos los cambios están documentados en `drizzle/seeds/epic_b_checkin.sql`:

| Cambio | Estado |
|---|---|
| `attendances_unique_checkin` constraint | ✅ Aplicado |
| `persons_safe` view | ✅ Verificada (existía) |
| 3 locations (Sede Central, Ópera, La Cañada) | ✅ Aplicadas |
| Maria Garcia Lopez (Sin gluten) seed | ✅ Aplicada |

---

## Setup y comandos

```bash
# Instalar dependencias (incluye xstate, html5-qrcode)
pnpm install

# Ejecutar tests (94 pasando)
pnpm test

# TypeScript check (0 errores)
pnpm check

# Build de producción
pnpm build

# Servidor de desarrollo
pnpm dev
```

---

## Modo Demo

Accede a `/checkin?modo=demo` para activar el modo demo, o usa el toggle en la página de check-in. En modo demo:
- El QR scanner muestra un botón "Simular escaneo" en lugar de la cámara
- Los resultados son simulados (no se escriben en DB)
- Útil para demos y formación de voluntarios

---

## Offline Queue

Cuando el dispositivo pierde conexión:
1. El check-in se guarda en `useCheckinStore.pendingQueue` (Zustand + localStorage)
2. El badge `OfflinePendingBadge` muestra el número de pendientes
3. Al recuperar conexión, `flushQueue()` procesa automáticamente la cola

---

## Validación E2E (pasos para el tester)

1. Navegar a `/checkin`
2. Seleccionar sede y programa
3. Escanear el QR de una persona registrada → resultado verde
4. Escanear el mismo QR de nuevo → resultado ámbar (duplicado)
5. Escanear un QR inválido → resultado rojo (no encontrado)
6. Usar "Buscar manualmente" → escribir "Maria" → seleccionar → resultado verde con badge "Sin gluten"
7. Desconectar WiFi → escanear → resultado gris (offline, guardado en cola)
8. Reconectar → verificar que la cola se procesa automáticamente

---

## Riesgos y pendientes

| Ítem | Prioridad | Descripción |
|---|---|---|
| Auth migration | Alta | Los ítems de Auth Migration (Manus OAuth) siguen pendientes del sprint anterior |
| CI verde | Media | GitHub Actions CI necesita verificación |
| Chunk size | Baja | Bundle principal >800KB (advertencia Vite, no error). Considerar lazy loading de html5-qrcode |
