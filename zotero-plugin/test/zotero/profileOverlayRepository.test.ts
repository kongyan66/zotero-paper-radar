import { assert } from "chai";
import { config } from "../../package.json";
import { ProfileEditor } from "../../src/domain/profiles/profileEditor";
import { ProfileOverlayRepository } from "../../src/infrastructure/storage/profileOverlayRepository";
import type { PluginDatabase } from "../../src/infrastructure/storage/pluginDatabase";

interface OverlayTestAddon {
  data: { database?: PluginDatabase };
}

describe("profile overlay repository", function () {
  it("persists user edits separately from generated profiles", async function () {
    const database = (
      Zotero[config.addonInstance] as unknown as OverlayTestAddon
    ).data.database!;
    const repository = new ProfileOverlayRepository(
      database,
      () => new Date("2026-08-27T11:00:00.000Z"),
    );
    const editor = new ProfileEditor();
    const initial = {
      lineageId: "overlay-test",
      userName: "",
      keywords: [],
      weight: 1,
      locked: false,
      disabled: false,
      includeItemKeys: [],
      excludeItemKeys: [],
      structureOperations: [],
    } as const;
    const updated = editor.addItem(
      editor.editOverlay(initial, {
        userName: "手工画像",
        keywords: ["OCR"],
        locked: true,
      }),
      "ITEM-1",
      "include",
    );
    try {
      await repository.save(updated);
      const loaded = await repository.get(updated.lineageId);
      assert.deepEqual(loaded, updated);
    } finally {
      await database.connection!.queryAsync(
        "DELETE FROM profile_overlays WHERE lineage_id = ?",
        updated.lineageId,
      );
    }
  });
});
