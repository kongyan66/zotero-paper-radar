import { assert } from "chai";
import { detectDuplicate } from "../../src/infrastructure/zotero/duplicateDetector";

describe("duplicate detector", function () {
  it("keeps title-year differences separate in the Zotero host runtime", function () {
    const result = detectDuplicate(
      { title: "Same Title", date: "2026-01-01" },
      [{ itemKey: "old", title: "Same Title", date: "2025-01-01" }],
    );
    assert.equal(result.status, "none");
  });
});
