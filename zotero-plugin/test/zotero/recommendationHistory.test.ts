import { assert } from "chai";
import { config } from "../../package.json";
import type { ArxivCandidate } from "../../src/domain/model";
import {
  CandidateRepository,
  type StoredCandidate,
} from "../../src/infrastructure/storage/candidateRepository";
import type { PluginDatabase } from "../../src/infrastructure/storage/pluginDatabase";
import { RecommendationRepository } from "../../src/infrastructure/storage/recommendationRepository";

interface HistoryTestAddon {
  data: { database?: PluginDatabase };
}

describe("recommendation history repository", function () {
  it("groups recent runs by local day and prunes records outside the window", async function () {
    const database = (
      Zotero[config.addonInstance] as unknown as HistoryTestAddon
    ).data.database!;
    const connection = database.connection!;
    const recommendations = new RecommendationRepository(database);
    const candidates = new CandidateRepository(database);
    const fixtureID = `history-${Date.now().toString(36)}`;
    const generationID = `generation-${fixtureID}`;
    const profileVersionID = `profile-${fixtureID}`;
    const runIDs = [
      "history-today-old",
      "history-today-new",
      "history-yesterday",
      "history-expired",
    ];
    try {
      await connection.queryAsync(
        `INSERT INTO embedding_generations (
          generation_id, base_url_hash, model_name, vector_dimensions,
          normalization_version, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          generationID,
          "history-test",
          "history-test",
          3,
          "l2-v1",
          "published",
          "2026-09-04T00:00:00.000Z",
        ],
      );
      await connection.queryAsync(
        `INSERT INTO profile_versions (
          profile_version_id, corpus_fingerprint, algorithm_config_json,
          generation_id, creation_reason, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          profileVersionID,
          "history-test",
          "{}",
          generationID,
          "history-test",
          "published",
          "2026-09-04T00:00:00.000Z",
        ],
      );
      await createPublishedRun(
        recommendations,
        candidates,
        "history-today-old",
        "2026-09-04T02:00:00.000Z",
        generationID,
        profileVersionID,
        [paper("2609.00001")],
      );
      await createPublishedRun(
        recommendations,
        candidates,
        "history-today-new",
        "2026-09-04T04:00:00.000Z",
        generationID,
        profileVersionID,
        [paper("2609.00002")],
      );
      await createPublishedRun(
        recommendations,
        candidates,
        "history-yesterday",
        "2026-09-03T04:00:00.000Z",
        generationID,
        profileVersionID,
        [paper("2609.00003")],
      );
      await createPublishedRun(
        recommendations,
        candidates,
        "history-expired",
        "2026-08-28T04:00:00.000Z",
        generationID,
        profileVersionID,
        [paper("2609.00004")],
      );

      const history = await recommendations.listHistoryDays(
        new Date("2026-09-04T12:00:00.000Z"),
      );
      assert.deepEqual(
        history.map((day) => [day.dayKey, day.runID, day.candidateCount]),
        [
          ["2026-09-04", "history-today-new", 1],
          ["2026-09-03", "history-yesterday", 1],
        ],
        JSON.stringify(history),
      );
      const recommendedIDs = await candidates.listRecommendedArxivIDsSince(
        "2026-09-03T00:00:00.000Z",
      );
      assert.deepEqual(
        recommendedIDs,
        ["2609.00001", "2609.00002", "2609.00003"],
        JSON.stringify(recommendedIDs),
      );
      const pruned = await recommendations.pruneBefore(
        "2026-08-29T00:00:00.000Z",
      );
      assert.equal(pruned, 1, `pruned=${String(pruned)}`);
      const expiredCount = await connection.valueQueryAsync(
        "SELECT COUNT(*) FROM recommendation_runs WHERE run_id = ?",
        "history-expired",
      );
      assert.equal(expiredCount, 0, `expired=${String(expiredCount)}`);
    } finally {
      await connection.queryAsync(
        `DELETE FROM recommendation_candidates WHERE run_id IN (${runIDs
          .map(() => "?")
          .join(",")})`,
        runIDs,
      );
      await connection.queryAsync(
        `DELETE FROM recommendation_runs WHERE run_id IN (${runIDs
          .map(() => "?")
          .join(",")})`,
        runIDs,
      );
      await connection.queryAsync(
        "DELETE FROM profile_versions WHERE profile_version_id = ?",
        profileVersionID,
      );
      await connection.queryAsync(
        "DELETE FROM embedding_generations WHERE generation_id = ?",
        generationID,
      );
    }
  });
});

async function createPublishedRun(
  recommendations: RecommendationRepository,
  candidates: CandidateRepository,
  runID: string,
  createdAt: string,
  generationID: string,
  profileVersionID: string,
  papers: readonly ArxivCandidate[],
): Promise<void> {
  await recommendations.createRun({
    runID,
    queryScope: { categories: ["cs.CV"], count: papers.length },
    targetProfileIDs: [],
    generationID,
    profileVersionID,
    now: createdAt,
  });
  await candidates.saveRunCandidates(
    runID,
    papers.map((candidate, index) => storedCandidate(candidate, index + 1)),
  );
  await recommendations.completeRun(runID, {}, createdAt);
}

function paper(arxivId: string): ArxivCandidate {
  return {
    arxivId,
    version: 1,
    title: arxivId,
    abstract: "Abstract",
    authors: [],
    categories: ["cs.CV"],
    submittedAt: "2026-09-04T00:00:00.000Z",
    abstractUrl: `https://arxiv.org/abs/${arxivId}`,
    pdfUrl: `https://arxiv.org/pdf/${arxivId}.pdf`,
  };
}

function storedCandidate(
  candidate: ArxivCandidate,
  rank: number,
): StoredCandidate {
  return {
    ...candidate,
    profileScores: {},
    scoreComponents: {
      recentSimilarity: 0,
      longTermSimilarity: 0,
      representativeSimilarity: 0,
      keywordMatch: 0,
      manualPriority: 0,
      negativeSimilarity: 0,
      rawScore: 0,
      diversityAdjustment: 0,
      rerankedScore: 0,
      displayScore: 0,
    },
    explainability: {},
    finalScore: 0,
    rank,
    displayStatus: "new",
  };
}
