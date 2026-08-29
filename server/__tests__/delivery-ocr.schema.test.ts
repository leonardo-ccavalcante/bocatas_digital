/**
 * delivery-ocr.schema.test.ts — the json_schema sent with `strict: true` must
 * actually satisfy strict Structured-Outputs rules, or the gateway rejects the
 * whole request with a 400 and the caller reports a generic "no se pudieron
 * extraer los datos" that looks like a bad photo.
 *
 * Strict mode requires, for EVERY object node:
 *   - `additionalProperties: false`
 *   - `required` listing every declared property
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../_core/llm", () => ({ invokeLLM: vi.fn() }));

import * as llmModule from "../_core/llm";
import { extractDeliveryDataFromImage } from "../_core/delivery-ocr";
import { extractActaSignatures } from "../_core/acta-ocr";

type Node = {
  type?: string | string[];
  properties?: Record<string, Node>;
  required?: string[];
  additionalProperties?: boolean;
  items?: Node;
};

/** Walk every object node in a JSON Schema and assert strict-mode legality. */
function assertStrictLegal(node: Node, path = "$"): void {
  if (node.items) assertStrictLegal(node.items, `${path}[]`);
  if (!node.properties) return;

  expect(node.additionalProperties, `${path}: additionalProperties must be false`).toBe(false);

  const declared = Object.keys(node.properties).sort();
  expect([...(node.required ?? [])].sort(), `${path}: required must list every property`).toEqual(
    declared
  );

  for (const [key, child] of Object.entries(node.properties)) {
    assertStrictLegal(child, `${path}.${key}`);
  }
}

const captured = () =>
  (vi.mocked(llmModule.invokeLLM).mock.calls[0][0] as {
    response_format?: { type: string; json_schema: { strict?: boolean; schema: Node } };
  }).response_format!;

beforeEach(() => vi.clearAllMocks());

describe("delivery-ocr json_schema", () => {
  it("is legal under strict mode at every nesting level", async () => {
    vi.mocked(llmModule.invokeLLM).mockResolvedValueOnce({
      choices: [{ message: { content: '{"extraction_confidence":1,"beneficiaries":[],"warnings":[]}' } }],
    } as unknown as llmModule.InvokeResult);

    await extractDeliveryDataFromImage("https://example.com/doc.jpg", "programa-1");

    const rf = captured();
    expect(rf.json_schema.strict).toBe(true);
    assertStrictLegal(rf.json_schema.schema);
  });

  it("tolerates a markdown-fenced reply", async () => {
    vi.mocked(llmModule.invokeLLM).mockResolvedValueOnce({
      choices: [
        {
          message: {
            content:
              '```json\n{"extraction_confidence":0.9,"beneficiaries":[{"name":"Ana","name_confidence":0.9,"deliveries":[]}],"warnings":[]}\n```',
          },
        },
      ],
    } as unknown as llmModule.InvokeResult);

    const result = await extractDeliveryDataFromImage("https://example.com/doc.jpg", "p1");
    expect(result.success).toBe(true);
    expect(result.beneficiaries[0].beneficiaryName).toBe("Ana");
  });
});

describe("acta-ocr json_schema", () => {
  it("is legal under strict mode at every nesting level", async () => {
    vi.mocked(llmModule.invokeLLM).mockResolvedValueOnce({
      choices: [{ message: { content: '{"extraction_confidence":1,"rows":[],"warnings":[]}' } }],
    } as unknown as llmModule.InvokeResult);

    await extractActaSignatures("https://example.com/acta.jpg");

    const rf = captured();
    expect(rf.json_schema.strict).toBe(true);
    assertStrictLegal(rf.json_schema.schema);
  });
});
