import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

// ─── Provider selection ────────────────────────────────────────────────────────
const AI_PROVIDER = Deno.env.get("AI_PROVIDER") ?? "openai"; // manus | openai | anthropic
const AI_API_KEY = Deno.env.get("AI_API_KEY") ?? "";

const EXTRACTION_PROMPT = `You are a document data extractor for an NGO working with vulnerable populations.
Extract information from this identity document image and return ONLY valid JSON.
The document may be in any language or format: Spanish DNI, NIE, Moroccan CNIE, Syrian passport, French ID, etc.

Extract these fields (use null if not visible or unclear):
{
  "nombre": string | null,
  "apellidos": string | null,
  "fecha_nacimiento": "YYYY-MM-DD" | null,
  "numero_documento": string | null,
  "tipo_documento": "dni" | "nie" | "pasaporte" | "otro" | null,
  "pais_emision": string | null,
  "fecha_caducidad": "YYYY-MM-DD" | null
}
CRITICAL: Return ONLY the JSON object. No markdown, no explanation.`;

// ─── Provider-agnostic AI client ───────────────────────────────────────────────
interface AIProviderClient {
  extractDocument(imageBase64: string, mimeType: string): Promise<string>;
}

function createAIClient(provider: string, apiKey: string): AIProviderClient {
  switch (provider) {
    case "openai":
      return {
        async extractDocument(imageBase64: string, mimeType: string): Promise<string> {
          const res = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "gpt-4o-mini",
              max_tokens: 300,
              messages: [{
                role: "user",
                content: [
                  { type: "text", text: EXTRACTION_PROMPT },
                  {
                    type: "image_url",
                    image_url: { url: `data:${mimeType};base64,${imageBase64}`, detail: "low" },
                  },
                ],
              }],
            }),
          });
          if (!res.ok) {
            throw new Error(`OpenAI API error: ${res.status} ${res.statusText}`);
          }
          const text = await res.text();
          const data = JSON.parse(text) as { choices?: Array<{ message?: { content?: string } }> };
          return data.choices?.[0]?.message?.content ?? "{}";
        },
      };

    case "anthropic":
      return {
        async extractDocument(imageBase64: string, mimeType: string): Promise<string> {
          const res = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "x-api-key": apiKey,
              "anthropic-version": "2023-06-01",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "claude-haiku-4-5-20251001",
              max_tokens: 300,
              messages: [{
                role: "user",
                content: [
                  { type: "image", source: { type: "base64", media_type: mimeType, data: imageBase64 } },
                  { type: "text", text: EXTRACTION_PROMPT },
                ],
              }],
            }),
          });
          if (!res.ok) {
            throw new Error(`Anthropic API error: ${res.status} ${res.statusText}`);
          }
          const text = await res.text();
          const data = JSON.parse(text) as { content?: Array<{ text?: string }> };
          return data.content?.[0]?.text ?? "{}";
        },
      };

    case "manus":
    default:
      return {
        async extractDocument(imageBase64: string, mimeType: string): Promise<string> {
          const res = await fetch("https://api.manus.ai/v1/vision/extract", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ image: imageBase64, mimeType, prompt: EXTRACTION_PROMPT }),
          });
          if (!res.ok) {
            throw new Error(`Manus API error: ${res.status} ${res.statusText}`);
          }
          const text = await res.text();
          const data = JSON.parse(text) as { result?: string };
          return data.result ?? "{}";
        },
      };
  }
}

// ─── Request handler ───────────────────────────────────────────────────────────
serve(async (req: Request): Promise<Response> => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ success: false, error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  // SECURITY: Validate JWT via Supabase
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Parse body
  let imageBase64: string;
  let mimeType: string;
  try {
    const body = await req.json() as { imageBase64?: string; mimeType?: string };
    if (!body.imageBase64) {
      return new Response(JSON.stringify({ success: false, data: {} }), {
        headers: { "Content-Type": "application/json" },
      });
    }
    imageBase64 = body.imageBase64;
    mimeType = body.mimeType ?? "image/jpeg";
  } catch {
    return new Response(JSON.stringify({ success: false, data: {} }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // Graceful degradation: if no API key configured, return empty
  if (!AI_API_KEY) {
    return new Response(JSON.stringify({ success: false, data: {} }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const client = createAIClient(AI_PROVIDER, AI_API_KEY);
    const content = await client.extractDocument(imageBase64, mimeType);
    const extracted = JSON.parse(content) as Record<string, unknown>;
    return new Response(JSON.stringify({ success: true, data: extracted }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ success: false, data: {} }), {
      headers: { "Content-Type": "application/json" },
    });
  }
});
