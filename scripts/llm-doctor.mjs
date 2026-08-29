#!/usr/bin/env node
/**
 * llm-doctor.mjs — answer "why is OCR not working?" in one command.
 *
 * Every OCR call site degrades gracefully to `{ success: false }`, which is
 * correct for beneficiaries at the counter but useless for diagnosis. This
 * probes the gateway directly and prints the layer that is actually broken.
 *
 *   node scripts/llm-doctor.mjs
 *
 * Reads .env (the SERVER reads .env, not .env.local — see AGENTS.md gotchas).
 * Never prints the API key or any document content.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";


function loadEnvFile(path) {
  try {
    return Object.fromEntries(
      readFileSync(path, "utf8")
        .split("\n")
        .filter(line => /^\s*[A-Z_][A-Z0-9_]*\s*=/.test(line))
        .map(line => {
          const i = line.indexOf("=");
          const key = line.slice(0, i).trim();
          const value = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
          return [key, value];
        })
    );
  } catch {
    return {};
  }
}

const fileEnv = loadEnvFile(resolve(process.cwd(), ".env"));
const env = { ...fileEnv, ...process.env };

const baseUrl = (env.LLM_BASE_URL ?? "").trim().replace(/\/+$/, "");
const apiKey = (env.LLM_API_KEY ?? "").trim();

// No defaults: the gateway is provider-agnostic, so a guessed model id 404s.
const defaultModel = env.LLM_MODEL?.trim() || "";
const tasks = [
  { label: "LLM_MODEL     (default)", model: defaultModel, probeVision: false },
  { label: "OCR_MODEL     (vision)", model: env.OCR_MODEL?.trim() || defaultModel, probeVision: true },
  { label: "INFORME_MODEL (reports)", model: env.INFORME_MODEL?.trim() || defaultModel, probeVision: false },
];

// Endpoint joining must not double `/v1` — OpenRouter's base URL already has it.
const endpoint = path => (baseUrl.endsWith("/v1") ? `${baseUrl}/${path}` : `${baseUrl}/v1/${path}`);

const ok = m => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const bad = m => console.log(`  \x1b[31m✗\x1b[0m ${m}`);
const info = m => console.log(`  · ${m}`);

console.log("\nLLM / OCR gateway diagnosis\n");

console.log("1. Configuration");
const missing = [];
if (!apiKey) missing.push("LLM_API_KEY");
if (!baseUrl) missing.push("LLM_BASE_URL");
if (!defaultModel) missing.push("LLM_MODEL");

info(`LLM_BASE_URL  : ${baseUrl || "<unset>"}`);
for (const t of tasks) info(`${t.label}: ${t.model || "<unset>"}`);

if (missing.length) {
  bad(`${missing.join(", ")} not set — every LLM and OCR call fails before any network I/O.`);
  console.log(
    "\n  Fix: set them in .env (NOT .env.local — the server uses dotenv's\n" +
      "  default, which only reads .env). Then re-run this script.\n"
  );
  process.exit(1);
}
ok(`LLM_API_KEY present (${apiKey.length} chars)`);

console.log("\n2. Model catalog  (GET /v1/models)");
let catalog = [];
try {
  const res = await fetch(endpoint("models"), {
    headers: { authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    bad(`${res.status} ${res.statusText} — ${(await res.text()).slice(0, 200)}`);
    if (res.status === 401 || res.status === 403) {
      info("The key is rejected by this gateway. Wrong key, or wrong BUILT_IN_FORGE_API_URL for that key.");
    }
    process.exit(1);
  }
  catalog = (await res.json()).data?.map(m => m.id) ?? [];
  ok(`${catalog.length} models available`);

  let anyMissing = false;
  for (const t of tasks) {
    if (catalog.includes(t.model)) {
      ok(`${t.label}: "${t.model}" is in the catalog`);
    } else {
      bad(`${t.label}: "${t.model}" is NOT in the catalog — calls using it will 404/400.`);
      anyMissing = true;
    }
  }
  if (anyMissing) {
    const sample = catalog.filter(id => /gemini|claude|gpt/.test(id)).slice(0, 10);
    info(`Some available ids: ${sample.join(", ") || catalog.slice(0, 10).join(", ")}`);
    process.exit(1);
  }
} catch (err) {
  bad(`gateway unreachable: ${err.message}`);
  process.exit(1);
}

const ocrTask = tasks.find(t => t.probeVision);
console.log(`\n3. Vision + JSON round-trip on OCR_MODEL "${ocrTask.model}"`);
// 1x1 red PNG — smallest possible real image, no PII.
const PIXEL =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
try {
  const res = await fetch(endpoint("chat/completions"), {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: ocrTask.model,
      // Must match the production default (llm-payload DEFAULT_MAX_TOKENS).
      // A small ceiling here produces a FALSE PASS: reasoning models such as
      // gemini-2.5-pro spend ~200 tokens thinking before the first JSON byte,
      // so a 256-token probe truncates and this script would "verify" a
      // configuration that cannot complete a real extraction.
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: `data:image/png;base64,${PIXEL}`, detail: "low" } },
            { type: "text", text: 'Reply with JSON only: {"colour":"<the dominant colour>"}' },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "probe",
          strict: true,
          schema: {
            type: "object",
            properties: { colour: { type: "string" } },
            required: ["colour"],
            additionalProperties: false,
          },
        },
      },
    }),
  });

  if (!res.ok) {
    const body = (await res.text()).slice(0, 400);
    bad(`${res.status} ${res.statusText} — ${body}`);
    if (/schema|response_format/i.test(body)) {
      info("The gateway rejects strict json_schema for this model — pick a model that supports Structured Outputs.");
    }
    if (/image|vision|modality/i.test(body)) {
      info(`OCR_MODEL "${ocrTask.model}" appears to be TEXT-ONLY. OCR needs a vision model.`);
    }
    process.exit(1);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  const finish = data.choices?.[0]?.finish_reason;

  if (!content || String(content).trim() === "") {
    bad(`empty content (finish_reason=${finish}) — the model produced no output.`);
    if (finish === "length") {
      info("Hit the token ceiling before emitting content: raise max_tokens, or drop the reasoning/thinking budget.");
    }
    process.exit(1);
  }

  if (finish === "length") {
    bad(`truncated (finish_reason=length) — the model ran out of output tokens.`);
    info(`Reasoning models spend output tokens before emitting content. Raise max_tokens, or pick a non-reasoning OCR_MODEL.`);
    info(`partial content: ${String(content).replace(/\s+/g, " ").slice(0, 120)}`);
    process.exit(1);
  }

  // The whole point of OCR is parseable JSON — assert it, don't assume it.
  let parsed;
  try {
    const stripped = String(content).trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    parsed = JSON.parse(stripped);
  } catch {
    bad("response was not parseable JSON despite response_format: json_schema.");
    info(`raw content: ${String(content).replace(/\s+/g, " ").slice(0, 160)}`);
    process.exit(1);
  }

  ok(`vision + json_schema round-trip OK (finish_reason=${finish})`);
  info(`parsed: ${JSON.stringify(parsed).slice(0, 100)}`);
  const reasoning = data.usage?.completion_tokens_details?.reasoning_tokens;
  if (reasoning) {
    info(`${reasoning} of ${data.usage.completion_tokens} output tokens went to reasoning — keep max_tokens well above that.`);
  }
  console.log("\n\x1b[32mGateway is healthy — OCR should work.\x1b[0m\n");
} catch (err) {
  bad(`request failed: ${err.message}`);
  process.exit(1);
}
