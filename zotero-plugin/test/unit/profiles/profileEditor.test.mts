import assert from "node:assert/strict";
import test from "node:test";
import {
  ProfileEditor,
  type ProfileOverlay,
} from "../../../src/domain/profiles/profileEditor.ts";

const overlay: ProfileOverlay = {
  lineageId: "lineage-doc",
  userName: "",
  keywords: [],
  weight: 1,
  locked: false,
  disabled: false,
  includeItemKeys: [],
  excludeItemKeys: [],
  structureOperations: [],
};

test("edits are overlay-only and do not mutate system profile versions", () => {
  const editor = new ProfileEditor();
  const updated = editor.editOverlay(overlay, {
    userName: "我的文档智能",
    keywords: ["OCR", "document parsing"],
    weight: 1.4,
    locked: true,
    disabled: true,
  });

  assert.equal(updated.userName, "我的文档智能");
  assert.deepEqual(updated.keywords, ["OCR", "document parsing"]);
  assert.equal(updated.weight, 1.4);
  assert.equal(updated.locked, true);
  assert.equal(overlay.userName, "");
  assert.equal(
    editor.visibleProfiles([{ disabled: false }, { disabled: true }]).length,
    1,
  );
});

test("merge and split return previews and only confirmation creates an operation", () => {
  const editor = new ProfileEditor();
  const merge = editor.previewMerge([
    { lineageId: "a", name: "A", memberItemKeys: ["1", "2"] },
    { lineageId: "b", name: "B", memberItemKeys: ["2", "3"] },
  ]);
  assert.deepEqual(merge.memberItemKeys, ["1", "2", "3"]);
  assert.equal(merge.confirmed, false);
  const confirmed = editor.confirmStructureOperation(overlay, merge);
  assert.equal(confirmed.structureOperations.length, 1);

  const split = editor.previewSplit(
    { lineageId: "a", name: "A", memberItemKeys: ["1", "2", "3"] },
    [["1", "2"], ["3"]],
  );
  assert.deepEqual(split.groups, [["1", "2"], ["3"]]);
  assert.equal(
    editor.validateManualProfile({
      name: "",
      keywords: [],
      representativeItemKeys: [],
    }).ok,
    false,
  );
  assert.equal(
    editor.validateManualProfile({
      name: "A",
      keywords: ["x"],
      representativeItemKeys: [],
    }).ok,
    true,
  );
});
