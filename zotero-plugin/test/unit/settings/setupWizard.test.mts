import assert from "node:assert/strict";
import test from "node:test";
import { CorpusEstimator } from "../../../src/application/corpusEstimator.ts";
import type { ModelSettings } from "../../../src/infrastructure/settings/preferences.ts";
import { SetupWizard } from "../../../src/ui/settings/setupWizard.ts";

const settings: ModelSettings = {
  embeddingProvider: "openai-compatible",
  embeddingBaseURL: "https://models.example.com/v1",
  embeddingAPIKey: "secret",
  embeddingModel: "embedding-test",
  embeddingBatchSize: 32,
  allowInsecureLocalhost: false,
  llmEnabled: false,
  llmProvider: "openai-compatible",
  llmBaseURL: "https://models.example.com/v1",
  llmAPIKey: "",
  llmModel: "",
  networkTimeoutMs: 30_000,
};

test("corpus estimate uses only a count and declared outbound fields", async () => {
  let countCalls = 0;
  const estimator = new CorpusEstimator({
    async countEligiblePapers() {
      countCalls += 1;
      return 65;
    },
  });

  const estimate = await estimator.estimate(32);

  assert.equal(countCalls, 1);
  assert.equal(estimate.eligiblePaperCount, 65);
  assert.equal(estimate.estimatedEmbeddingBatches, 3);
  assert.equal(estimate.estimatedTokens, 20_800);
  assert.deepEqual(estimate.fieldsSent, ["title", "abstract"]);
  assert.equal(JSON.stringify(estimate).includes("paper title"), false);
});

test("wizard confirmation persists settings then enqueues one initial profile task", async () => {
  const events: string[] = [];
  const values = new Map<string, unknown>();
  const wizard = new SetupWizard({
    estimator: new CorpusEstimator({
      async countEligiblePapers() {
        return 12;
      },
    }),
    preferences: {
      saveModelSettings(value: ModelSettings) {
        assert.equal(value.embeddingModel, "embedding-test");
        events.push("save-settings");
      },
      set(key: string, value: unknown) {
        values.set(key, value);
        events.push("setup-complete");
      },
    } as never,
    async enqueueInitialProfileBuild(request) {
      events.push("enqueue-profile");
      assert.equal(request.estimatedPaperCount, 12);
      assert.equal(request.requestedAt, "2026-08-27T08:00:00.000Z");
    },
    now: () => new Date("2026-08-27T08:00:00.000Z"),
  });

  await assert.rejects(() => wizard.confirm(settings), /先估算/);
  await wizard.inspectCorpus(32);
  await wizard.confirm(settings);

  assert.deepEqual(events, [
    "save-settings",
    "enqueue-profile",
    "setup-complete",
  ]);
  assert.equal(values.get("setupComplete"), true);
});
