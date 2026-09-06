import assert from "node:assert/strict";
import test from "node:test";
import { formatFailure } from "../../../src/ui/settings/settingsController.ts";

test("SiliconFlow connection failures provide actionable provider-specific advice", () => {
  const cases = [
    [401, "API Key"],
    [403, "模型权限"],
    [404, "精确模型 ID"],
    [429, "速率或额度"],
  ] as const;

  for (const [status, expectedAdvice] of cases) {
    const message = formatFailure(
      "Embedding",
      {
        code: "http-error",
        status,
        message: `模型服务返回 HTTP ${status}`,
        url: "https://api.siliconflow.cn/v1/embeddings",
      },
      "siliconflow",
      "BAAI/bge-m3",
    );

    assert.match(message, new RegExp(expectedAdvice));
    assert.match(message, /模型：BAAI\/bge-m3/);
    assert.doesNotMatch(message, /Bearer|secret|siliconflow-key/);
  }
});

test("generic connection failures retain the provider and model context", () => {
  const message = formatFailure(
    "LLM",
    {
      code: "http-error",
      status: 500,
      message: "模型服务返回 HTTP 500",
      url: "https://api.siliconflow.cn/v1/chat/completions",
    },
    "siliconflow",
    "Qwen/Qwen3-8B",
  );

  assert.match(message, /模型：Qwen\/Qwen3-8B/);
  assert.match(message, /请稍后重试或检查服务端日志/);
});
