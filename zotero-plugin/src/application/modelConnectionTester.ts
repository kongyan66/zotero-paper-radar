import type { OpenAIEmbeddingClient } from "../infrastructure/models/openAIEmbeddingClient.ts";
import type { OpenAIChatClient } from "../infrastructure/models/openAIChatClient.ts";
import {
  NetworkRequestError,
  type NetworkDiagnostic,
} from "../infrastructure/network/httpTransport.ts";

export interface ConnectionCheck {
  readonly ok: boolean;
  readonly model?: string;
  readonly dimensions?: number;
  readonly latencyMs?: number;
  readonly error?: NetworkDiagnostic;
}

export interface LLMConnectionCheck {
  readonly status: "passed" | "failed" | "skipped";
  readonly model?: string;
  readonly latencyMs?: number;
  readonly error?: NetworkDiagnostic;
}

export interface ModelConnectionTestResult {
  readonly embedding: ConnectionCheck;
  readonly llm: LLMConnectionCheck;
}

interface ModelConnectionTesterOptions {
  readonly now?: () => number;
}

export class ModelConnectionTester {
  private readonly now: () => number;

  constructor(options: ModelConnectionTesterOptions = {}) {
    this.now = options.now ?? (() => Date.now());
  }

  async test(input: {
    embeddingClient: OpenAIEmbeddingClient;
    llmClient: OpenAIChatClient;
    signal?: AbortSignal;
  }): Promise<ModelConnectionTestResult> {
    const embedding = await this.testEmbedding(
      input.embeddingClient,
      input.signal,
    );
    const llm = input.llmClient.enabled
      ? await this.testLLM(input.llmClient, input.signal)
      : ({ status: "skipped" } satisfies LLMConnectionCheck);
    return { embedding, llm };
  }

  private async testEmbedding(
    client: OpenAIEmbeddingClient,
    signal?: AbortSignal,
  ): Promise<ConnectionCheck> {
    const startedAt = this.now();
    try {
      const result = await client.embedDocuments(
        [
          {
            title: "Model connection test",
            abstract: "A short sample used only for this connection test.",
          },
        ],
        signal,
      );
      return {
        ok: true,
        model: result.model,
        dimensions: result.dimensions,
        latencyMs: result.latencyMs || Math.max(0, this.now() - startedAt),
      };
    } catch (error) {
      return { ok: false, error: toDiagnostic(error) };
    }
  }

  private async testLLM(
    client: OpenAIChatClient,
    signal?: AbortSignal,
  ): Promise<LLMConnectionCheck> {
    const startedAt = this.now();
    try {
      const result = await client.generateChineseSummary(
        {
          title: "Model connection test",
          abstract: "This test text is not persisted after the request.",
        },
        signal,
      );
      return {
        status: "passed",
        model: result.model,
        latencyMs: result.latencyMs || Math.max(0, this.now() - startedAt),
      };
    } catch (error) {
      return { status: "failed", error: toDiagnostic(error) };
    }
  }
}

function toDiagnostic(error: unknown): NetworkDiagnostic {
  if (error instanceof NetworkRequestError) return error.toDiagnostic();
  return new NetworkRequestError(
    "network-failure",
    error instanceof Error ? error.message : "模型连接测试失败",
  ).toDiagnostic();
}
