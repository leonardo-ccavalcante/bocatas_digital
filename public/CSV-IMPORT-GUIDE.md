# Guía de Importación CSV - Programa de Familias

## Descripción General

El sistema permite importar familias con sus miembros mediante un archivo CSV. Cada fila representa un miembro de una familia, y se agrupan automáticamente por `familia_numero`.

## Campos Requeridos

| Campo | Tipo | Descripción | Ejemplo | Requerido |
|-------|------|-------------|---------|-----------|
| `familia_numero` | Número | Identificador único de la familia | 1, 2, 3 | ✅ Sí |
| `miembro_nombre` | Texto | Nombre completo del miembro | Maria Garcia Lopez | ✅ Sí |
| `miembro_rol` | Texto | Rol del miembro en la familia | head_of_household, dependent | ✅ Sí |
| `miembro_relacion` | Texto | Relación con el jefe de hogar | titular, hijo, hija, esposa, esposo | ✅ Sí |
| `miembro_fecha_nacimiento` | Fecha | Fecha de nacimiento (YYYY-MM-DD) | 1980-05-15 | ❌ No |

## Campos de Familia

| Campo | Tipo | Descripción | Valores Válidos | Por Defecto |
|-------|------|-------------|-----------------|-------------|
| `familia_estado` | Texto | Estado de la familia | activa, baja | activa |
| `docs_identidad` | Booleano | ¿Tiene documentación de identidad? | true, false | false |
| `padron_recibido` | Booleano | ¿Recibió padrón? | true, false | false |
| `justificante_recibido` | Booleano | ¿Recibió justificante? | true, false | false |
| `consent_bocatas` | Booleano | ¿Consiente participar en Bocatas? | true, false | false |
| `consent_banco_alimentos` | Booleano | ¿Consiente participar en Banco de Alimentos? | true, false | false |
| `informe_social` | Booleano | ¿Tiene informe social? | true, false | false |
| `informe_social_fecha` | Fecha | Fecha del informe social (YYYY-MM-DD) | 2026-04-01 | (vacío) |
| `alta_en_guf` | Booleano | ¿Está dado de alta en GUF? | true, false | false |
| `fecha_alta_guf` | Fecha | Fecha de alta en GUF (YYYY-MM-DD) | 2026-04-01 | (vacío) |

## Valores Válidos para Roles

- `head_of_household` - Jefe de hogar
- `dependent` - Dependiente

## Valores Válidos para Relaciones

- `titular` - Titular/Jefe de hogar
- `hijo` - Hijo
- `hija` - Hija
- `esposa` - Esposa
- `esposo` - Esposo
- `otro` - Otro

## Formato de Fechas

Todas las fechas deben estar en formato **YYYY-MM-DD**:
- ✅ Correcto: `1980-05-15`, `2026-04-01`
- ❌ Incorrecto: `05/15/1980`, `15-05-1980`, `2026-4-1`

## Formato de Booleanos

- `true` para sí/verdadero
- `false` para no/falso
- Dejar vacío es equivalente a `false`

## Ejemplo de CSV Válido

```csv
familia_numero,miembro_nombre,miembro_rol,miembro_relacion,miembro_fecha_nacimiento,familia_estado,docs_identidad,padron_recibido,justificante_recibido,consent_bocatas,consent_banco_alimentos,informe_social,informe_social_fecha,alta_en_guf,fecha_alta_guf
1,Maria Garcia Lopez,head_of_household,titular,1980-05-15,activa,true,true,false,true,true,true,2026-04-01,true,2026-04-01
1,Juan Garcia Lopez,dependent,hijo,2010-03-20,activa,true,true,false,true,true,true,2026-04-01,true,2026-04-01
2,Carlos Rodriguez,head_of_household,titular,1975-12-08,activa,true,false,true,true,false,false,,false,
```

## Reglas de Validación

1. **Familia número requerido**: Cada fila debe tener un `familia_numero` válido
2. **Nombre requerido**: Cada miembro debe tener un nombre
3. **Rol requerido**: El rol debe ser `head_of_household` o `dependent`
4. **Relación requerida**: La relación debe ser una de las válidas
5. **Formato de fecha**: Las fechas deben estar en YYYY-MM-DD o estar vacías
6. **Duplicados**: No se permiten dos miembros idénticos en la misma familia
7. **Booleanos**: Solo `true` o `false` (sin comillas)

## Estrategias de Merge

Al importar, puedes elegir cómo manejar familias existentes:

- **Overwrite**: Reemplaza completamente la familia existente
- **Merge** (por defecto): Actualiza solo los campos proporcionados, mantiene el resto
- **Skip**: Ignora familias que ya existen

## Errores Comunes

### ❌ Error: "Invalid date format"
**Causa**: Fecha en formato incorrecto
**Solución**: Usa YYYY-MM-DD (ej: 2026-04-01)

### ❌ Error: "Invalid role"
**Causa**: Rol no válido
**Solución**: Usa `head_of_household` o `dependent`

### ❌ Error: "Duplicate member in family"
**Causa**: Mismo miembro aparece dos veces
**Solución**: Revisa que no haya duplicados en el CSV

### ❌ Error: "Missing required field"
**Causa**: Falta un campo obligatorio
**Solución**: Verifica que todos los campos requeridos tengan valores

## Descargar Plantilla

Puedes descargar una plantilla CSV de ejemplo desde el botón "Exportar CSV" en la página de Familias.

## Soporte

Si encuentras errores durante la importación, el sistema te mostrará:
- Número de línea del error
- Descripción del problema
- Sugerencia para corregirlo

Corrige los errores en tu CSV y vuelve a intentar.
