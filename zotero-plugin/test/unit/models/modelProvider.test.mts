import assert from "node:assert/strict";
import test from "node:test";
import {
  getModelProviderDefinition,
  getProviderSuggestions,
  normalizeModelProvider,
  validateModelProviderBaseURL,
} from "../../../src/infrastructure/models/modelProvider.ts";
import { NetworkRequestError } from "../../../src/infrastructure/network/httpTransport.ts";

test("provider registry exposes independent Ark presets", () => {
  const embedding = getModelProviderDefinition("volcengine-ark");
  const coding = getModelProviderDefinition("volcengine-ark-coding");

  assert.equal(
    embedding.defaultBaseURL,
    "https://ark.cn-beijing.volces.com/api/v3",
  );
  assert.equal(
    coding.defaultBaseURL,
    "https://ark.cn-beijing.volces.com/api/coding/v3",
  );
  assert.equal(
    getProviderSuggestions("volcengine-ark", "embedding")[0]?.value,
    "doubao-embedding-text-240715",
  );
  assert.equal(
    getProviderSuggestions("volcengine-ark-coding", "embedding")[0]?.value,
    "doubao-embedding-vision",
  );
});

test("provider registry exposes editable SiliconFlow presets", () => {
  const siliconFlow = getModelProviderDefinition("siliconflow");

  assert.equal(siliconFlow.label, "硅基流动");
  assert.equal(siliconFlow.defaultBaseURL, "https://api.siliconflow.cn/v1");
  assert.equal(
    getProviderSuggestions("siliconflow", "embedding")[0]?.value,
    "BAAI/bge-m3",
  );
  assert.equal(
    getProviderSuggestions("siliconflow", "llm")[0]?.value,
    "Qwen/Qwen3-8B",
  );
  assert.equal(
    siliconFlow.embeddingDocumentationURL,
    "https://api-docs.siliconflow.cn/docs/api/embeddings-post",
  );
  assert.equal(
    siliconFlow.llmDocumentationURL,
    "https://api-docs.siliconflow.cn/docs/api/chat-completions-post",
  );
  assert.equal(normalizeModelProvider("siliconflow"), "siliconflow");
});

test("unknown providers preserve custom OpenAI-compatible behavior", () => {
  assert.equal(normalizeModelProvider("legacy-provider"), "openai-compatible");
  assert.equal(
    getModelProviderDefinition("legacy-provider").defaultBaseURL,
    "https://api.openai.com/v1",
  );
});

test("Ark providers reject a mismatched Base URL with actionable diagnostics", () => {
  assert.throws(
    () =>
      validateModelProviderBaseURL(
        "volcengine-ark",
        "https://ark.cn-beijing.volces.com/api/coding/v3",
      ),
    (error: unknown) =>
      error instanceof NetworkRequestError &&
      error.code === "invalid-url" &&
      error.message.includes("普通 API"),
  );
  assert.doesNotThrow(() =>
    validateModelProviderBaseURL(
      "volcengine-ark-coding",
      "https://ark.cn-beijing.volces.com/api/coding/v3/",
    ),
  );
});

test("SiliconFlow accepts its canonical Base URL and rejects other providers", () => {
  assert.doesNotThrow(() =>
    validateModelProviderBaseURL(
      "siliconflow",
      "https://api.siliconflow.cn/v1/",
    ),
  );
  assert.throws(
    () =>
      validateModelProviderBaseURL(
        "siliconflow",
        "https://api.siliconflow.cn/v1/embeddings",
      ),
    (error: unknown) =>
      error instanceof NetworkRequestError &&
      error.code === "invalid-url" &&
      error.message.includes("硅基流动"),
  );
});
