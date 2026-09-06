import { assert } from "chai";
import { config } from "../../package.json";
import { ProfileBuilder } from "../../src/domain/profiles/profileBuilder";
import { createModelFingerprint } from "../../src/domain/embeddings/modelFingerprint";
import { EmbeddingRepository } from "../../src/infrastructure/storage/embeddingRepository";
import { ProfileRepository } from "../../src/infrastructure/storage/profileRepository";
import type { PluginDatabase } from "../../src/infrastructure/storage/pluginDatabase";
import { zoteroPapers } from "../fixtures/papers";

interface ProfileRepositoryTestAddon {
  data: { database?: PluginDatabase };
}

describe("profile repository", function () {
  it("publishes a completed draft and retains protected versions during pruning", async function () {
    const database = (
      Zotero[config.addonInstance] as unknown as ProfileRepositoryTestAddon
    ).data.database!;
    const connection = database.connection!;
    const profileRepository = new ProfileRepository(database, {
      now: () => new Date("2026-08-27T10:30:00.000Z"),
    });
    const embeddingRepository = new EmbeddingRepository(database);
    const generation = createModelFingerprint({
      baseURL: "https://test.models.example/v1",
      model: "profile-repository-test",
      dimensions: 3,
      normalizationVersion: "l2-v1",
    });
    const build = new ProfileBuilder({
      seed: 2,
      now: () => new Date("2026-08-27T10:30:00.000Z"),
    }).build({
      papers: zoteroPapers,
      vectors: new Map([
        ["DOC00001", [1, 0, 0]],
        ["VISION01", [0, 1, 0]],
        ["LONGTAIL", [0, 0, 1]],
      ]),
      reason: "test",
    });
    const extraVersionIDs: string[] = [];
    try {
      await embeddingRepository.ensureGeneration(generation);
      await profileRepository.saveDraft(
        build,
        generation.generationID,
        zoteroPapers,
      );
      assert.equal(
        await connection.valueQueryAsync(
          "SELECT status FROM profile_versions WHERE profile_version_id = ?",
          build.versionId,
        ),
        "draft",
      );
      assert.equal(
        await connection.valueQueryAsync(
          "SELECT COUNT(*) FROM profiles WHERE profile_version_id = ?",
          build.versionId,
        ),
        2,
      );
      await profileRepository.publish(build.versionId);
      assert.equal(
        await profileRepository.getPublishedVersionID(),
        build.versionId,
      );
      const published = await profileRepository.getPublished();
      assert.exists(published);
      assert.lengthOf(published!.profiles, 2);
      assert.isTrue(
        published!.profiles.every((profile) => profile.keywords.length > 0),
      );
      assert.isTrue(
        published!.profiles.every(
          (profile) => profile.representativeItemKeys.length > 0,
        ),
      );

      for (let index = 0; index < 21; index += 1) {
        const versionID = `profile-repository-prune-${index}`;
        extraVersionIDs.push(versionID);
        await connection.queryAsync(
          `INSERT INTO profile_versions (
            profile_version_id, corpus_fingerprint, algorithm_config_json,
            generation_id, creation_reason, status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            versionID,
            `fingerprint-${index}`,
            "{}",
            generation.generationID,
            "prune-test",
            "archived",
            `2026-08-${String(1 + (index % 9)).padStart(2, "0")}T00:00:00.000Z`,
          ],
        );
      }
      const deleted = await profileRepository.pruneOldVersions(20, [
        extraVersionIDs[20],
      ]);
      assert.equal(deleted, 1);
      assert.equal(
        await connection.valueQueryAsync(
          "SELECT 1 FROM profile_versions WHERE profile_version_id = ?",
          extraVersionIDs[20],
        ),
        1,
      );
    } finally {
      await connection.queryAsync(
        "DELETE FROM profile_versions WHERE profile_version_id = ? OR profile_version_id IN (" +
          extraVersionIDs.map(() => "?").join(",") +
          ")",
        [build.versionId, ...extraVersionIDs],
      );
      await connection.queryAsync(
        "DELETE FROM embedding_generations WHERE generation_id = ?",
        generation.generationID,
      );
    }
  });
});
