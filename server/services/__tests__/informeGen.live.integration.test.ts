/**
 * LIVE integration test — requires a running local Supabase with the template
 * published. Run explicitly:
 *   SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=... \
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
const RUN = !!url && !!key;
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

  it("persists a versioned informe_valoracion_social document (storage + RPC)", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = await buildFamilyDataContext(db as any, FAMILY_ID, { slug: "informe_social" });
    const { buffer, mime } = await renderDocument("informe_social", ctx, { actorId: "test", familyId: FAMILY_ID });

    const path = `${FAMILY_ID}/-1/informe_valoracion_social/${randomUUID()}.docx`;
    const up = await db!.storage.from("family-documents").upload(path, buffer, { contentType: mime, upsert: false });
    expect(up.error).toBeNull();

    const rpc = await db!.rpc("upload_family_document", {
      p_family_id: FAMILY_ID,
      p_member_index: -1,
      p_member_person_id: null as unknown as string,
      p_documento_tipo: "informe_valoracion_social",
      p_documento_url: path,
      p_verified_by: "integration-test",
    });
    expect(rpc.error).toBeNull();

    const { data: rows } = await db!
      .from("family_member_documents")
      .select("documento_tipo, documento_url, is_current")
      .eq("family_id", FAMILY_ID)
      .eq("documento_tipo", "informe_valoracion_social")
      .eq("is_current", true);
    expect((rows ?? []).length).toBe(1);
    expect(rows![0].documento_url).toBe(path);
  });
});
