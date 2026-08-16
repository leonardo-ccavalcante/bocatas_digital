/**
 * Provider-agnostic LLM client.
 *
 * Supports ANY OpenAI-compatible endpoint:
 * - OpenRouter (https://openrouter.ai/api/v1)
 * - OpenAI (https://api.openai.com/v1)
 * - Anthropic via OpenAI compat (https://api.anthropic.com/v1)
 * - Local (Ollama, LM Studio, etc.)
 * - Manus Forge (legacy fallback)
 *
 * Configuration (env vars):
 * - LLM_BASE_URL: Base URL of the provider (e.g. https://openrouter.ai/api/v1)
 * - LLM_API_KEY: API key for the provider
 * - LLM_MODEL: Default model to use (e.g. google/gemini-2.5-flash)
 *
 * Falls back to BUILT_IN_FORGE_API_URL/KEY if LLM_* vars are not set.
 */
import { ENV } from "./env";

// ── Types (unchanged public API) ────────────────────────────────────────────

export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = {
  type: "text";
  text: string;
};

export type ImageContent = {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
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
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type ToolChoicePrimitive = "none" | "auto" | "required";
export type ToolChoiceByName = { name: string };
export type ToolChoiceExplicit = {
  type: "function";
  function: {
    name: string;
  };
};

export type ToolChoice =
  | ToolChoicePrimitive
  | ToolChoiceByName
  | ToolChoiceExplicit;

export type InvokeParams = {
  messages: Message[];
  tools?: Tool[];
  toolChoice?: ToolChoice;
  tool_choice?: ToolChoice;
  maxTokens?: number;
  max_tokens?: number;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  /** Override the default model for this single call */
  model?: string;
};

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
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
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type JsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type OutputSchema = JsonSchema;

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: JsonSchema };

// ── LLM Model listing (for dropdown) ────────────────────────────────────────

export type LLMModelInfo = {
  id: string;
  name: string;
  context_length?: number;
  pricing?: { prompt: string; completion: string };
};

/**
 * Fetches the list of available models from the configured provider.
 * Works with OpenRouter, OpenAI, and any OpenAI-compatible /v1/models endpoint.
 */
export async function listAvailableModels(): Promise<LLMModelInfo[]> {
  const { baseUrl, apiKey } = resolveLLMConfig();

  const url = `${baseUrl}/models`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to list models: ${response.status} ${response.statusText}`);
  }

  const json = await response.json() as { data?: Array<Record<string, unknown>> };
  const models = json.data ?? [];

  return models.map((m) => ({
    id: String(m.id ?? ""),
    name: String(m.name ?? m.id ?? ""),
    context_length: typeof m.context_length === "number" ? m.context_length : undefined,
    pricing: m.pricing && typeof m.pricing === "object"
      ? {
          prompt: String((m.pricing as Record<string, unknown>).prompt ?? ""),
          completion: String((m.pricing as Record<string, unknown>).completion ?? ""),
        }
      : undefined,
  }));
}

// ── Configuration resolution ─────────────────────────────────────────────────

interface LLMConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

function resolveLLMConfig(): LLMConfig {
  // Priority 1: Explicit LLM_* env vars
  const llmBaseUrl = process.env.LLM_BASE_URL?.trim();
  const llmApiKey = process.env.LLM_API_KEY?.trim();
  const llmModel = process.env.LLM_MODEL?.trim();

  if (llmBaseUrl && llmApiKey) {
    return {
      baseUrl: llmBaseUrl.replace(/\/+$/, ""),
      apiKey: llmApiKey,
      model: llmModel || "google/gemini-2.5-flash",
    };
  }

  // Priority 2: Legacy Forge API (Manus built-in)
  if (ENV.forgeApiUrl && ENV.forgeApiKey) {
    return {
      baseUrl: ENV.forgeApiUrl.replace(/\/+$/, "") + "/v1",
      apiKey: ENV.forgeApiKey,
      model: "gemini-2.5-flash",
    };
  }

  throw new Error(
    "LLM not configured. Set LLM_BASE_URL + LLM_API_KEY, or BUILT_IN_FORGE_API_URL + BUILT_IN_FORGE_API_KEY."
  );
}

// ── Message normalization (unchanged) ────────────────────────────────────────

const ensureArray = (
  value: MessageContent | MessageContent[]
): MessageContent[] => (Array.isArray(value) ? value : [value]);

const normalizeContentPart = (
  part: MessageContent
): TextContent | ImageContent | FileContent => {
  if (typeof part === "string") {
    return { type: "text", text: part };
  }
  if (part.type === "text") return part;
  if (part.type === "image_url") return part;
  if (part.type === "file_url") return part;
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

  const contentParts = ensureArray(message.content).map(normalizeContentPart);

  if (contentParts.length === 1 && contentParts[0].type === "text") {
    return { role, name, content: contentParts[0].text };
  }

  return { role, name, content: contentParts };
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
      throw new Error("tool_choice 'required' needs a single tool or specify the tool name explicitly");
    }
    return { type: "function", function: { name: tools[0].function.name } };
  }

  if ("name" in toolChoice) {
    return { type: "function", function: { name: toolChoice.name } };
  }

  return toolChoice;
};

const normalizeResponseFormat = ({
  responseFormat,
  response_format,
  outputSchema,
  output_schema,
}: {
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
}):
  | { type: "json_schema"; json_schema: JsonSchema }
  | { type: "text" }
  | { type: "json_object" }
  | undefined => {
  const explicitFormat = responseFormat || response_format;
  if (explicitFormat) {
    if (explicitFormat.type === "json_schema" && !explicitFormat.json_schema?.schema) {
      throw new Error("responseFormat json_schema requires a defined schema object");
    }
    return explicitFormat;
  }

  const schema = outputSchema || output_schema;
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

// ── Main invocation ──────────────────────────────────────────────────────────

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  const config = resolveLLMConfig();

  const {
    messages,
    tools,
    toolChoice,
    tool_choice,
    outputSchema,
    output_schema,
    responseFormat,
    response_format,
    model,
  } = params;

  const payload: Record<string, unknown> = {
    model: model || config.model,
    messages: messages.map(normalizeMessage),
  };

  if (tools && tools.length > 0) {
    payload.tools = tools;
  }

  const normalizedToolChoice = normalizeToolChoice(toolChoice || tool_choice, tools);
  if (normalizedToolChoice) {
    payload.tool_choice = normalizedToolChoice;
  }

  const maxTokens = params.maxTokens ?? params.max_tokens ?? 32768;
  payload.max_tokens = maxTokens;

  const normalizedResponseFormat = normalizeResponseFormat({
    responseFormat,
    response_format,
    outputSchema,
    output_schema,
  });

  if (normalizedResponseFormat) {
    payload.response_format = normalizedResponseFormat;
  }

  const url = `${config.baseUrl}/chat/completions`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `LLM invoke failed: ${response.status} ${response.statusText} – ${errorText}`
    );
  }

  return (await response.json()) as InvokeResult;
}
