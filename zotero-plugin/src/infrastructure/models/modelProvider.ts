import { NetworkRequestError } from "../network/httpTransport.ts";
import type { ModelProvider } from "../../shared/modelProvider.ts";

export type { ModelProvider } from "../../shared/modelProvider.ts";

export type ModelCapability = "embedding" | "llm";

export interface ModelSuggestion {
  readonly value: string;
  readonly label: string;
}

export interface ModelProviderDefinition {
  readonly id: ModelProvider;
  readonly label: string;
  readonly defaultBaseURL: string;
  readonly embeddingSuggestions: readonly ModelSuggestion[];
  readonly llmSuggestions: readonly ModelSuggestion[];
  readonly documentationURL?: string;
  readonly embeddingDocumentationURL?: string;
  readonly llmDocumentationURL?: string;
  readonly embeddingHelp: string;
  readonly llmHelp: string;
}

const OPENAI_EMBEDDING_DOC =
  "https://platform.openai.com/docs/guides/embeddings";
const ARK_EMBEDDING_DOC =
  "https://api.volcengine.com/api-docs/view?action=Embeddings&serviceCode=ark&version=2024-01-01";
const ARK_CHAT_DOC =
  "https://api.volcengine.com/api-docs/view?action=ChatCompletions&serviceCode=ark&version=2024-01-01";
const SILICONFLOW_EMBEDDING_DOC =
  "https://api-docs.siliconflow.cn/docs/api/embeddings-post";
const SILICONFLOW_CHAT_DOC =
  "https://api-docs.siliconflow.cn/docs/api/chat-completions-post";

export const MODEL_PROVIDER_DEFINITIONS: readonly ModelProviderDefinition[] = [
  {
    id: "openai-compatible",
    label: "自定义 OpenAI-compatible",
    defaultBaseURL: "https://api.openai.com/v1",
    embeddingSuggestions: [
      {
        value: "text-embedding-3-small",
        label: "OpenAI text-embedding-3-small",
      },
    ],
    llmSuggestions: [],
    documentationURL: OPENAI_EMBEDDING_DOC,
    embeddingHelp: "填写兼容 OpenAI Embeddings API 的服务地址和模型名。",
    llmHelp: "填写兼容 OpenAI Chat Completions API 的服务地址和模型名。",
  },
  {
    id: "siliconflow",
    label: "硅基流动",
    defaultBaseURL: "https://api.siliconflow.cn/v1",
    embeddingSuggestions: [
      {
        value: "BAAI/bge-m3",
        label: "BAAI/bge-m3（推荐，多语言）",
      },
      {
        value: "Qwen/Qwen3-Embedding-0.6B",
        label: "Qwen/Qwen3-Embedding-0.6B",
      },
      {
        value: "Qwen/Qwen3-Embedding-4B",
        label: "Qwen/Qwen3-Embedding-4B",
      },
      {
        value: "BAAI/bge-large-zh-v1.5",
        label: "BAAI/bge-large-zh-v1.5（中文）",
      },
    ],
    llmSuggestions: [
      {
        value: "Qwen/Qwen3-8B",
        label: "Qwen/Qwen3-8B（推荐）",
      },
      {
        value: "Qwen/Qwen2.5-7B-Instruct",
        label: "Qwen/Qwen2.5-7B-Instruct",
      },
      {
        value: "deepseek-ai/DeepSeek-V3.2",
        label: "deepseek-ai/DeepSeek-V3.2",
      },
    ],
    embeddingDocumentationURL: SILICONFLOW_EMBEDDING_DOC,
    llmDocumentationURL: SILICONFLOW_CHAT_DOC,
    embeddingHelp:
      "使用硅基流动账户 API Key；模型字段填写控制台中的 Embedding 模型 ID。",
    llmHelp: "使用硅基流动账户 API Key；模型字段填写控制台中的 Chat 模型 ID。",
  },
  {
    id: "volcengine-ark",
    label: "火山方舟普通 API",
    defaultBaseURL: "https://ark.cn-beijing.volces.com/api/v3",
    embeddingSuggestions: [
      {
        value: "doubao-embedding-text-240715",
        label: "doubao-embedding-text-240715（方舟文本模型）",
      },
      {
        value: "doubao-embedding",
        label: "doubao-embedding（方舟文本模型）",
      },
      {
        value: "doubao-embedding-large",
        label: "doubao-embedding-large（方舟文本模型）",
      },
      {
        value: "doubao-embedding-text-240515",
        label: "doubao-embedding-text-240515（旧版 API 示例）",
      },
    ],
    llmSuggestions: [
      {
        value: "doubao-seed-2-0-pro-260215",
        label: "doubao-seed-2-0-pro-260215（官方示例）",
      },
    ],
    documentationURL: ARK_EMBEDDING_DOC,
    embeddingHelp: "模型字段可填写方舟 Model ID 或推理接入点 ID（ep-...）。",
    llmHelp: "模型字段可填写方舟 Model ID 或推理接入点 ID（ep-...）。",
  },
  {
    id: "volcengine-ark-coding",
    label: "火山方舟 Coding Plan",
    defaultBaseURL: "https://ark.cn-beijing.volces.com/api/coding/v3",
    embeddingSuggestions: [
      {
        value: "doubao-embedding-vision",
        label: "doubao-embedding-vision（Coding Plan）",
      },
    ],
    llmSuggestions: [
      {
        value: "doubao-seed-2-0-pro-260215",
        label: "doubao-seed-2-0-pro-260215（Coding Plan）",
      },
    ],
    documentationURL: ARK_CHAT_DOC,
    embeddingHelp: "Coding Plan 使用专属地址；本插件当前只发送标题和摘要文本。",
    llmHelp: "使用 Coding Plan 支持的模型名，或填写账号中的 Endpoint ID。",
  },
] as const;

const DEFINITIONS_BY_ID = new Map(
  MODEL_PROVIDER_DEFINITIONS.map((definition) => [definition.id, definition]),
);

export function isModelProvider(value: unknown): value is ModelProvider {
  return (
    typeof value === "string" && DEFINITIONS_BY_ID.has(value as ModelProvider)
  );
}

export function normalizeModelProvider(value: unknown): ModelProvider {
  return isModelProvider(value) ? value : "openai-compatible";
}

export function getModelProviderDefinition(
  provider: unknown,
): ModelProviderDefinition {
  return DEFINITIONS_BY_ID.get(normalizeModelProvider(provider))!;
}

export function getProviderSuggestions(
  provider: unknown,
  capability: ModelCapability,
): readonly ModelSuggestion[] {
  const definition = getModelProviderDefinition(provider);
  return capability === "embedding"
    ? definition.embeddingSuggestions
    : definition.llmSuggestions;
}

export function validateModelProviderBaseURL(
  provider: unknown,
  baseURL: string,
): void {
  const normalizedProvider = normalizeModelProvider(provider);
  if (normalizedProvider === "openai-compatible") return;

  let url: URL;
  try {
    url = new URL(baseURL.trim());
  } catch {
    throw new NetworkRequestError("invalid-url", "服务地址格式无效", {
      url: baseURL,
    });
  }

  const definition = getModelProviderDefinition(normalizedProvider);
  const expected = new URL(definition.defaultBaseURL);
  const actualPath = url.pathname.replace(/\/+$/, "");
  const expectedPath = expected.pathname.replace(/\/+$/, "");
  if (
    url.protocol !== expected.protocol ||
    url.hostname.toLowerCase() !== expected.hostname.toLowerCase() ||
    url.port !== expected.port ||
    actualPath !== expectedPath
  ) {
    const providerName = definition.label;
    throw new NetworkRequestError(
      "invalid-url",
      `${providerName} 应使用 ${definition.defaultBaseURL}，自定义代理请改选“自定义 OpenAI-compatible”`,
      { url: baseURL },
    );
  }
}
