import { assert } from "chai";
import { config } from "../../package.json";
import { DEFAULT_RANKING_WEIGHTS } from "../../src/domain/ranking/defaultWeights";
import { constrainWeights } from "../../src/domain/feedback/weightConstraints";
import { RankingWeightRepository } from "../../src/infrastructure/storage/weightRepository";
import type { PluginDatabase } from "../../src/infrastructure/storage/pluginDatabase";

describe("ranking weight repository", function () {
  it("publishes and rolls back versioned constrained weights", async function () {
    const addon = Zotero[config.addonInstance] as unknown as {
      data: { database?: PluginDatabase };
    };
    const database = addon.data.database!;
    const connection = database.connection!;
    await connection.queryAsync("DELETE FROM ranking_weight_versions");
    const repository = new RankingWeightRepository(database);
    const defaults = await repository.ensureDefault(
      DEFAULT_RANKING_WEIGHTS,
      "2026-08-27T00:00:00Z",
    );
    const candidate = await repository.saveCandidate({
      weightVersionID: "test-weight-candidate",
      weights: constrainWeights({
        ...DEFAULT_RANKING_WEIGHTS,
        recentSimilarity: 0.4,
      }),
      trainingSampleCount: 30,
      updateReason: "test candidate",
      metrics: { accepted: true },
      parentVersionID: defaults.weightVersionID,
      now: "2026-08-27T00:00:01Z",
    });
    assert.equal(
      (await repository.getActive())?.weightVersionID,
      defaults.weightVersionID,
    );
    await repository.publish(candidate.weightVersionID);
    assert.equal(
      (await repository.getActive())?.weightVersionID,
      candidate.weightVersionID,
    );
    const rollback = await repository.rollback(
      defaults.weightVersionID,
      "2026-08-27T00:00:02Z",
    );
    assert.equal(rollback.isActive, true);
    assert.deepEqual(rollback.weights, defaults.weights);
    assert.equal(rollback.parentVersionID, defaults.weightVersionID);
    assert.equal(rollback.rollbackOfVersionID, candidate.weightVersionID);
    await connection.queryAsync("DELETE FROM ranking_weight_versions");
  });
});
