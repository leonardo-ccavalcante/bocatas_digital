# Plan de Implementación: Fix de Bugs en /personas

**Fecha**: 14 de junio de 2026  
**Autor**: Manus AI  
**Objetivo**: Corregir dos bugs críticos en `/personas`: (1) click en persona equivocada al hacer scroll, (2) rendimiento lento al abrir una persona.

---

## Análisis de Raíces (Root Cause Analysis)

### Bug 1: Click en Persona Equivocada al Hacer Scroll

**Síntoma**: Usuario hace scroll en `/personas`, ve "Albelis Irey" en la lista, hace click, pero se abre la ficha de otra persona.

**Causa Raíz**: El componente `Personas.tsx` usa el **índice del array** (`i`) como identificador de la persona activa:

```tsx
// Línea 241 en Personas.tsx
{filteredRows.map((p, i) => (
  <PersonRowDesktop
    key={p.id}
    person={p}
    active={activeIdx === i}  // ← BUG: activeIdx es un índice, no un ID
    onMouseEnter={() => setActiveIdx(i)}
  />
))}
```

**Problema**: Cuando el usuario hace scroll y la lista se re-renderiza (por cambio de filtro, sort, o refetch de datos), el índice `i` puede cambiar para la misma persona. Ejemplo:

1. Usuario hace scroll, ve "Albelis Irey" en índice 5
2. Usuario hace click en "Albelis Irey" → `setActiveIdx(5)`
3. Antes de que se complete la navegación, `filteredRows` se re-ordena (por ejemplo, por `staleTime` expirado y refetch)
4. "Albelis Irey" ahora está en índice 3, pero `activeIdx` sigue siendo 5
5. El índice 5 ahora apunta a otra persona → se abre la ficha equivocada

**Solución**: Usar `person.id` como identificador en lugar del índice.

---

### Bug 2: Rendimiento Lento al Abrir Persona

**Síntoma**: Cuando el usuario hace click en una persona en `/personas` y navega a `/personas/:id`, la página tarda varios segundos en cargar.

**Causa Raíz**: El componente `PersonaDetalle.tsx` dispara múltiples queries **eagerly** (sin lazy loading) al montar:

1. `persons.getById` — obtiene los datos de la persona
2. `consentTemplates.getAll` — obtiene todas las plantillas de consentimiento
3. Posiblemente más en tabs (enrollments, documentos, notas)

Todas se cargan en paralelo sin lazy loading, causando un **waterfall de requests** que se completa solo cuando la más lenta termina.

**Solución**: 
- Lazy load los tabs (no cargar todos al montar)
- Prefetch solo `persons.getById` en mount
- Cargar `consentTemplates.getAll` solo cuando se abre el tab de consentimientos

---

## Cambios Requeridos

### 1. Fix de Bug 1: Usar `person.id` en lugar de índice

**Archivos afectados**: `client/src/pages/Personas.tsx`

**Cambios**:
- Cambiar `activeIdx` de `number` a `string | null` (para almacenar `person.id`)
- Actualizar `setActiveIdx()` para pasar `person.id` en lugar del índice
- Actualizar la condición `active={activeIdx === i}` a `active={activeIdx === p.id}`

**Impacto**: Bajo. Solo cambia el estado interno de `Personas.tsx`, sin cambios en la API o en otros componentes.

---

### 2. Fix de Bug 2: Lazy Load Tabs en PersonaDetalle

**Archivos afectados**: 
- `client/src/pages/PersonaDetalle.tsx` — agregar lazy loading de tabs
- `client/src/features/persons/components/EnrollmentPanel.tsx` — agregar `enabled: activeTab === "enrollments"`
- `client/src/features/persons/components/DocumentosTab.tsx` — agregar `enabled: activeTab === "documentos"`
- `client/src/features/persons/components/NotasTab.tsx` — agregar `enabled: activeTab === "notas"`

**Cambios**:
- Agregar estado `activeTab` en `PersonaDetalle.tsx`
- Pasar `activeTab` a cada tab component
- En cada tab, agregar `enabled: activeTab === "tab-name"` a las queries

**Impacto**: Bajo-Medio. Solo afecta el loading de datos, sin cambios en la UI o UX.

---

## Métricas de Éxito

| Métrica | Antes | Después | Criterio |
|---------|-------|---------|----------|
| Click en persona correcta | ~70% | 100% | Ningún click incorrecto en 50 intentos |
| Tiempo de carga de `/personas/:id` | 3-5s | <1s | Medido con DevTools Network |
| Queries al abrir `/personas/:id` | 3+ paralelas | 1 en mount + lazy | Verificado en Network log |

---

## Plan de Implementación

### Fase 1: Escribir Tests (TDD)

1. Test para Bug 1: Verificar que el click abre la persona correcta después de re-ordenamiento
2. Test para Bug 2: Verificar que los tabs no disparan queries hasta que se abren

### Fase 2: Implementar Fixes

1. Fix Bug 1 en `Personas.tsx`
2. Fix Bug 2 en `PersonaDetalle.tsx` y tabs

### Fase 3: Code Review

1. Revisar cambios con `/requesting-code-review`
2. Aplicar feedback con `/receiving-code-review`

### Fase 4: QA en Browser

1. Verificar que el click abre la persona correcta
2. Verificar que el loading es rápido
3. Verificar que no hay regresiones en otros flows

### Fase 5: Checkpoint + Push

1. Guardar checkpoint en Manus
2. Push a GitHub

---

## Referencias

- **Karpathy Guidelines**: Enfoque en root causes, soluciones quirúrgicas, no patches
- **Systematic Debugging**: Análisis de síntomas → causa raíz → solución verificada
- **TDD**: Test → Implement → Pass
