import assert from "node:assert/strict";
import test from "node:test";
import {
  createDiagnosticsExport,
  RunLogger,
} from "../../../src/infrastructure/diagnostics/runLogger.ts";
import { redactDiagnostics } from "../../../src/infrastructure/diagnostics/redactor.ts";

test("default diagnostics export removes secrets and user content but keeps replay data", () => {
  const logger = new RunLogger();
  logger.record({
    type: "error",
    errorCode: "http-error",
    detail: {
      authorization: "Bearer sk-test-secret",
      url: "https://example.test/?token=secret",
    },
  });
  const result = createDiagnosticsExport(
    {
      environment: { apiKey: "sk-test-secret", model: "local" },
      profiles: [{ name: "Document AI", memberCount: 3 }],
      candidates: [
        {
          arxivID: "2608.24845",
          title: "Private title",
          abstract: "Private abstract",
          scoreComponents: { recentSimilarity: 0.9 },
          finalScore: 0.8,
        },
      ],
      feedback: [{ action: "saved", collectionName: "Private folder" }],
      operations: [{ path: "/Users/private/profile", stage: "scoring" }],
    },
    logger,
    { generatedAt: "2026-08-27T00:00:00Z" },
  );
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(
    serialized,
    /sk-test-secret|Private title|Private abstract|Private folder|\/Users\/private/,
  );
  assert.match(serialized, /2608\.24845/);
  assert.match(serialized, /recentSimilarity/);
  assert.match(serialized, /http-error/);
  assert.match(serialized, /REDACTED/);
});

test("explicit samples are capped to three candidates and five hundred characters", () => {
  const result = createDiagnosticsExport(
    {
      environment: {},
      profiles: [],
      candidates: Array.from({ length: 5 }, (_, index) => ({
        arxivID: `2608.0000${index}`,
        title: "T".repeat(600),
        abstract: "A".repeat(600),
      })),
      feedback: [],
      operations: [],
    },
    new RunLogger(),
    { includeSampleContent: true },
  );
  assert.equal((result.candidates as readonly unknown[]).length, 3);
  const first = (result.candidates as readonly Record<string, unknown>[])[0];
  assert.equal(String(first.title).length, 503);
  assert.equal(String(first.abstract).length, 503);
});

test("sample content requires explicit export opt-in and still excludes credentials", () => {
  const value = redactDiagnostics(
    {
      title: "Allowed sample",
      abstract: "Allowed abstract",
      apiKey: "sk-never-export",
      path: "/private/path",
    },
    { includeSampleContent: true },
  );
  assert.deepEqual(value, {
    title: "Allowed sample",
    abstract: "Allowed abstract",
  });
});

test("nested JSON columns cannot bypass content and private-field redaction", () => {
  const value = redactDiagnostics({
    statistics_json: JSON.stringify({
      keywords: ["document AI"],
      representativeItemKeys: ["private-item"],
      primaryCollectionKey: "private-collection",
      memberCount: 4,
    }),
    score_components_json: JSON.stringify({
      title: "Private title",
      similarity: 0.9,
    }),
  });
  assert.deepEqual(value, {
    statistics_json: JSON.stringify({
      keywords: ["document AI"],
      memberCount: 4,
    }),
    score_components_json: JSON.stringify({ similarity: 0.9 }),
  });
});
