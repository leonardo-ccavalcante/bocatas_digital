/**
 * LIVE integration test — requires a running local Supabase with the SEEDED demo
 * family AND the informe template published (scripts/publish-informe-template.mjs).
 * CI cannot satisfy those preconditions (its unit job has placeholder SUPABASE
 * env → network timeout; its DB job has a real DB but no published template), so
 * the suite is OPT-IN via an explicit flag, not env presence. Run explicitly:
 *   RUN_LIVE_INFORME_TESTS=1 SUPABASE_URL=http://127.0.0.1:54321 \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   pnpm exec vitest run server/services/__tests__/informeGen.live.integration.test.ts
 *
 * Proves the WHOLE chain end-to-end against real DB + Storage + the published
 * template: real titular data → buildFamilyDataContext → renderDocument (dotted
 * parser + published .docx) → correct output; then persist via the RPC.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import PizZip from "pizzip";
import { randomUUID } from "node:crypto";
import { buildFamilyDataContext } from "../documentContextBuilder";
import { renderDocument } from "../documentService";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
// Explicit opt-in: env PRESENCE is not env USABILITY (CI sets placeholder values).
const RUN = process.env.RUN_LIVE_INFORME_TESTS === "1" && !!url && !!key;
const db = RUN ? createClient(url as string, key as string, { auth: { persistSession: false } }) : null;

const FAMILY_ID = "d0000000-0000-0000-0000-000000000001";
const VALORACION = "VALORACION_LIVE_SENTINEL";

describe.skipIf(!RUN)("informe valoración — live DB integration", () => {
  beforeAll(async () => {
    await db!.from("family_follow_ups").insert({
      family_id: FAMILY_ID,
      fecha: new Date().toISOString().slice(0, 10),
      notas: "Entrevista de prueba (integration)",
      created_by: "integration-test",
    });
    await db!.from("families").update({ situacion_familiar_texto: VALORACION }).eq("id", FAMILY_ID);
  });

  it("renders a real informe with real titular data + valoración", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = await buildFamilyDataContext(db as any, FAMILY_ID, { slug: "informe_social" });
    expect(ctx.titular.nombre).not.toBe(""); // real titular loaded from persons
    expect(ctx.valoracion).toBe(VALORACION);

    const { buffer } = await renderDocument("informe_social", ctx, { actorId: "test", familyId: FAMILY_ID });
    const xml = new PizZip(buffer).files["word/document.xml"].asText();
    // titular name rendered (dotted parser + published template working live)
    expect(xml).toContain(ctx.titular.nombre);
    expect(xml).toContain(VALORACION);
  });

  it("persists a versioned informe_valoracion_social document (direct insert, no RPC)", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = await buildFamilyDataContext(db as any, FAMILY_ID, { slug: "informe_social" });
    const { buffer, mime } = await renderDocument("informe_social", ctx, { actorId: "test", familyId: FAMILY_ID });

    const path = `${FAMILY_ID}/-1/informe_valoracion_social/${randomUUID()}.docx`;
    const up = await db!.storage.from("family-documents").upload(path, buffer, { contentType: mime, upsert: false });
    expect(up.error).toBeNull();

    // Same direct versioning as generateAndPersist (service_role bypasses RLS).
    await db!
      .from("family_member_documents")
      .update({ is_current: false })
      .eq("family_id", FAMILY_ID)
      .eq("documento_tipo", "informe_valoracion_social")
      .eq("member_index", -1)
      .eq("is_current", true)
      .is("deleted_at", null);
    const ins = await db!.from("family_member_documents").insert({
      family_id: FAMILY_ID,
      member_index: -1,
      member_person_id: null,
      documento_tipo: "informe_valoracion_social",
      documento_url: path,
      fecha_upload: new Date().toISOString(),
      verified_by: null,
      is_current: true,
    });
    expect(ins.error).toBeNull();

    const { data: rows } = await db!
      .from("family_member_documents")
      .select("documento_tipo, documento_url, is_current")
      .eq("family_id", FAMILY_ID)
      .eq("documento_tipo", "informe_valoracion_social")
      .eq("is_current", true);
    expect((rows ?? []).length).toBe(1); // exactly one current row (versioning holds)
    expect(rows![0].documento_url).toBe(path);
  });
});
