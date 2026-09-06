import assert from "node:assert/strict";
import test from "node:test";
import { SummaryService } from "../../../src/application/summaryService.ts";
import type { ArxivCandidate } from "../../../src/domain/model.ts";

const candidate: ArxivCandidate = {
  arxivId: "2608.00001",
  version: 2,
  title: "Vision models for OCR",
  abstract: "We study document OCR and report improved recognition.",
  authors: [],
  categories: ["cs.CV"],
  submittedAt: "2026-08-26T00:00:00Z",
  abstractUrl: "https://arxiv.org/abs/2608.00001",
  pdfUrl: "https://arxiv.org/pdf/2608.00001v2.pdf",
};

class MemorySummaryRepository {
  readonly values = new Map<string, string>();
  async get(input: {
    arxivID: string;
    arxivVersion: number;
    model: string;
    promptVersion: string;
    language: string;
  }): Promise<string | undefined> {
    return this.values.get(JSON.stringify(input));
  }
  async save(entry: {
    arxivID: string;
    arxivVersion: number;
    model: string;
    promptVersion: string;
    language: string;
    summary: string;
  }): Promise<void> {
    this.values.set(
      JSON.stringify({
        arxivID: entry.arxivID,
        arxivVersion: entry.arxivVersion,
        model: entry.model,
        promptVersion: entry.promptVersion,
        language: entry.language,
      }),
      entry.summary,
    );
  }
}

test("LLM disabled returns the original arXiv abstract without a model call", async () => {
  let calls = 0;
  const service = new SummaryService({
    client: {
      enabled: false,
      model: "",
      generateChineseSummary: async () => {
        calls += 1;
        return { text: "", latencyMs: 0 };
      },
    },
    repository: new MemorySummaryRepository() as never,
  });
  const result = await service.summarize(candidate);
  assert.equal(result.source, "arxiv");
  assert.equal(result.text, candidate.abstract);
  assert.equal(calls, 0);
});

test("enabled summaries are limited to top N, require fixed sections, and are cached by version", async () => {
  let calls = 0;
  const repository = new MemorySummaryRepository();
  const service = new SummaryService({
    client: {
      enabled: true,
      model: "local-chat",
      generateChineseSummary: async () => {
        calls += 1;
        return {
          text: "<think>internal reasoning</think>\n### 研究问题\n识别文档文字。\n**研究方法:** 使用视觉模型。\n- 主要结果：识别效果提升。",
          latencyMs: 2,
        };
      },
    },
    repository: repository as never,
  });
  const results = await service.summarizeTop(
    [candidate, { ...candidate, arxivId: "2608.00002" }],
    1,
  );
  assert.equal(results.length, 1);
  assert.equal(results[0].source, "llm");
  assert.equal(
    results[0].text,
    "研究问题：识别文档文字。\n主要方法：使用视觉模型。\n摘要报告结果：识别效果提升。",
  );
  assert.equal(calls, 1);
  assert.equal((await service.loadCached(candidate)).source, "llm-cache");
  assert.equal(calls, 1);
});

test("empty, malformed, and failed LLM responses fall back without changing recommendation data", async () => {
  const service = new SummaryService({
    client: {
      enabled: true,
      model: "local-chat",
      generateChineseSummary: async () => ({
        text: "不符合格式",
        latencyMs: 1,
      }),
    },
    repository: new MemorySummaryRepository() as never,
  });
  const result = await service.summarize(candidate);
  assert.equal(result.fallback, true);
  assert.equal(result.text, candidate.abstract);
  assert.match(result.fallbackReason ?? "", /三段中文摘要/);
});

test("cache-only loading never calls the LLM and explains a missing summary", async () => {
  let calls = 0;
  const service = new SummaryService({
    client: {
      enabled: true,
      model: "local-chat",
      generateChineseSummary: async () => {
        calls += 1;
        throw new Error("must not run");
      },
    },
    repository: new MemorySummaryRepository() as never,
  });
  const result = await service.loadCached(candidate);
  assert.equal(result.source, "arxiv");
  assert.match(result.fallbackReason ?? "", /刷新推荐/);
  assert.equal(calls, 0);
});

test("LLM request failures keep recommendations and expose a safe reason", async () => {
  const service = new SummaryService({
    client: {
      enabled: true,
      model: "local-chat",
      generateChineseSummary: async () => {
        throw new Error("模型服务返回 HTTP 429");
      },
    },
    repository: new MemorySummaryRepository() as never,
  });
  const result = await service.summarize(candidate);
  assert.equal(result.source, "arxiv");
  assert.match(result.fallbackReason ?? "", /HTTP 429/);
});
