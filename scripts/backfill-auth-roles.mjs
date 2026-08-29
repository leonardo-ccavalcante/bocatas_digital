#!/usr/bin/env node
/**
 * backfill-auth-roles.mjs — copia rol y nombre de `public.app_users` a
 * `auth.users` (app_metadata.role / user_metadata.nombre), que es de donde el
 * servidor los leerá tras #144.
 *
 * ⚠️ ESTO CONCEDE PRIVILEGIOS REALES YA, ANTES DE DESPLEGAR
 * ---------------------------------------------------------
 * Una versión anterior de este fichero afirmaba que escribir `app_metadata` era
 * "puramente aditivo" y no cambiaba nada hasta el despliegue. **Es falso.**
 * `app_metadata` viaja dentro del access token, y toda la capa RLS lo lee:
 *
 *   get_user_role() = COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', 'beneficiario')
 *   (supabase/migrations/20260411082006_20260410121100_create_rls_helpers.sql:6-9)
 *
 * Esa función gobierna políticas en 45 ficheros de migración — persons,
 * attendances, consents, familia_miembros, deliveries y cinco buckets de
 * Storage. Y el cliente del navegador mantiene una sesión de usuario real
 * (`client/src/lib/supabase/client.ts:20`, `persistSession: true`) con la que
 * sube ficheros directamente a Storage.
 *
 * Consecuencia: en cuanto el token de una persona se refresca (automático,
 * dentro de la hora, sin volver a entrar), su nuevo rol **ya cuenta** en RLS y
 * en Storage. La fase 1 no es un ensayo: concede acceso de verdad.
 *
 * Tampoco es aditivo en una sola dirección: escribir `role='user'` sustituye el
 * valor por defecto `'beneficiario'` por uno que no casa con ninguna política,
 * de modo que esa persona PIERDE lecturas que hoy tiene. El script lo avisa.
 *
 * POR QUÉ AUN ASÍ ES EL ORDEN CORRECTO
 * ------------------------------------
 *   Fase 1 (este script) → la gente tiene su rol donde RLS y el servidor nuevo lo buscan
 *   Fase 2 (desplegar #144) → nadie se queda fuera en el corte
 *
 * Al revés —desplegar primero— deja sin acceso a todo el que solo esté en
 * `app_users`. Lo que cambia respecto a la versión anterior de este documento no
 * es el orden, sino que la fase 1 hay que tratarla como un cambio de permisos en
 * producción, no como un paso preparatorio inocuo.
 *
 * REVOCADOS: el script los detecta, no los adivina
 * -----------------------------------------------
 * `revokeStaffAccess` escribe `app_metadata.role = null`. Eso es distinguible de
 * "nunca tuvo rol" (clave ausente), así que el script NO los confunde: los marca
 * `REVOCADO` y **no los rellena** salvo `--incluir-revocados`. Así la afirmación
 * "no se ha revocado a nadie" se comprueba con los datos en vez de asumirse.
 *
 *   - por defecto NO escribe nada: imprime la tabla de revisión y sale;
 *   - `--apply` exige además `--yes`;
 *   - `--exclude <uuid>` (repetible) deja fuera a alguien; se valida y se avisa
 *     si no casa con ninguna fila.
 *
 * USO
 *   node scripts/backfill-auth-roles.mjs                    # revisión (dry-run)
 *   node scripts/backfill-auth-roles.mjs --apply --yes      # escribe
 *   node scripts/backfill-auth-roles.mjs --exclude <uuid> --apply --yes
 *   node scripts/backfill-auth-roles.mjs --verify           # comprobar el estado
 *
 * Idempotente: ejecutarlo dos veces no cambia nada la segunda vez.
 *
 * ENTORNO (los mismos que usa el servidor; ver docs/dev-setup.md)
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * NOTA: imprime emails porque son lo que permite a una persona identificar a
 * quién está autorizando. Es salida de una herramienta de operación para un
 * humano, no logging de aplicación — no la pegues en un issue público.
 */
import { createClient } from "@supabase/supabase-js";

const VALID_ROLES = ["user", "admin", "superadmin", "voluntario", "beneficiario"];
/** Roles que NO casan con ninguna política RLS: escribirlos quita lecturas. */
const ROLES_SIN_POLITICA_RLS = ["user"];
const PER_PAGE = 200;

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const APPLY = has("--apply");
const VERIFY_ONLY = has("--verify");
const INCLUDE_REVOKED = has("--incluir-revocados");

// `--exclude <uuid>`: toma el token siguiente. Se normaliza a minúsculas porque
// los ids de GoTrue lo son y un pegado en mayúsculas no casaría nunca — fallando
// en abierto, que es la peor dirección para un control de seguridad.
const excludeRaw = args.flatMap((a, i) => (a === "--exclude" ? [args[i + 1]] : []));
const EXCLUDED = new Set(
  excludeRaw.filter((v) => typeof v === "string" && !v.startsWith("--")).map((v) => v.toLowerCase())
);
const badExcludes = excludeRaw.filter(
  (v) => typeof v !== "string" || v.startsWith("--")
);

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!url || !key) {
  console.error("Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
if (APPLY && !has("--yes")) {
  console.error("`--apply` requiere `--yes`. Ejecuta primero sin flags y revisa la lista.");
  process.exit(1);
}
if (badExcludes.length) {
  console.error(
    `\`--exclude\` sin valor válido (${badExcludes.length}). Usa \`--exclude <uuid>\`, ` +
      "no `--exclude=<uuid>` ni `--exclude` al final."
  );
  process.exit(1);
}

const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/**
 * Todas las cuentas de auth. Se pagina hasta que una página vuelve vacía, no
 * hasta que vuelve corta: si el despliegue tiene GOTRUE_MAX_ROWS por debajo de
 * PER_PAGE, la primera página ya llega corta y una condición `< PER_PAGE`
 * truncaría el censo en silencio.
 */
async function fetchAuthUsers() {
  const all = [];
  for (let page = 1; page <= 100; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: PER_PAGE });
    if (error) throw new Error(`listUsers: ${error.message}`);
    const users = data.users ?? [];
    if (users.length === 0) return all;
    all.push(...users);
  }
  throw new Error("listUsers: más de 100 páginas; revisa la paginación antes de seguir.");
}

/** app_users, si existe. Si no (local/CI), devolvemos null en vez de reventar. */
async function fetchAppUsers() {
  const { data, error } = await db.from("app_users").select("id, role, name");
  if (error) {
    if (/does not exist|schema cache|relation/i.test(error.message)) return null;
    throw new Error(`app_users: ${error.message}`);
  }
  return data ?? [];
}

const nameOf = (u) => u.user_metadata?.nombre ?? u.user_metadata?.name ?? null;

function classify(authUser, appRow) {
  const meta = authUser.app_metadata ?? {};
  const authRole = meta.role;
  const hasValidAuthRole = typeof authRole === "string" && VALID_ROLES.includes(authRole);
  // La distinción que evita re-conceder acceso retirado a propósito:
  // `revokeStaffAccess` escribe la clave con valor null; "nunca tuvo rol" no
  // tiene la clave en absoluto.
  const revoked = !hasValidAuthRole && "role" in meta && meta.role === null;
  const canFill = !!appRow?.role && VALID_ROLES.includes(appRow.role);
  const needsRole = !hasValidAuthRole && canFill && (!revoked || INCLUDE_REVOKED);
  const needsName = !nameOf(authUser) && !!appRow?.name;

  let status;
  if (hasValidAuthRole) status = "OK";
  else if (revoked) status = INCLUDE_REVOKED ? "REVOCADO → RELLENAR" : "REVOCADO (no se toca)";
  else if (needsRole) status = "RELLENAR";
  else if (appRow) status = "SIN ROL EN NINGUN SITIO";
  else status = "SIN FILA (hoy ya no entra)";

  return { hasValidAuthRole, revoked, needsRole, needsName, status };
}

function table(rows) {
  const w = (s, n) => String(s ?? "").slice(0, n).padEnd(n);
  console.log(
    w("id", 38) + w("estado", 24) + w("email", 30) + w("auth", 13) + w("app_users", 13) + "nombre"
  );
  console.log("-".repeat(132));
  for (const r of rows) {
    console.log(
      w(r.id, 38) +
        w(r.status, 24) +
        w(r.email, 30) +
        w(r.authRole ?? "—", 13) +
        w(r.appRole ?? "—", 13) +
        (r.needsName ? `rellenar: ${r.appName}` : nameOf(r.authUser) ? "ok" : "—")
    );
  }
}

/** Superadmins que quedarían, leído de la fuente de verdad (no predicho). */
function countSuperadmins(users) {
  return users.filter((u) => u.app_metadata?.role === "superadmin").length;
}

async function main() {
  const [authUsers, appUsers] = await Promise.all([fetchAuthUsers(), fetchAppUsers()]);

  if (appUsers === null) {
    console.log("`public.app_users` no existe aquí (esperado en local/CI). Nada que hacer.");
    return;
  }

  const byId = new Map(appUsers.map((r) => [String(r.id).toLowerCase(), r]));
  const rows = authUsers.map((u) => {
    const appRow = byId.get(String(u.id).toLowerCase());
    return {
      id: u.id,
      email: u.email ?? "(sin email)",
      authRole: u.app_metadata?.role ?? null,
      appRole: appRow?.role ?? null,
      appName: appRow?.name ?? null,
      authUser: u,
      ...classify(u, appRow),
    };
  });

  rows.sort((a, b) => a.status.localeCompare(b.status) || a.email.localeCompare(b.email));
  table(rows);

  const isExcluded = (r) => EXCLUDED.has(String(r.id).toLowerCase());
  const pending = rows.filter((r) => (r.needsRole || r.needsName) && !isExcluded(r));
  const skipped = rows.filter((r) => (r.needsRole || r.needsName) && isExcluded(r));
  const revoked = rows.filter((r) => r.revoked);
  const losesRls = pending.filter((r) => ROLES_SIN_POLITICA_RLS.includes(r.appRole));

  // Deriva inversa: filas de app_users sin cuenta de auth. Antes eran invisibles.
  const authIds = new Set(authUsers.map((u) => String(u.id).toLowerCase()));
  const orphanAppUsers = appUsers.filter((r) => !authIds.has(String(r.id).toLowerCase()));

  console.log("");
  console.log(`total cuentas auth : ${rows.length}`);
  console.log(`filas en app_users : ${appUsers.length}`);
  console.log(`ya correctas       : ${rows.filter((r) => r.hasValidAuthRole).length}`);
  console.log(`a rellenar         : ${pending.length}`);
  if (skipped.length) console.log(`excluidas          : ${skipped.length}`);
  if (revoked.length) {
    console.log(
      `REVOCADAS          : ${revoked.length}` +
        (INCLUDE_REVOKED ? " (se rellenarán: --incluir-revocados)" : " (NO se tocan)")
    );
  }
  if (orphanAppUsers.length) {
    console.log(`app_users sin cuenta auth: ${orphanAppUsers.length} (no entran hoy ni tras el corte)`);
  }

  // `--exclude` que no casó con nadie: fallar en abierto aquí sería creer que
  // alguien quedó fuera cuando en realidad se le va a conceder acceso.
  const matched = new Set(skipped.map((r) => String(r.id).toLowerCase()));
  const unmatched = [...EXCLUDED].filter((id) => !matched.has(id));
  if (unmatched.length) {
    console.error(
      `\n⛔ ${unmatched.length} \`--exclude\` no casó con ninguna fila pendiente:\n` +
        unmatched.map((id) => `   ${id}`).join("\n") +
        "\n   Copia el id de la columna `id` de la tabla de arriba."
    );
    process.exit(1);
  }

  if (losesRls.length) {
    console.log(
      `\n⚠️  ${losesRls.length} recibirían rol '${ROLES_SIN_POLITICA_RLS.join("/")}', que no casa con\n` +
        "    ninguna política RLS: sustituye el valor por defecto 'beneficiario' y les QUITA\n" +
        "    lecturas que hoy tienen. Excluye a quien no deba perderlas."
    );
  }

  const superadminsAhora = countSuperadmins(authUsers);
  const superadminsPrevistos =
    superadminsAhora + pending.filter((r) => r.appRole === "superadmin").length;
  console.log(`superadmins ahora / previstos: ${superadminsAhora} / ${superadminsPrevistos}`);
  if (superadminsPrevistos === 0) {
    console.error(
      "\n⛔ Quedarían CERO superadmins. Conceder ese rol requiere ser superadmin\n" +
        "   (admin.setUserRole es superadmin-only) y createStaffUser solo concede\n" +
        "   admin|voluntario: no habría recuperación desde dentro de la aplicación.\n" +
        "   Resuélvelo antes de continuar."
    );
    process.exit(1);
  }

  if (VERIFY_ONLY) {
    console.log(pending.length === 0 ? "\nVERIFY OK: nada pendiente." : "\nVERIFY: quedan pendientes.");
    process.exit(pending.length === 0 ? 0 : 1);
  }

  if (!APPLY) {
    console.log(
      "\nDRY-RUN: no se ha escrito nada.\n" +
        "    Recuerda que aplicar concede privilegios RLS/Storage REALES en cuanto el token\n" +
        "    de cada persona se refresque — no espera al despliegue. Revisa la lista y usa\n" +
        "    `--exclude <uuid>` (columna `id`) antes de `--apply --yes`."
    );
    return;
  }

  let ok = 0;
  const failed = [];
  for (const r of pending) {
    const patch = {};
    if (r.needsRole) patch.app_metadata = { role: r.appRole };
    if (r.needsName) patch.user_metadata = { nombre: r.appName };

    const { error } = await db.auth.admin.updateUserById(r.id, patch);
    if (error) {
      console.error(`  ✗ ${r.email}: ${error.message}`);
      failed.push(r);
      continue;
    }
    console.log(
      `  ✓ ${r.email}` + (r.needsRole ? ` rol=${r.appRole}` : "") + (r.needsName ? " +nombre" : "")
    );
    ok++;
  }

  console.log(`\nActualizadas ${ok}/${pending.length}.`);

  // Re-lectura: el recuento de arriba era una PREDICCIÓN hecha antes de escribir,
  // y el bucle se salta los fallos. Con una escritura fallida se podía anunciar
  // "1 superadmin" y acabar con cero. Esto lo comprueba contra la base.
  const after = countSuperadmins(await fetchAuthUsers());
  console.log(`superadmins reales tras escribir: ${after}`);
  if (after === 0) {
    console.error("\n⛔ Han quedado CERO superadmins. Arréglalo desde el panel de Supabase YA.");
    process.exit(1);
  }
  if (failed.length) {
    console.error(`\n${failed.length} fallo(s). Vuelve a ejecutar: es idempotente.`);
    process.exit(1);
  }
  console.log("Comprueba con: node scripts/backfill-auth-roles.mjs --verify");
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
