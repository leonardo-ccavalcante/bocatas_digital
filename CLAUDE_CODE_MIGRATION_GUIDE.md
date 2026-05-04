# Guía Paso a Paso: Migración de Miembros - Para Claude Code

**Objetivo:** Ejecutar migración de datos, verificar tests y realizar QA del bug fix de miembros.

**Tiempo estimado:** 15-20 minutos

---

## FASE 1: EJECUTAR MIGRACIÓN EN SUPABASE (5 minutos)

### Paso 1.1: Acceder a Supabase Dashboard
1. Abre: https://supabase.com/dashboard
2. Selecciona el proyecto "bocatas-digital"
3. Ve a: SQL Editor (en la barra lateral izquierda)

### Paso 1.2: Ejecutar Migration SQL
1. En SQL Editor, haz clic en "New Query"
2. Copia TODO el contenido de este archivo:
   ```
   /home/ubuntu/bocatas-digital/supabase/migrations/20260505_migrate_miembros_to_table.sql
   ```
3. Pega en el SQL Editor
4. Haz clic en "Run" (botón azul)
5. **ESPERA** a que termine (debe decir "Success" o similar)

### Paso 1.3: Verificar que la migración fue exitosa
Ejecuta esta query de verificación en SQL Editor:
```sql
-- Verificar que se migraron datos
SELECT 
  f.id,
  f.familia_numero,
  COUNT(fm.id) as miembros_migrados,
  jsonb_array_length(COALESCE(f.miembros, '[]'::jsonb)) as miembros_json_original
FROM public.families f
LEFT JOIN public.familia_miembros fm ON f.id = fm.familia_id
GROUP BY f.id, f.familia_numero, f.miembros
ORDER BY f.familia_numero;
```

**Resultado esperado:**
- Debe mostrar familias con `miembros_migrados > 0`
- Ejemplo: Familia #3 debe mostrar 1 miembro migrado

---

## FASE 2: EJECUTAR TESTS (5 minutos)

### Paso 2.1: Ejecutar tests de migración
En terminal, desde `/home/ubuntu/bocatas-digital`:

```bash
pnpm test -- --run server/__tests__/members-migration.test.ts
```

**Resultado esperado:**
- ✅ 6/6 tests PASSING
- Debe mostrar: "PASS" y "6 passed"
- Si alguno falla, revisar error y reportar

### Paso 2.2: Ejecutar todos los tests de logging (verificar no hay regressions)
```bash
pnpm test -- --run server/__tests__/logger.test.ts server/__tests__/logging-middleware.test.ts server/__tests__/logging-router.test.ts
```

**Resultado esperado:**
- ✅ 41/41 tests PASSING
- Debe mostrar: "PASS" y "41 passed"

### Paso 2.3: Ejecutar suite completa de tests
```bash
pnpm test -- --run
```

**Resultado esperado:**
- ✅ Mínimo 827+ tests PASSING
- Máximo 10 tests FAILING (pre-existentes, no relacionados)
- Debe mostrar: "Test Files  X failed | 70 passed"

---

## FASE 3: QA MANUAL EN UI (5-10 minutos)

### Paso 3.1: Navegar a página de familias
1. Abre: https://3000-iq4w26tert7vusi3pbera-9f4ce7ac.us2.manus.computer/familias
2. Busca "Familia #3" (o la familia que tiene miembros migrados)
3. Haz clic para abrir detalles

### Paso 3.2: Verificar Dashboard (ANTES: mostraba 0, AHORA debe mostrar 1)
En la sección "Composición del hogar":
- ✅ Debe mostrar: "Total miembros: 1"
- ✅ Debe mostrar: "Adultos: 1" y "Menores: 0"

### Paso 3.3: Verificar Modal de Miembros
1. Haz clic en botón "Gestionar Miembros"
2. Se abre modal "Gestionar Miembros de la Familia"
3. **ANTES:** Mostraba "Miembros Actuales (0)" - "No hay miembros registrados"
4. **AHORA debe mostrar:**
   - ✅ "Miembros Actuales (1)"
   - ✅ Lista con nombre del miembro (ej: "AAA BBB")
   - ✅ Fecha de nacimiento (si existe)

### Paso 3.4: Verificar que agregar miembros sigue funcionando
1. En el modal, llena el formulario:
   - Nombre: "Test Member"
   - Rol: "Dependiente"
   - Relación: "Seleccionar relación"
   - Estado: "Activo"
   - Fecha de Nacimiento: (opcional)
2. Haz clic en "Agregar Miembro"
3. **Resultado esperado:**
   - ✅ Toast verde: "Miembro agregado exitosamente"
   - ✅ Modal se actualiza y muestra "Miembros Actuales (2)"
   - ✅ El nuevo miembro aparece en la lista

### Paso 3.5: Verificar que editar miembros funciona
1. En la lista de miembros, haz clic en el botón de editar (lápiz)
2. Cambia el nombre a "Test Member Updated"
3. Haz clic en "Actualizar"
4. **Resultado esperado:**
   - ✅ Toast verde: "Miembro actualizado"
   - ✅ La lista se actualiza con el nuevo nombre

### Paso 3.6: Verificar que eliminar miembros funciona
1. En la lista de miembros, haz clic en el botón de eliminar (basura)
2. Confirma la eliminación
3. **Resultado esperado:**
   - ✅ Toast verde: "Miembro eliminado"
   - ✅ El miembro desaparece de la lista
   - ✅ Contador se actualiza (ej: "Miembros Actuales (1)")

### Paso 3.7: Verificar que el dashboard se actualiza
1. Cierra el modal
2. Verifica que la sección "Composición del hogar" se actualiza automáticamente
3. **Resultado esperado:**
   - ✅ "Total miembros" se actualiza correctamente
   - ✅ Refleja los cambios que hiciste en el modal

---

## FASE 4: VERIFICAR LOGGING (2 minutos)

### Paso 4.1: Acceder al dashboard de logs
1. Navega a: https://3000-iq4w26tert7vusi3pbera-9f4ce7ac.us2.manus.computer/admin/logs
2. Debe mostrar página con tabla de logs

### Paso 4.2: Verificar que hay logs de las operaciones
1. Busca logs con:
   - Nivel: "info" o "error"
   - Mensaje contenga: "member" o "familia"
2. **Resultado esperado:**
   - ✅ Debe haber logs de las operaciones que hiciste (agregar, editar, eliminar miembros)
   - ✅ Cada log debe tener correlationId único
   - ✅ Debe mostrar duración de operación

### Paso 4.3: Probar filtros y export
1. Filtra por nivel "info"
2. Busca por "member"
3. Haz clic en "Exportar CSV"
4. **Resultado esperado:**
   - ✅ Filtros funcionan
   - ✅ CSV se descarga correctamente

---

## CHECKLIST FINAL

Marca cada item como completado:

### Migración
- [ ] Migration SQL ejecutada en Supabase
- [ ] Query de verificación muestra datos migrados
- [ ] Familia #3 muestra 1 miembro migrado

### Tests
- [ ] 6/6 tests de migración PASSING
- [ ] 41/41 tests de logging PASSING
- [ ] 827+ tests totales PASSING

### QA Manual
- [ ] Dashboard muestra "Total miembros: 1" ✅
- [ ] Modal muestra "Miembros Actuales (1)" ✅
- [ ] Lista de miembros se renderiza correctamente
- [ ] Agregar miembro funciona
- [ ] Editar miembro funciona
- [ ] Eliminar miembro funciona
- [ ] Dashboard se actualiza automáticamente
- [ ] Logs aparecen en admin dashboard
- [ ] Filtros de logs funcionan
- [ ] Export CSV funciona

---

## TROUBLESHOOTING

### Si la migración falla:
1. Verifica que el SQL es válido (no tiene errores de sintaxis)
2. Verifica que la tabla `familia_miembros` existe
3. Verifica que hay datos en `families.miembros`
4. Si sigue fallando, reporta el error exacto

### Si los tests fallan:
1. Ejecuta: `pnpm test -- --run members-migration.test.ts`
2. Lee el error detallado
3. Si es "table not found", la migración no se ejecutó correctamente
4. Si es "expected 0 to be 1", los datos no se migraron

### Si el modal no muestra miembros:
1. Verifica que la migración se ejecutó
2. Verifica que hay datos en `familia_miembros` tabla
3. Abre DevTools (F12) → Console
4. Busca errores en rojo
5. Si hay error, reporta el mensaje exacto

### Si el logging no funciona:
1. Verifica que `/admin/logs` es accesible
2. Verifica que eres admin (role: "admin")
3. Si no hay logs, verifica que las operaciones se ejecutaron

---

## RESULTADO ESPERADO FINAL

✅ **Bug FIXED:**
- Dashboard muestra: "Total miembros: 1"
- Modal muestra: "Miembros Actuales (1)"
- Ambos usan la misma fuente de verdad: tabla `familia_miembros`

✅ **Sistema ESCALABLE:**
- Miembros en tabla relacional (no JSON array)
- Operaciones CRUD funcionan correctamente
- Logging registra todas las operaciones
- Tests verifican que todo funciona

✅ **LISTO PARA PRODUCCIÓN**
