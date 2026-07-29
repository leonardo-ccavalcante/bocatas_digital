/**
 * observacionesReviewer — reviews and reformulates the raw `persons.observaciones`
 * field (interviewer intake notes) into professional social-work language suitable
 * for inclusion in an official Informe de Valoración Social.
 *
 * Contract:
 *  - Input: raw free-text notes from the interviewer (may be informal, fragmented,
 *    or contain personal opinions).
 *  - Output: a reformulated paragraph in professional, impersonal, third-person
 *    social-work language — OR null if the input is empty, too short to be useful,
 *    or contains nothing appropriate for an official document.
 *  - STRICT: the LLM must NEVER invent, infer, or add information not present in
 *    the input. Only reformulation of existing content is allowed.
 *  - RGPD Art.9: the LLM prompt explicitly forbids including health, legal status,
 *    migration history, or other Art.9 sensitive data in the output.
 *
 * This function is called server-side only (inside a tRPC procedure).
 */

import { invokeLLM } from "../_core/llm";

const SYSTEM_PROMPT = `Eres un trabajador social profesional que redacta informes de valoración social oficiales en España.

Tu tarea es revisar unas notas de observación internas escritas por un entrevistador y reformularlas en lenguaje profesional de trabajo social, adecuado para un documento oficial.

REGLAS ESTRICTAS:
1. SOLO reformula la información que ya está en el texto. NO inventes, NO inferas, NO añadas datos que no estén explícitamente en las notas.
2. Usa tercera persona impersonal y lenguaje técnico de trabajo social.
3. Elimina opiniones personales, juicios de valor, o lenguaje informal.
4. NO incluyas datos de salud, situación legal, historial migratorio, ni ningún dato especialmente sensible (RGPD Art.9) — si los hay en las notas, omítelos.
5. Si las notas no contienen información relevante para un informe social oficial, o son demasiado breves/vagas, devuelve null.
6. El resultado debe ser un párrafo conciso (máximo 3-4 frases), no una lista.
7. Si el resultado sería prácticamente idéntico a las notas originales (ya están bien redactadas), devuélvelas con mínimos ajustes de formato.`;

const RESPONSE_SCHEMA = {
  type: "json_schema" as const,
  json_schema: {
    name: "observaciones_review",
    strict: true,
    schema: {
      type: "object",
      properties: {
        texto_revisado: {
          type: ["string", "null"] as unknown as "string",
          description:
            "Texto reformulado en lenguaje profesional de trabajo social, o null si no hay contenido apto para el informe.",
        },
      },
      required: ["texto_revisado"],
      additionalProperties: false,
    },
  },
};

/**
 * reviewObservaciones — reformulates raw intake notes into professional social-work
 * language. Returns null if the input is empty or contains nothing suitable for an
 * official document.
 *
 * @param rawObservaciones - The raw `persons.observaciones` text.
 * @returns Reformulated text, or null.
 */
export async function reviewObservaciones(
  rawObservaciones: string | null | undefined,
): Promise<string | null> {
  const trimmed = (rawObservaciones ?? "").trim();
  if (!trimmed || trimmed.length < 10) return null;

  try {
    const res = await invokeLLM({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Notas de observación a revisar:\n\n${trimmed}`,
        },
      ],
      response_format: RESPONSE_SCHEMA,
    });

    const rawContent = res.choices?.[0]?.message?.content;
    const raw = typeof rawContent === "string" ? rawContent : null;
    if (!raw) return null;

    const parsed = JSON.parse(raw) as { texto_revisado: string | null };
    const result = parsed.texto_revisado?.trim() ?? null;
    return result && result.length > 0 ? result : null;
  } catch {
    // LLM errors must never block informe generation — fall back to null (omit block).
    return null;
  }
}
