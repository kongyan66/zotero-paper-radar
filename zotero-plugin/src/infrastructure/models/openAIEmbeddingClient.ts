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

export interface PaperEmbeddingInput {
  readonly title: string;
  readonly abstract: string;
}

export interface EmbeddingBatchResult {
  readonly model: string;
  readonly dimensions: number;
  readonly vectors: readonly (readonly number[])[];
  readonly latencyMs: number;
}

interface OpenAIEmbeddingClientOptions {
  readonly provider?: ModelProvider;
  readonly baseURL: string;
  readonly apiKey: string;
  readonly model: string;
  readonly allowInsecureLocalhost?: boolean;
  readonly transport?: HttpTransport;
}

interface EmbeddingResponse {
  readonly model?: string;
  readonly data?: readonly {
    readonly index?: number;
    readonly embedding?: readonly number[];
  }[];
}

export class OpenAIEmbeddingClient {
  public readonly provider: ModelProvider;
  public readonly model: string;
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly transport: HttpTransport;

  constructor(options: OpenAIEmbeddingClientOptions) {
    this.provider = normalizeModelProvider(options.provider);
    validateModelProviderBaseURL(this.provider, options.baseURL);
    const baseURL = validateServiceBaseURL(
      options.baseURL,
      options.allowInsecureLocalhost ?? false,
    );
    this.endpoint = new URL("embeddings", baseURL.href).href;
    this.apiKey = options.apiKey.trim();
    this.model = requireSetting(options.model, "Embedding 模型名称不能为空");
    this.transport = options.transport ?? new HttpTransport();
  }

  async embedDocuments(
    documents: readonly PaperEmbeddingInput[],
    signal?: AbortSignal,
  ): Promise<EmbeddingBatchResult> {
    if (documents.length === 0) {
      throw new NetworkRequestError(
        "invalid-model-response",
        "Embedding 输入不能为空",
      );
    }
    const input = documents.map(
      (document) =>
        `Title: ${document.title.trim()}\nAbstract: ${document.abstract.trim()}`,
    );
    const response = await this.transport.requestJSON<EmbeddingResponse>({
      url: this.endpoint,
      serviceName: getModelProviderDefinition(this.provider).label,
      method: "POST",
      headers: createHeaders(this.apiKey),
      body: JSON.stringify({ model: this.model, input }),
      signal,
    });
    const vectors = validateVectors(response.data, documents.length);
    return {
      model: response.data.model?.trim() || this.model,
      dimensions: vectors[0].length,
      vectors,
      latencyMs: response.latencyMs,
    };
  }
}

function validateVectors(
  response: EmbeddingResponse,
  expectedCount: number,
): readonly (readonly number[])[] {
  if (!Array.isArray(response.data) || response.data.length !== expectedCount) {
    throw invalidResponse("Embedding 返回数量与输入不一致");
  }
  const ordered = [...response.data].sort(
    (left, right) => (left.index ?? 0) - (right.index ?? 0),
  );
  const vectors = ordered.map((entry) => entry.embedding);
  const dimensions = vectors[0]?.length ?? 0;
  if (
    dimensions === 0 ||
    vectors.some(
      (vector) =>
        !Array.isArray(vector) ||
        vector.length !== dimensions ||
        vector.some((value) => !Number.isFinite(value)),
    )
  ) {
    throw invalidResponse("Embedding 向量为空、维度不一致或包含无效数值");
  }
  return vectors as readonly (readonly number[])[];
}

function createHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  return headers;
}

function requireSetting(value: string, message: string): string {
  const normalized = value.trim();
  if (!normalized) throw new NetworkRequestError("invalid-url", message);
  return normalized;
}

function invalidResponse(message: string): NetworkRequestError {
  return new NetworkRequestError("invalid-model-response", message);
}
