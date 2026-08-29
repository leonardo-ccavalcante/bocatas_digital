// Pure request/response shaping for the LLM gateway. No network, no ENV — so
// the layer where the OCR outage lived is unit-testable (see
// `__tests__/llm-payload.test.ts`). Transport lives in `llm.ts`.

export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = { type: "text"; text: string };

export type ImageContent = {
  type: "image_url";
  image_url: { url: string; detail?: "auto" | "low" | "high" };
};

export type FileContent = {
  type: "file_url";
  file_url: {
    url: string;
    mime_type?: "audio/mpeg" | "audio/wav" | "application/pdf" | "audio/mp4" | "video/mp4";
  };
};

export type MessageContent = string | TextContent | ImageContent | FileContent;

export type Message = {
  role: Role;
  content: MessageContent | MessageContent[];
  name?: string;
  tool_call_id?: string;
};

export type Tool = {
  type: "function";
  function: { name: string; description?: string; parameters?: Record<string, unknown> };
};

export type ToolChoicePrimitive = "none" | "auto" | "required";
export type ToolChoiceByName = { name: string };
export type ToolChoiceExplicit = { type: "function"; function: { name: string } };
export type ToolChoice = ToolChoicePrimitive | ToolChoiceByName | ToolChoiceExplicit;

export type JsonSchema = { name: string; schema: Record<string, unknown>; strict?: boolean };
export type OutputSchema = JsonSchema;

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: JsonSchema };

export type InvokeParams = {
  messages: Message[];
  /**
   * Model id from the gateway catalog (`listLLMModels()`). Omit to use the
   * configured default. Previously hardcoded, which made every caller — vision
   * OCR included — share one model with no way to opt out.
   */
  model?: string;
  tools?: Tool[];
  toolChoice?: ToolChoice;
  tool_choice?: ToolChoice;
  maxTokens?: number;
  max_tokens?: number;
  /**
   * Extension params forwarded UNCHANGED, and only when the caller sets them.
   * Shape is model-family specific (see references/llm-integration.md):
   * anthropic `{ type: "enabled", budget_tokens: >=1024 }`, gemini
   * `{ budget_tokens: n }`, openai uses `reasoning: { effort }` instead.
   */
  thinking?: Record<string, unknown>;
  reasoning?: Record<string, unknown>;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
};

export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: Role;
      content: string | Array<TextContent | ImageContent | FileContent>;
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
  }>;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
};

/**
 * Why an OCR/LLM call produced nothing. Callers surface this instead of an
 * opaque `{ success: false }`, so "the gateway is not configured in this
 * environment" is distinguishable from "the model could not read the image".
 */
export type LLMFailureReason =
  | "not_configured"
  | "llm_error"
  | "truncated"
  | "unreadable";

/**
 * Structural guard rather than `instanceof LLMNotConfiguredError`: every OCR
 * test mocks `_core/llm` with a bare factory, so an `instanceof` against a
 * class exported from there explodes on any test that does not restub it.
 * This module is pure and never mocked.
 */
export const isNotConfiguredError = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  (error as { reason?: unknown }).reason === "not_configured";

export type PayloadDefaults = { model: string; maxTokens: number };

/**
 * Output ceiling. Sized for REASONING models: on google/gemini-2.5-pro a
 * single-pixel probe spent 203 and 966 output tokens on reasoning across two
 * runs before emitting any content, and a real document with a full extraction
 * schema needs the JSON on top of that. Too low is not a soft limit — the
 * content arrives truncated and unparseable, which reads as "unreadable
 * document". The old hardcoded 32768 was the opposite trap: paired with a
 * reasoning budget it let the model think until the window was gone.
 *
 * `max_tokens` is a ceiling, not a spend — a cheap non-reasoning model still
 * bills only the ~10 tokens it actually emits.
 *
 * There is deliberately no default MODEL — see llm-models.ts.
 */
export const DEFAULT_MAX_TOKENS = 8192;

/**
 * Join a gateway base URL with an endpoint path without doubling `/v1`.
 * OpenRouter's base URL already ends in `/v1` (`https://openrouter.ai/api/v1`);
 * Manus Forge's is a bare origin. Doubling it yields a 404 that surfaces as a
 * generic "OCR failed".
 */
const endpointUrl = (baseUrl: string, path: string): string => {
  const base = baseUrl.trim().replace(/\/+$/, "");
  return base.endsWith("/v1") ? `${base}/${path}` : `${base}/v1/${path}`;
};

export const chatCompletionsUrl = (baseUrl: string): string =>
  endpointUrl(baseUrl, "chat/completions");

export const modelsUrl = (baseUrl: string): string => endpointUrl(baseUrl, "models");

const ensureArray = (v: MessageContent | MessageContent[]): MessageContent[] =>
  Array.isArray(v) ? v : [v];

const normalizeContentPart = (
  part: MessageContent
): TextContent | ImageContent | FileContent => {
  if (typeof part === "string") return { type: "text", text: part };
  if (part.type === "text" || part.type === "image_url" || part.type === "file_url") {
    return part;
  }
  throw new Error("Unsupported message content part");
};

const normalizeMessage = (message: Message) => {
  const { role, name, tool_call_id } = message;

  if (role === "tool" || role === "function") {
    const content = ensureArray(message.content)
      .map(part => (typeof part === "string" ? part : JSON.stringify(part)))
      .join("\n");
    return { role, name, tool_call_id, content };
  }

  const parts = ensureArray(message.content).map(normalizeContentPart);
  // Collapse a lone text part to a bare string for gateway compatibility.
  if (parts.length === 1 && parts[0].type === "text") {
    return { role, name, content: parts[0].text };
  }
  return { role, name, content: parts };
};

const normalizeToolChoice = (
  toolChoice: ToolChoice | undefined,
  tools: Tool[] | undefined
): "none" | "auto" | ToolChoiceExplicit | undefined => {
  if (!toolChoice) return undefined;
  if (toolChoice === "none" || toolChoice === "auto") return toolChoice;

  if (toolChoice === "required") {
    if (!tools || tools.length === 0) {
      throw new Error("tool_choice 'required' was provided but no tools were configured");
    }
    if (tools.length > 1) {
      throw new Error(
        "tool_choice 'required' needs a single tool or specify the tool name explicitly"
      );
    }
    return { type: "function", function: { name: tools[0].function.name } };
  }

  if ("name" in toolChoice) {
    return { type: "function", function: { name: toolChoice.name } };
  }
  return toolChoice;
};

const normalizeResponseFormat = (
  p: Pick<InvokeParams, "responseFormat" | "response_format" | "outputSchema" | "output_schema">
): ResponseFormat | undefined => {
  const explicit = p.responseFormat || p.response_format;
  if (explicit) {
    if (explicit.type === "json_schema" && !explicit.json_schema?.schema) {
      throw new Error("responseFormat json_schema requires a defined schema object");
    }
    return explicit;
  }

  const schema = p.outputSchema || p.output_schema;
  if (!schema) return undefined;
  if (!schema.name || !schema.schema) {
    throw new Error("outputSchema requires both name and schema");
  }

  return {
    type: "json_schema",
    json_schema: {
      name: schema.name,
      schema: schema.schema,
      ...(typeof schema.strict === "boolean" ? { strict: schema.strict } : {}),
    },
  };
};

/** Build the OpenAI-compatible chat-completions body. Pure. */
export function buildPayload(
  params: InvokeParams,
  defaults: PayloadDefaults
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    model: params.model ?? defaults.model,
    messages: params.messages.map(normalizeMessage),
    max_tokens: params.maxTokens ?? params.max_tokens ?? defaults.maxTokens,
  };

  if (params.tools && params.tools.length > 0) payload.tools = params.tools;

  const toolChoice = normalizeToolChoice(
    params.toolChoice || params.tool_choice,
    params.tools
  );
  if (toolChoice) payload.tool_choice = toolChoice;

  // Forwarded only when the caller asks for them — never defaulted.
  if (params.thinking) payload.thinking = params.thinking;
  if (params.reasoning) payload.reasoning = params.reasoning;

  const responseFormat = normalizeResponseFormat(params);
  if (responseFormat) payload.response_format = responseFormat;

  return payload;
}

/**
 * Parse model output that is *supposed* to be JSON. Tolerates the two things
 * models do anyway despite "return ONLY JSON": markdown fences, and prose
 * wrapped around the object. Throws if there is no JSON at all.
 */
export function parseJsonContent(raw: string): unknown {
  const fenced = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(fenced);
  } catch {
    // fall through to brace/bracket extraction
  }

  const start = fenced.search(/[{[]/);
  const end = Math.max(fenced.lastIndexOf("}"), fenced.lastIndexOf("]"));
  if (start === -1 || end <= start) {
    throw new Error("LLM response contained no JSON payload");
  }
  return JSON.parse(fenced.slice(start, end + 1));
}
