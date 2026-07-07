## Problema
Após `cerrarTurno` marcar as pendientes de um turno como no-show (`attended=false`), os caminhos de attendance **não checam o estado do slot**, permitindo alterar a assistência num turno já **cerrado** — o que corrompe o absentismo (um no-show pode virar attended num turno fechado).

Detectado no gate adversarial (Codex) da branch `feat/reparto-turnos`.

## Caminhos afetados
- `server/routers/families/rounds-closeout.ts`:
  - `markAttendance` — atualiza por `assignment_id`, sem checar o slot.
  - `bulkMarkAttendance` — idem, scoped só por `round_id`.
  - `undoAttendance` — pode reverter o no-show gravado pelo `cerrarTurno`.
  - `resolveAssignment` — trata `attended=false` como `ready` (rescan de um no-show num turno fechado).
- `client/src/features/familias-reparto/components/RepartoTab.tsx` — ainda renderiza o close-out para slots fechados.

## Cenário de falha
1. Admin fecha o turno → `cerrar_turno` marca as pendientes como `attended=false`.
2. Voluntário escaneia/OCR uma dessas famílias → `resolveAssignment` retorna `ready` → `markAttendance(attended=true)`.
3. O no-show vira attended num turno **cerrado** → `getAbsentismoByRound` conta errado.

## Correção proposta
- Guard nos writes de attendance (`markAttendance`, `bulkMarkAttendance`): rejeitar se o slot `(round_id, assigned_day, turno)` estiver `cerrado` (join/lock ao slot, idealmente numa RPC).
- `resolveAssignment`: retornar um status `turno_cerrado` quando o slot estiver fechado.
- `undoAttendance`: bloquear em turno cerrado (ou exigir um caminho de correção auditado separado).
- Gate na UI (`RepartoTab`): não abrir close-out de slot cerrado.

## Variantes relacionadas (reschedule/reassign — mesma família)
Achadas no /code-review adversarial da branch:

- **`reassignPending` — alcance excessivo pra trás** (`rounds-closeout.ts:257`): monta `pastKeys` com TODOS os slots `ordinal <= fromOrdinal`, **incluindo turnos já cerrados**, e a query puxa `attended.eq.false`. Reprogramar a partir do slot 3 varre também os no-shows finalizados dos slots 1–2 e os move (reset `attended=NULL`), apagando ausências já registradas. Fix: restringir o sweep ao(s) slot(s) de origem pretendido(s).
- **`move_assignment_to_open_slot` reseta `attended` incondicionalmente** (migração `20260707000003`): mover uma asignación zera `attended/attended_at/attended_by` mesmo já resolvida. Com `UNIQUE(round_id, family_id)`, a ausência some do `getAbsentismoByRound`. Fix: decidir a semântica de produto (preservar registro da ausência num caminho de correção auditado vs "nova chance" que apaga) antes de codar.

Ambas são a **mesma questão de fundo**: mutar/apagar a assistência de um turno já finalizado. Tratar as três juntas.

## Contexto
Gap **pré-existente** de closeout, mais amplo que os 4 bugs de fundação corrigidos em `feat/reparto-turnos`. Deferido por decisão do PO para ser tratado como frente separada de closeout-integrity.
