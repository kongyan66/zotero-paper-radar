import type { ArxivCandidate } from "../domain/model.ts";
import {
  buildChineseSummaryPrompt,
  normalizeChineseSummary,
  SUMMARY_LANGUAGE,
  SUMMARY_PROMPT_VERSION,
} from "../domain/summaries/summaryPrompt.ts";
import type { SummaryRepository } from "../infrastructure/storage/summaryRepository.ts";

export interface ChineseSummaryClient {
  readonly enabled: boolean;
  readonly model: string;
  generateChineseSummary(
    input: {
      readonly title: string;
      readonly abstract: string;
      readonly prompt?: string;
    },
    signal?: AbortSignal,
  ): Promise<{ readonly text: string; readonly latencyMs: number }>;
}

export interface SummaryResult {
  readonly text: string;
  readonly source: "arxiv" | "llm-cache" | "llm";
  readonly model?: string;
  readonly latencyMs?: number;
  readonly fallback: boolean;
  readonly fallbackReason?: string;
}

export class SummaryService {
  readonly #client: ChineseSummaryClient;
  readonly #repository: SummaryRepository;
  readonly #now: () => Date;

  constructor(options: {
    readonly client: ChineseSummaryClient;
    readonly repository: SummaryRepository;
    readonly now?: () => Date;
  }) {
    this.#client = options.client;
    this.#repository = options.repository;
    this.#now = options.now ?? (() => new Date());
  }

  async summarize(
    candidate: ArxivCandidate,
    signal?: AbortSignal,
  ): Promise<SummaryResult> {
    if (!this.#client.enabled) return original(candidate);
    const model = this.#client.model.trim();
    if (!model) return original(candidate, "LLM 模型名称为空");
    const key = cacheKey(candidate, model);
    const cached = await this.#repository.get(key);
    if (cached)
      return { text: cached, source: "llm-cache", model, fallback: false };
    try {
      const response = await this.#client.generateChineseSummary(
        {
          title: candidate.title,
          abstract: candidate.abstract,
          prompt: buildChineseSummaryPrompt(
            candidate.title,
            candidate.abstract,
          ),
        },
        signal,
      );
      const normalized = normalizeChineseSummary(response.text);
      if (!normalized) {
        return original(
          candidate,
          "LLM 返回内容不是完整的三段中文摘要，已显示 arXiv 原摘要",
        );
      }
      await this.#repository.save({
        ...key,
        summary: normalized,
        createdAt: this.#now().toISOString(),
      });
      return {
        text: normalized,
        source: "llm",
        model,
        latencyMs: response.latencyMs,
        fallback: false,
      };
    } catch (error) {
      return original(candidate, fallbackReason(error));
    }
  }

  async loadCached(candidate: ArxivCandidate): Promise<SummaryResult> {
    if (!this.#client.enabled) return original(candidate);
    const model = this.#client.model.trim();
    if (!model) return original(candidate, "LLM 模型名称为空");
    const cached = await this.#repository.get(cacheKey(candidate, model));
    if (cached) {
      return { text: cached, source: "llm-cache", model, fallback: false };
    }
    return original(candidate, "尚无中文摘要缓存，刷新推荐后将尝试生成");
  }

  async summarizeTop(
    candidates: readonly ArxivCandidate[],
    topN: number,
    signal?: AbortSignal,
  ): Promise<readonly SummaryResult[]> {
    const results: SummaryResult[] = [];
    for (const candidate of candidates.slice(0, Math.max(0, topN))) {
      if (signal?.aborted) break;
      results.push(await this.summarize(candidate, signal));
    }
    return results;
  }
}

function cacheKey(candidate: ArxivCandidate, model: string) {
  return {
    arxivID: candidate.arxivId,
    arxivVersion: candidate.version,
    model,
    promptVersion: SUMMARY_PROMPT_VERSION,
    language: SUMMARY_LANGUAGE,
  };
}

function original(
  candidate: ArxivCandidate,
  fallbackReason?: string,
): SummaryResult {
  return {
    text: candidate.abstract,
    source: "arxiv",
    fallback: true,
    ...(fallbackReason ? { fallbackReason } : {}),
  };
}

function fallbackReason(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return `LLM 调用失败：${error.message.trim().slice(0, 240)}`;
  }
  return "LLM 调用失败，已显示 arXiv 原摘要";
}
