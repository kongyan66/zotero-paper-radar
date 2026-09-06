import {
  HttpTransport,
  NetworkRequestError,
  validateServiceBaseURL,
} from "../network/httpTransport.ts";
import {
  getModelProviderDefinition,
  normalizeModelProvider,
  validateModelProviderBaseURL,
  type ModelProvider,
} from "./modelProvider.ts";
import type { PaperEmbeddingInput } from "./openAIEmbeddingClient.ts";

export interface ChatSummaryResult {
  readonly model: string;
  readonly text: string;
  readonly latencyMs: number;
}

interface OpenAIChatClientOptions {
  readonly provider?: ModelProvider;
  readonly enabled: boolean;
  readonly baseURL: string;
  readonly apiKey: string;
  readonly model: string;
  readonly allowInsecureLocalhost?: boolean;
  readonly transport?: HttpTransport;
}

interface ChatCompletionResponse {
  readonly model?: string;
  readonly choices?: readonly {
    readonly message?: { readonly content?: string };
  }[];
}

export class OpenAIChatClient {
  public readonly provider: ModelProvider;
  public readonly enabled: boolean;
  public readonly model: string;
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly transport: HttpTransport;

  constructor(options: OpenAIChatClientOptions) {
    this.enabled = options.enabled;
    this.provider = normalizeModelProvider(options.provider);
    validateModelProviderBaseURL(this.provider, options.baseURL);
    const baseURL = validateServiceBaseURL(
      options.baseURL,
      options.allowInsecureLocalhost ?? false,
    );
    this.endpoint = new URL("chat/completions", baseURL.href).href;
    this.apiKey = options.apiKey.trim();
    this.model = options.model.trim();
    this.transport = options.transport ?? new HttpTransport();
  }

  async generateChineseSummary(
    paper: PaperEmbeddingInput & { readonly prompt?: string },
    signal?: AbortSignal,
  ): Promise<ChatSummaryResult> {
    if (!this.enabled) {
      throw new NetworkRequestError("llm-disabled", "LLM 摘要功能未启用");
    }
    if (!this.model) {
      throw new NetworkRequestError("invalid-url", "LLM 模型名称不能为空");
    }
    const response = await this.transport.requestJSON<ChatCompletionResponse>({
      url: this.endpoint,
      serviceName: getModelProviderDefinition(this.provider).label,
      method: "POST",
      headers: createHeaders(this.apiKey),
      body: JSON.stringify({
        model: this.model,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "只根据输入内容输出三段中文：研究问题、主要方法、摘要报告结果。不得补充原文没有的信息。",
          },
          {
            role: "user",
            content:
              paper.prompt ??
              `Title: ${paper.title.trim()}\nAbstract: ${paper.abstract.trim()}`,
          },
        ],
      }),
      signal,
    });
    const text = response.data.choices?.[0]?.message?.content?.trim() ?? "";
    if (!text) {
      throw new NetworkRequestError(
        "empty-model-response",
        "LLM 返回了空摘要，请检查模型兼容性",
      );
    }
    return {
      model: response.data.model?.trim() || this.model,
      text,
      latencyMs: response.latencyMs,
    };
  }
}

function createHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  return headers;
}
