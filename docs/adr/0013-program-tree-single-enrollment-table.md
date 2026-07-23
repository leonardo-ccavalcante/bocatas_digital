# ADR-0013 — Programs form a tree (`parent_id`) with ONE enrollment table for every level

- **Status:** Accepted (2026-07-23, Leo)
- **Deciders:** Leo (Product/Tech Lead)
- **Context source:** Grill session over 10 stakeholder transcripts (Nacho, Espe, Catalá, Sole, David, Revision MVP) + the Notion export. Screen-level mockup approved by Leo before build.

## Context

Bocatas runs programs that contain other programs: Formación holds courses, courses run in
editions/promociones ("Cocina Enero 2026"), Comedor runs continuously, street food distribution
(Cañada Real, Ópera) is per-point with anonymous counts. Notion models this with workarounds that
are the operation's main pain: duplicated monthly databases ("26/1 Comedor"), separate waiting-list
pages ("2026/01 ESP L.Espera"), ~40 per-person state columns, and dead fields ("NO USAR Programa").
The app's `programs` table was a flat catalog; the `courses` table (the one cohort concept) had been
dropped; check-in validated `programa` against a hardcoded 6-slug enum, so a program created through
the admin UI could never take attendance.

Alternatives considered: (a) two fixed levels with typed tables (Programa + Participación — the
Notion model transposed: two state machines to keep coherent, a third level doesn't fit);
(b) multi-parent DAG for shared sub-programs like Español (rollups/permissions/navigation stop
being tree-simple); (c) free tree + single enrollment table. Leo chose (c) after an
assumptions-check on its risks.

## Decision

- **`programs` is self-referential**: `parent_id uuid NULL → programs(id)` (ON DELETE RESTRICT), a
  DB trigger rejects cycles, and the UI caps depth at 3 levels. Every node IS a program — an
  "edición" is just a program whose parent is a course.
- **`tipo` is a preset, not a schema**: `contenedor | curso | edicion | continuo | actividad |
  basico` pre-fills `inscribible`, enabled states and type-specific `config` fields at creation.
  One generic mechanism; no per-type tables.
- **ONE enrollment table for every level** (`program_enrollments`, unchanged key
  `(person_id, program_id)` per ADR-0007). Enrolling in a child does NOT write to the parent;
  umbrella reports aggregate the subtree with `COUNT(DISTINCT person_id)`
  (`get_programs_with_counts`).
- **States live on the enrollment, from ONE global catalog** (`shared/programEstados.ts`):
  inscrito, preseleccionado, admitido, lista_espera, activo, pausado, baja, terminado. Each program
  enables a subset (`estados_habilitados`). `baja` always requires a motivo. Transitions are logged
  append-only in `enrollment_events` (actor as TEXT per ADR-0011).
- **Notion's workaround entities are NOT nodes**: monthly lists are derived queries
  (actives-in-month + attendances), waiting lists are `estado='lista_espera'`, "¿2ª vez?" is derived
  from `enrollment_events`. Shared sub-programs (Español in three contexts) are separate nodes
  linked by an `etiquetas` label for transversal reporting — no multi-parent.
- **Absence rules alert, never act**: thresholds may flag ("N faltas"), a human executes the baja.

## Consequences

- **+** The check-in slug enum is deleted; `attendances.programa`'s FK to `programs.slug` is the
  only existence check — programs created in the UI take attendance from day one.
- **+** One mechanism covers Comedor (2 levels), cursos (3 levels) and calle (activity nodes);
  funder reports ("cuánta gente pasó por Formación") come from one recursive RPC without
  double-counting.
- **+** Historical truth survives month roll-overs: nothing is created or deleted monthly.
- **−** Parent/child state coherence is app-enforced (UI prompts on cascada), not a DB constraint —
  a person can be `baja` in a parent and `activo` in a child until staff resolves it.
- **−** `estado_enrollment` keeps legacy values (`completado`≡`terminado`, `rechazado`) for old
  rows; reports must fold them.
- Familias (`programa_familias`) keeps its special-cased subsystem unchanged; it simply remains a
  root node of the tree.
