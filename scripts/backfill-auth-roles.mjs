#!/usr/bin/env node
/**
 * backfill-auth-roles.mjs — copia rol y nombre de `public.app_users` a
 * `auth.users` (app_metadata.role / user_metadata.nombre), que es de donde el
 * servidor los leerá tras #144.
 *
 * POR QUÉ ES SEGURO EJECUTARLO ANTES DE DESPLEGAR
 * ----------------------------------------------
 * El código que hay hoy en producción NO lee `app_metadata`. Añadir ese campo
 * es puramente aditivo: no cambia nada del comportamiento actual. Por eso el
 * corte se hace en dos fases sin ventana de riesgo:
 *
 *   Fase 1 (este script, sin desplegar) → los dos caminos funcionan
 *   Fase 2 (desplegar #144)             → todo el mundo ya tiene su rol
 *
 * Y si algo sale mal en la fase 1, revertir es no hacer nada: el camino viejo
 * sigue leyendo `app_users`, intacta.
 *
 * ⚠️ ESTO CONCEDE PERMISOS. LÉELO ANTES DE USAR `--apply`.
 * --------------------------------------------------------
 * `admin.revokeStaffAccess` nunca revocó de verdad (ese es el bug #144), así
 * que `app_users` puede contener a gente a la que SÍ se quiso retirar el
 * acceso y que lo conservó. Copiar esa tabla a ciegas volvería a concedérselo,
 * y esta vez de forma efectiva. Por eso:
 *
 *   - por defecto NO escribe nada: imprime la tabla de revisión y sale;
 *   - `--apply` exige además `--yes`;
 *   - `--exclude <uuid>` (repetible) deja fuera a quien no deba recuperar acceso.
 *
 * Revisa la lista con alguien que sepa quién debe seguir teniendo acceso.
 *
 * USO
 *   node scripts/backfill-auth-roles.mjs                    # revisión (dry-run)
 *   node scripts/backfill-auth-roles.mjs --apply --yes      # escribe
 *   node scripts/backfill-auth-roles.mjs --exclude <uuid> --apply --yes
 *   node scripts/backfill-auth-roles.mjs --verify           # solo comprobar el estado
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

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const YES = args.includes("--yes");
const VERIFY_ONLY = args.includes("--verify");
const EXCLUDED = new Set(
  args.flatMap((a, i) => (a === "--exclude" ? [args[i + 1]] : [])).filter(Boolean)
);

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!url || !key) {
  console.error("Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
if (APPLY && !YES) {
  console.error("`--apply` requiere `--yes`. Ejecuta primero sin flags y revisa la lista.");
  process.exit(1);
}

const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Todas las cuentas de auth, paginando (listUsers tope 1000/página). */
async function fetchAuthUsers() {
  const all = [];
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    all.push(...(data.users ?? []));
    if ((data.users ?? []).length < 200) return all;
  }
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

const nameOf = (u) =>
  u.user_metadata?.nombre ?? u.user_metadata?.name ?? null;

function classify(authUser, appRow) {
  const authRole = authUser.app_metadata?.role;
  const hasValidAuthRole = typeof authRole === "string" && VALID_ROLES.includes(authRole);
  const needsRole = !hasValidAuthRole && appRow?.role && VALID_ROLES.includes(appRow.role);
  const needsName = !nameOf(authUser) && !!appRow?.name;

  let status;
  if (hasValidAuthRole) status = "OK";
  else if (needsRole) status = "RELLENAR";
  else if (appRow) status = "SIN ROL EN NINGUN SITIO";
  else status = "SIN FILA (hoy ya no entra)";

  return { hasValidAuthRole, needsRole, needsName, status };
}

function table(rows) {
  const w = (s, n) => String(s ?? "").slice(0, n).padEnd(n);
  console.log(
    w("estado", 26) + w("email", 34) + w("rol auth", 14) + w("rol app_users", 14) + "nombre"
  );
  console.log("-".repeat(104));
  for (const r of rows) {
    console.log(
      w(r.status, 26) +
        w(r.email, 34) +
        w(r.authRole ?? "—", 14) +
        w(r.appRole ?? "—", 14) +
        (r.needsName ? `rellenar: ${r.appName}` : nameOf(r.authUser) ? "ok" : "—")
    );
  }
}

async function main() {
  const [authUsers, appUsers] = await Promise.all([fetchAuthUsers(), fetchAppUsers()]);

  if (appUsers === null) {
    console.log("`public.app_users` no existe aquí (esperado en local/CI). Nada que hacer.");
    return;
  }

  const byId = new Map(appUsers.map((r) => [r.id, r]));
  const rows = authUsers.map((u) => {
    const appRow = byId.get(u.id);
    const c = classify(u, appRow);
    return {
      id: u.id,
      email: u.email ?? "(sin email)",
      authRole: u.app_metadata?.role ?? null,
      appRole: appRow?.role ?? null,
      appName: appRow?.name ?? null,
      authUser: u,
      ...c,
    };
  });

  rows.sort((a, b) => a.status.localeCompare(b.status) || a.email.localeCompare(b.email));
  table(rows);

  const pending = rows.filter(
    (r) => (r.needsRole || r.needsName) && !EXCLUDED.has(r.id)
  );
  const skipped = rows.filter((r) => (r.needsRole || r.needsName) && EXCLUDED.has(r.id));

  console.log("");
  console.log(`total cuentas auth : ${rows.length}`);
  console.log(`filas en app_users : ${appUsers.length}`);
  console.log(`ya correctas       : ${rows.filter((r) => r.hasValidAuthRole).length}`);
  console.log(`a rellenar         : ${pending.length}`);
  if (skipped.length) console.log(`excluidas (--exclude): ${skipped.length}`);

  // Guarda: nadie debe quedarse sin vía de recuperación. `createStaffUser` solo
  // concede admin|voluntario, así que si no queda ningún superadmin con el rol
  // en app_metadata, no hay forma de recuperarlo desde la aplicación.
  const superadminsAfter = rows.filter(
    (r) =>
      (r.hasValidAuthRole && r.authRole === "superadmin") ||
      (r.needsRole && r.appRole === "superadmin" && !EXCLUDED.has(r.id))
  ).length;
  console.log(`superadmins tras el relleno: ${superadminsAfter}`);
  if (superadminsAfter === 0) {
    console.error(
      "\n⛔ Quedarían CERO superadmins. La app no ofrece ninguna vía para conceder ese rol\n" +
        "   (createStaffUser acepta solo admin|voluntario), así que no habría recuperación\n" +
        "   desde dentro. Resuélvelo antes de continuar."
    );
    process.exit(1);
  }

  if (VERIFY_ONLY) {
    process.exit(pending.length === 0 ? 0 : 1);
  }

  if (!APPLY) {
    console.log(
      "\nDRY-RUN: no se ha escrito nada.\n" +
        "⚠️  Antes de `--apply --yes`: revocar NUNCA funcionó (#144), así que esta lista\n" +
        "    puede incluir a gente a la que se quiso retirar el acceso. Repásala con\n" +
        "    alguien que sepa quién debe seguir entrando y excluye al resto con\n" +
        "    `--exclude <uuid>`."
    );
    return;
  }

  let ok = 0;
  for (const r of pending) {
    const patch = {};
    if (r.needsRole) patch.app_metadata = { role: r.appRole };
    if (r.needsName) patch.user_metadata = { nombre: r.appName };

    const { error } = await db.auth.admin.updateUserById(r.id, patch);
    if (error) {
      console.error(`  ✗ ${r.email}: ${error.message}`);
      continue;
    }
    console.log(
      `  ✓ ${r.email}` +
        (r.needsRole ? ` rol=${r.appRole}` : "") +
        (r.needsName ? " +nombre" : "")
    );
    ok++;
  }

  console.log(`\nActualizadas ${ok}/${pending.length}.`);
  console.log("Comprueba con: node scripts/backfill-auth-roles.mjs --verify");
  if (ok < pending.length) process.exit(1);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
