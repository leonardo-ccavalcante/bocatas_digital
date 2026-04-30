# Guía de Importación CSV con Familias y Miembros

## Descripción General

Esta guía explica cómo usar el sistema de importación CSV para cargar datos de familias y sus miembros con identificadores únicos (UUIDs) para garantizar que no haya confusiones en la asignación de datos.

## ¿Por Qué UUIDs?

Los UUIDs (identificadores únicos universales) son códigos especiales que identifican de forma única a cada familia y miembro. Esto es importante porque:

- **Previene confusiones**: Si dos familias tienen nombres similares, el UUID las distingue perfectamente
- **Auditoría**: Puedes rastrear cambios en familias y miembros específicos
- **Integridad de datos**: Garantiza que los miembros se asignen a la familia correcta
- **Sincronización**: Facilita sincronizar datos entre sistemas

## Estructura del CSV

### Encabezados Requeridos

```
familia_id,familia_numero,nombre_familia,contacto_principal,telefono,direccion,estado,fecha_creacion,miembros_count,docs_identidad,padron_recibido,justificante_recibido,consent_bocatas,consent_banco_alimentos,informe_social,informe_social_fecha,alta_en_guf,fecha_alta_guf,guf_verified_at,miembro_id,miembro_nombre,miembro_rol,miembro_relacion,miembro_fecha_nacimiento,miembro_estado
```

### Campos de Familia

| Campo | Tipo | Requerido | Descripción | Ejemplo |
|-------|------|-----------|-------------|---------|
| `familia_id` | UUID | Sí* | Identificador único de la familia | `d0000-0001` |
| `familia_numero` | Texto | Sí | Número de familia | `FAM-001` |
| `nombre_familia` | Texto | Sí | Nombre de la familia | `Garcia Lopez` |
| `contacto_principal` | Texto | Sí | Persona de contacto | `Juan Garcia` |
| `telefono` | Texto | No | Número de teléfono | `+34-123-456-789` |
| `direccion` | Texto | No | Dirección | `Calle Principal 1` |
| `estado` | Enum | No | Estado: `activo`, `inactivo`, `suspendido` | `activo` |
| `fecha_creacion` | Fecha | No | Fecha de creación (YYYY-MM-DD) | `2026-01-15` |
| `miembros_count` | Número | No | Cantidad de miembros | `2` |
| `docs_identidad` | Booleano | No | Documentos de identidad: `true`, `false` | `true` |
| `padron_recibido` | Booleano | No | Padrón recibido: `true`, `false` | `true` |
| `justificante_recibido` | Booleano | No | Justificante recibido: `true`, `false` | `true` |
| `consent_bocatas` | Booleano | No | Consentimiento Bocatas: `true`, `false` | `true` |
| `consent_banco_alimentos` | Booleano | No | Consentimiento Banco de Alimentos: `true`, `false` | `true` |
| `informe_social` | Booleano | No | Informe social: `true`, `false` | `true` |
| `informe_social_fecha` | Fecha | No | Fecha del informe social (YYYY-MM-DD) | `2025-12-15` |
| `alta_en_guf` | Booleano | No | Alta en GUF: `true`, `false` | `true` |
| `fecha_alta_guf` | Fecha | No | Fecha de alta en GUF (YYYY-MM-DD) | `2026-01-10` |
| `guf_verified_at` | Fecha | No | Fecha de verificación GUF (YYYY-MM-DD) | `2026-04-10` |

### Campos de Miembro

| Campo | Tipo | Requerido | Descripción | Ejemplo |
|-------|------|-----------|-------------|---------|
| `miembro_id` | UUID | Sí* | Identificador único del miembro | `m0001-0001` |
| `miembro_nombre` | Texto | Sí | Nombre del miembro | `Maria Garcia Lopez` |
| `miembro_rol` | Enum | Sí | Rol: `head_of_household`, `dependent`, `other` | `head_of_household` |
| `miembro_relacion` | Enum | No | Relación: `parent`, `child`, `sibling`, `spouse`, `other` | `titular` |
| `miembro_fecha_nacimiento` | Fecha | No | Fecha de nacimiento (YYYY-MM-DD) | `1980-05-15` |
| `miembro_estado` | Enum | No | Estado: `activo`, `inactivo` | `activo` |

*Los campos `familia_id` y `miembro_id` son opcionales si usas `familia_numero` y `miembro_nombre`, pero se recomienda incluirlos para mayor confiabilidad.

## Ejemplo de CSV

```csv
familia_id,familia_numero,nombre_familia,contacto_principal,telefono,direccion,estado,fecha_creacion,miembros_count,docs_identidad,padron_recibido,justificante_recibido,consent_bocatas,consent_banco_alimentos,informe_social,informe_social_fecha,alta_en_guf,fecha_alta_guf,guf_verified_at,miembro_id,miembro_nombre,miembro_rol,miembro_relacion,miembro_fecha_nacimiento,miembro_estado
d0000-0001,FAM-001,Garcia Lopez,Juan Garcia,+34-123-456-789,Calle Principal 1,activo,2026-01-15,2,true,true,true,true,true,true,2025-12-15,true,2026-01-10,2026-04-10,m0001-0001,Maria Garcia Lopez,head_of_household,titular,1980-05-15,activo
d0000-0001,FAM-001,Garcia Lopez,Juan Garcia,+34-123-456-789,Calle Principal 1,activo,2026-01-15,2,true,true,true,true,true,true,2025-12-15,true,2026-01-10,2026-04-10,m0001-0002,Juan Garcia Lopez Jr,dependent,hijo,2010-03-20,activo
d0000-0002,FAM-002,Rodriguez Martinez,Carlos Rodriguez,+34-987-654-321,Calle Secundaria 2,activo,2026-02-01,1,false,false,false,false,false,false,,false,,,,m0002-0001,Carlos Rodriguez Martinez,head_of_household,titular,1975-12-08,activo
```

## Reglas Importantes

### 1. Cada Fila Representa un Miembro
- La primera fila de una familia incluye todos los datos de la familia
- Las filas siguientes de la misma familia repiten los datos de la familia pero con diferentes miembros
- Si una familia no tiene miembros, los campos de miembro están vacíos

### 2. UUIDs Deben Ser Únicos
- No puede haber dos familias con el mismo `familia_id`
- No puede haber dos miembros con el mismo `miembro_id`
- El sistema rechazará el CSV si detecta duplicados

### 3. Formato de Fechas
- Todas las fechas deben estar en formato ISO 8601: `YYYY-MM-DD`
- Ejemplos válidos: `2026-01-15`, `2025-12-31`
- Ejemplos inválidos: `15/01/2026`, `01-15-2026`

### 4. Valores Booleanos
- Acepta: `true`, `false`, `1`, `0`, `yes`, `no`
- Ejemplo: `true` o `false`

### 5. Campos Vacíos
- Los campos opcionales pueden estar vacíos
- Ejemplo: `,,,` (comas sin valor)

## Proceso de Importación

### Paso 1: Preparar el CSV
1. Descarga la plantilla desde el botón "Descargar Plantilla"
2. Completa los datos de familias y miembros
3. Asegúrate de que los UUIDs sean únicos
4. Guarda el archivo en formato CSV

### Paso 2: Validar el CSV
1. Haz clic en "Importar CSV"
2. Selecciona tu archivo
3. Haz clic en "Validar CSV"
4. Revisa los errores y advertencias
5. Corrige los problemas si es necesario

### Paso 3: Seleccionar Estrategia de Fusión
El sistema ofrece tres estrategias:

| Estrategia | Comportamiento |
|-----------|----------------|
| **Overwrite** | Reemplaza completamente los datos existentes |
| **Merge** (Predeterminado) | Actualiza solo campos vacíos, preserva datos existentes |
| **Skip** | Salta familias/miembros que ya existen |

### Paso 4: Importar
1. Selecciona la estrategia de fusión
2. Haz clic en "Importar"
3. Espera a que se complete la importación
4. Revisa el resumen de resultados

## Validación del Sistema

El sistema valida automáticamente:

✅ **Formato UUID**: Los UUIDs deben ser válidos (formato v4)
✅ **Duplicados**: No permite familias o miembros duplicados en el CSV
✅ **Campos Requeridos**: Verifica que los campos obligatorios no estén vacíos
✅ **Enumeraciones**: Valida que los valores de enum sean válidos
✅ **Fechas**: Verifica que las fechas estén en formato correcto
✅ **Relaciones**: Asegura que cada miembro esté vinculado a una familia

## Errores Comunes

### Error: "Invalid familia_id format"
- **Causa**: El UUID no es válido
- **Solución**: Usa un UUID válido en formato v4 (ej: `d0000-0001`)

### Error: "Duplicate familia_id"
- **Causa**: Hay dos familias con el mismo UUID
- **Solución**: Asegúrate de que cada familia tenga un UUID único

### Error: "Missing required field"
- **Causa**: Falta un campo obligatorio
- **Solución**: Completa todos los campos requeridos

### Error: "Invalid date format"
- **Causa**: La fecha no está en formato YYYY-MM-DD
- **Solución**: Usa el formato correcto (ej: `2026-01-15`)

### Error: "Invalid estado value"
- **Causa**: El valor de estado no es válido
- **Solución**: Usa uno de: `activo`, `inactivo`, `suspendido`

## Consejos

1. **Usa UUIDs consistentes**: Si exportas y luego importas, usa los mismos UUIDs
2. **Valida primero**: Siempre valida el CSV antes de importar
3. **Haz backup**: Guarda una copia de tu CSV antes de importar
4. **Revisa el resumen**: Después de importar, revisa el resumen de resultados
5. **Prueba con pocos datos**: Prueba primero con una familia pequeña

## Soporte

Si tienes problemas:
1. Revisa los errores mostrados en la validación
2. Consulta esta guía
3. Descarga la plantilla y compara tu formato
4. Contacta al equipo de soporte

---

**Última actualización**: 2026-04-18
**Versión**: 2.0 (Con soporte para UUIDs de familias y miembros)
